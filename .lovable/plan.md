
# Supply Grid System

## Concept

A per-faction **supply grid** is the set of hexes that count as "in supply" for that faction on the current turn.

A hex is in supply for faction F if any of these are true:
1. The hex's `classification` matches F's province (Core / Province_1..6). *Province hexes are always in supply.*
2. The hex is within `supply_range` (hex distance) of a planet F owns that contains a facility with `supply_range > 0`. Largest `supply_range` on a given planet wins; multiple planets each project their own radius (union).

This replaces the current "must be on an owned planet to replenish" rule with a general test: **the fleet's current hex must be in F's supply grid**.

## Rules changed / added

- **Replenish supply**: allowed anywhere in the supply grid, not just on an owned planet.
- **Build facility**: target planet's hex must be in the supply grid — enforced in UI (disabled with tooltip) and at turn processing (rejected + logged).
- **Supply-required facilities** (new flag `requires_supply`, default true): cannot be built out of supply. Admins can uncheck for pioneer facilities.
- **Supply-emitting facilities** (new field `supply_range`): extend the grid by that many hexes from the planet they sit on.

## Deliverables

1. **Migration**
   - `facility_types.supply_range integer NOT NULL DEFAULT 0`
   - `facility_types.requires_supply boolean NOT NULL DEFAULT true`
2. **`src/lib/supplyGrid.ts`** (new): `computeSupplyGrid(factionKey, systems, hexes, facilityTypes) → Set<string>`; `isHexInSupply(x, y, grid)`.
3. **`src/lib/turnProcessor/phases/economy.ts`**: compute grid per faction; gate `replenish_supply` and `build_facility` on it; log rejections.
4. **`src/pages/AdminFacilities.tsx`**: `supply_range` input + `requires_supply` checkbox.
5. **Player UI**: `FleetDetailContent.tsx` swaps `atOwnedPlanet` for `inSupplyGrid`; `ContextPanel.tsx` disables out-of-supply build rows; `PlayerGame.tsx` memoizes the current player's grid.
6. **Map indicator** in `PlayerMapCanvas.tsx`: bronze outline along edges where in-supply hexes border out-of-supply hexes.

## Documentation deliverables (this turn)

- **Manual entry** — insert a new `wiki_pages` row with slug `supply-grid`, title "Supply Grid", sort_order 13, explaining: what counts as in-supply (province + emitter radii, largest-wins per planet, union across planets), what the grid gates (replenish, facility construction, supply-required facilities), and the map border indicator.
- **Developer notes** — append a new section **"Supply Grid System"** to `.lovable/plan.md` capturing: schema fields, `supplyGrid.ts` API, gating call sites in `economy.ts`, UI wiring path (`PlayerGame → ContextPanel/FleetDetailContent`), map render pass description, and the T1–T5 hierarchical test plan below.

## Technical notes

- Union-of-radii is cheap on 141×141 with a handful of emitters — recompute on player load / after each turn.
- Border render: for each in-supply hex, draw only the edges shared with an out-of-supply neighbor (or map edge). Uses existing pointy-top odd-r neighbor helpers.
- Migration alters an existing table; no new grants needed.

## Test plan (hierarchical)

- **T1 Schema** — T1.1 `supply_range` exists, defaults 0. T1.2 `requires_supply` exists, defaults true.
- **T2 Grid computation** — T2.1 No supply facilities → grid = province only. T2.2 Radius-3 emitter on owned Marches planet → ring-3 added. T2.3 Two emitters → union.
- **T3 Replenish** — T3.1 In province, works. T3.2 Owned Marches planet w/o emitter → REJECTED (behavior change; verify log). T3.3 After emitter built → works.
- **T4 Build gating** — T4.1 Province planet build → allowed. T4.2 Out-of-supply owned planet → UI disabled + turn-time rejection logged. T4.3 `requires_supply=false` facility → allowed anywhere owned.
- **T5 Map indicator** — T5.1 Border along province edge on fresh game. T5.2 Border expands after emitter build + turn advance.

## Out of scope

- AI awareness of supply grid (deferred to Phase 2c).
- Movement penalties out of supply.
- Ship-build / ground-draft supply gating.
