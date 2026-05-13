## Ship Production Queues + Destination Routing + Virtual Transit

### Goal

When a player builds a ship, they pick a destination fleet or planetary garrison. Each turn the shipyard advances the queue. Completed ships either join the destination fleet immediately (if it's within their map_speed) or enter a **virtual in-transit fleet** that moves map_speed hexes/turn toward the target until it arrives. Strikecraft (fighters/gunships) can only target fleets/garrisons within 2 hexes of the producing system.

---

### Data model

**1. New columns on `facility_types`** (only meaningful for ship-building facilities):
- `ship_build_capacity int default 0` — points of ship hull a single facility can construct per turn.
- We will set initial values via the admin UI / a seed update so the largest shipyard tier × 2.5 turns ≥ largest ship's `point_cost`.

**2. New table `system_ship_production`** — the per-system build queue.
- `id uuid pk`
- `game_id uuid`, `system_id int`, `position int` (queue order)
- `ship_type_id uuid`, `quantity int` (will be expanded to one row-per-ship internally; for the queue we keep stack-of-N for compactness)
- `destination_fleet_id uuid` (FK to `game_fleets.id`, nullable — null means "create new fleet on completion")
- `points_remaining int` — starts at `ship_type.point_cost × quantity`, decremented each turn by total `ship_build_capacity` of the system's shipyards (cascading down the queue head)
- `cost_paid int` — upfront ₡ already deducted (for refund-on-cancel)
- `created_at`

**3. New table `ships_in_transit`** — virtual fleet that doesn't appear on the map.
- `id uuid pk`
- `game_id uuid`, `owner_classification text`
- `ship_type_id uuid`, `quantity int`
- `destination_fleet_id uuid` (FK `game_fleets.id`)
- `virt_x int`, `virt_y int` — purely virtual coordinates; never rendered, never used for combat/visibility/upkeep
- `origin_system_id int` (for "Target lost → reroute to nearest owned garrison")
- `created_turn int`

RLS mirrors the existing `game_fleets` patterns (owner / admin / tester).

**4. No change to `game_fleets.is_garrison`** — garrisons are already valid destinations.

---

### Validation rules (UI + server)

- **Strikecraft destinations**: `BuildShipsDialog` filters available destinations to fleets/garrisons within `cubeDistance ≤ 2` of the producing system's hex. If the player later edits the destination of a queued strikecraft to one outside 2 hexes, the change is rejected.
- **Other ships**: any owned fleet or garrison is selectable. If the destination is currently within the ship's `map_speed` of the system, ship will spawn directly into the fleet. Otherwise it enters virtual transit.
- **Editing while queued**: destination can be changed any time before the build completes (writes to `system_ship_production.destination_fleet_id`).

---

### Turn engine — new phase: `ship_production`

Runs after `economy` (so income is settled) and before `movement` (so newly-spawned ships participate in player view of next turn). Algorithm:

1. For each system the player owns, compute total `ship_build_capacity` from built shipyards.
2. Walk `system_ship_production` rows in `position` order; subtract capacity from `points_remaining` head-first until capacity is exhausted.
3. For each row that hits 0:
   - Resolve current `destination_fleet_id` and its hex.
   - If destination missing → reroute to nearest owned garrison; if none, hold (stay queued).
   - Compute distance from producing system's hex to destination.
   - If `distance ≤ ship_type.map_speed` → insert into `game_fleet_ships` of destination fleet (Core group).
   - Else → insert row into `ships_in_transit` with `virt_x/virt_y` = system hex.
   - Log `ship_built` with `arrival: immediate | in_transit`.
4. Advance every `ships_in_transit` row by `ship_type.map_speed` hexes toward the **current** position of `destination_fleet_id`.
   - On arrival (distance = 0) → move ships into `game_fleet_ships` and delete the transit row. Log `ship_arrived`.
   - If destination missing → reroute to nearest owned garrison; if none, hold position. Log `transit_rerouted` / `transit_stranded`.

In-transit ships do **not** appear in `mapState.fleets`, contribute no maintenance, and are skipped by visibility/combat phases.

---

### UI

- **`BuildShipsDialog`**:
  - Wire the existing `onConfirm` to write `system_ship_production` rows (deduct ₡ upfront; create one row per ship-type/destination combo).
  - Filter destination dropdown for strikecraft to within-2-hex fleets only.
  - Show estimated turns-to-build per item using the producing system's `ship_build_capacity` total.
- **System Production panel** (LeftPanel + ContextPanel right under "Production Queue"): add a new "Ships in Production" list with per-row destination dropdown (editable until completion), reorder ▲▼, and cancel × (refunds remaining ₡).
- **Fleet detail panel** (`FleetDetailContent`): new "Incoming Ships" section listing each `ships_in_transit` row whose destination is this fleet, with `ETA = ceil(distance(virt, fleet) / ship_type.map_speed)` turns. Garrison cards get the same section.
- Player Garrison view (`GarrisonCard`) already exists — add the same Incoming Ships block.

---

### Edge cases

- **Target fleet destroyed**: server reroutes both queued items (changes `destination_fleet_id`) and in-transit rows to the nearest owned garrison; falls back to hold + log if no garrison exists.
- **Fleet moves**: virtual transit recomputes step-toward each turn against the fleet's current hex, so it tracks moving fleets.
- **Refund on cancel**: cancelling a queue row credits back `cost_paid` and any partial completion is forfeited.
- **Capacity overflow**: leftover shipyard capacity in a turn does not bank — use it or lose it.

---

### Files affected

- New migration: `facility_types.ship_build_capacity`, table `system_ship_production`, table `ships_in_transit`, RLS policies, indexes.
- New: `src/lib/turnProcessor/phases/shipProduction.ts`; register in the phase pipeline.
- `src/components/game-shell/BuildShipsDialog.tsx` — add 2-hex strikecraft filter, ETA hint.
- `src/components/game-shell/ContextPanel.tsx` + `LeftPanel.tsx` — wire `onConfirm` (insert rows, deduct ₡), add "Ships in Production" editor.
- `src/components/game-shell/FleetDetailContent.tsx` + `GarrisonCard.tsx` — Incoming Ships section.
- `src/pages/AdminFacilities.tsx` (or wherever facility types are edited) — surface `ship_build_capacity` field.
- Seed update via insert tool to set initial `ship_build_capacity` values consistent with the 2.5-turn-largest-ship rule.
