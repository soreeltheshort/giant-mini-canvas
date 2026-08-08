# Contiguous Supply Grid

Today a faction's supply grid is a plain union: every province hex, plus a radius around every owned planet/starbase with a supply-emitting facility — no matter where that planet sits. A captured or isolated outpost still projects supply as an island, and losing a link in the chain does not orphan anything downstream.

New rule: each player has exactly **one contiguous supply grid, rooted in their province**. An emitter only counts if it is itself in supply through an unbroken chain back to the province. Lose a planet or starbase in the middle of a chain and everything beyond it drops off the grid until the connection is re-established.

## How it will work

1. **Seed** — all hexes classified as the player's province start in supply (unchanged).
2. **Grow** — repeatedly look at every owned planet/starbase with a supply-range facility. If that emitter's own hex is currently in supply, add all hexes within its supply range to the grid. Repeat until no new hexes are added.
3. **Result** — emitters that are not reachable from the province (or from another already-connected emitter) contribute nothing. Their hexes and any hexes they used to cover are simply not in the grid.

Effects that follow automatically because they already read the grid:
- Fleet resupply (the "within half map speed of an owned planet" fallback stays as-is).
- Facility construction gating (`requires_supply` facilities).
- Starbase founding candidate hexes.
- Strikecraft teleport delivery.
- The map supply border, which will now visibly retract when a chain is cut.

Starbases still only project supply once construction finishes (unchanged).

## Technical details

- Rewrite `computeSupplyGrid` in `src/lib/supplyGrid.ts` from a single-pass union into a fixpoint loop:
  - Build the province seed set as today.
  - Build the list of candidate emitters (owned, build complete, max facility supply_range > 0, with a known hex).
  - Loop: for each not-yet-activated emitter whose hex is in the grid, add its radius and mark it activated. Stop when a pass activates nothing.
  - Keeps the existing distance test (`offsetToCube` + `cubeDistance`); to avoid scanning all 141x141 hexes per emitter, enumerate offsets within the radius and look them up by `hexKey` instead.
- Signature, exports, and all call sites (`PlayerGame.tsx`, `economy.ts`, `shipProduction.ts`) stay unchanged.
- Extend `src/test/supplyGrid.province.test.ts` (or add a sibling file) with cases for: emitter adjacent to province extends the grid; a second emitter chained off the first extends it further; removing/unowning the middle emitter orphans the far one; an isolated owned emitter far from the province contributes nothing.
