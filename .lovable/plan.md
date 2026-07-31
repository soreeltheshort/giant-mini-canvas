## Supply Rules Update

Four rule changes, wired end-to-end.

### 1. Resupply reach: grid OR half map-speed from an owned planet

A fleet may replenish if either:
- its hex is in the faction's supply grid (current rule), **or**
- it is within `floor(slowest ship map_speed / 2)` hexes of any planet the faction owns (same helper already used for attack range: `attackRangeFromMapSpeed` in `src/lib/fleetRange.ts`).

New shared helper `canFleetResupply(fleetHex, fleetMapSpeed, ownedSystemHexes, supplyGrid)` in `src/lib/supplyGrid.ts` so the turn processor and the UI use identical logic. Rejection log gains the reason `out_of_supply_and_out_of_planet_range`.

### 2. Supply-built fighters + free transfer between in-supply points

- Building strikecraft from fleet supply already works (`build_strikecraft`); it will additionally require the fleet to satisfy the same eligibility test above (currently ungated).
- Strikecraft produced at a planet that is **in supply** may be sent to any friendly fleet that is **also in supply**, ignoring the 4-hex delivery limit, and arrive the turn they are built. Capacity limits still apply (a carrier's free fighter/gunship slots, counting existing + queued + in-transit), and the existing overflow-refund backstop stays. Out-of-supply producer or out-of-supply destination falls back to the current 4-hex rule.
- Enforced in `BuildShipsDialog.tsx` (target list + validation messages) and re-checked in `shipProduction.ts` at delivery time.

### 3. Supply state is locked at start of turn

A fleet is in supply if it was in supply at the *start* of the turn, even if it moves out later. The economy phase already runs before movement and reads pre-move hex coordinates, so this holds today — the plan adds an explicit comment plus a captured `startOfTurnSupplyOk` flag reused by the strikecraft-delivery check later in the same turn, so a mid-turn move can't invalidate an already-granted resupply.

### 4. Auto-resupply by default

- New column `fleets.auto_resupply boolean NOT NULL DEFAULT true`.
- Fleet detail panel: a toggle above the supply slider. When ON (default) the slider is preset to maximum (top-off) and the order is auto-written each turn; the player can still drag it down. When OFF no replenish order is generated.
- Turn processor: for every eligible fleet with `auto_resupply = true` that has no explicit `replenish_supply` order, the economy phase generates a top-to-max replenishment and charges the treasury at `supply_cost_coefficient`. Logged as `supply_replenished` with `source: "auto"`.

### Technical notes

- Migration: single `ALTER TABLE public.fleets ADD COLUMN auto_resupply boolean NOT NULL DEFAULT true;` (no new grants needed).
- Files touched: `src/lib/supplyGrid.ts`, `src/lib/turnProcessor/phases/economy.ts`, `src/lib/turnProcessor/phases/shipProduction.ts`, `src/components/game-shell/FleetDetailContent.tsx`, `src/components/game-shell/BuildShipsDialog.tsx`, `src/pages/FleetBuilder.tsx` (persist the flag on templates), and the `supply-grid` manual page.
- Owned-planet hex set is derived once per faction per turn from `mapState.systems` — cheap, no extra queries.

### Test plan

- **T1 Reach** — T1.1 Fleet in province: replenishes. T1.2 Fleet 2 hexes from an owned planet, speed 4 (half = 2), outside grid: replenishes. T1.3 Same fleet 3 hexes away: rejected with log. T1.4 Speed-0 fleet outside grid: rejected.
- **T2 Fighters** — T2.1 Build fighters from fleet supply while eligible: succeeds, supply debited. T2.2 Same fleet ineligible: rejected + logged. T2.3 In-supply planet → in-supply fleet 20 hexes away: arrives same turn. T2.4 Same but destination out of supply: blocked in dialog, 4-hex rule applies. T2.5 Overflow beyond carrier capacity: refunded.
- **T3 Start-of-turn lock** — T3.1 Fleet starts in supply, ordered to move far out: still resupplies this turn. T3.2 Fleet starts out of supply, moves into supply: no resupply until next turn.
- **T4 Auto-resupply** — T4.1 New fleet defaults to ON, slider at max, tops off with no manual order. T4.2 Toggle OFF: no order, no charge. T4.3 Toggle ON but slider dragged down: only the chosen amount is drawn. T4.4 Auto-resupply on an ineligible fleet: skipped silently (no charge).

### Out of scope

- AI awareness of the new reach rule (AI keeps current behaviour).
- Attrition or penalties for operating out of supply.
