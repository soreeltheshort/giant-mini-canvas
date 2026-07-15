## Problem

Vesta Line has a facility with `ground_defense_bonus ≥ 1`, but the Garrison card reads `system.max_ground_defenses` directly — a stored value that's only recomputed inside `processNextTurn` (turnEngine.ts, Step 3). Between turns the display can lag arbitrarily behind the current facility list. There is also no population-based baseline: an inhabited planet with no defense facility currently shows a max of 0.

## New rule

`max_ground_defenses = floor(current_population / 20) + Σ (facility.ground_defense_bonus × quantity)`

- Baseline comes from population (1 unit per 20 inhabitants, floored).
- Facilities are additive on top.
- Uninhabited planets (`current_population = 0`) get a baseline of 0.

## Fix

### 1. Live display — `src/components/game-shell/GarrisonCard.tsx`
- Accept optional `facilityTypes?: DbFacilityType[]` (from `@/hooks/useFacilityTypes`).
- Compute `figuredMax = floor(system.current_population / 20) + Σ ft.ground_defense_bonus × f.quantity` (match facility types by `String(id)` like `findFT` does).
- Use `figuredMax` for the readout, progress bar, tooltip, and the `canRecruit` check.
- Fallback to `system.max_ground_defenses` only when `facilityTypes` is missing.
- Update the tooltip text to reflect the population baseline + facility bonuses.

### 2. Wire the prop
- `src/components/game-shell/LeftPanel.tsx` — `InlineSystemDetail`: pass `facilityTypes={gameData.facilityTypes}` to `GarrisonCard` (~line 1052).
- `src/components/game-shell/ContextPanel.tsx`: same at line 529 for parity.

### 3. Turn engine — `src/lib/turnEngine.ts`
- Change `calculateMaxGroundDefenses` (or inline the change in `processNextTurn` Step 3) to add `Math.floor(planet.current_population / 20)` to the facility sum. This keeps auto-replenishment and stored `max_ground_defenses` in sync with the new formula after each Next-Turn.
- Uses `planet.current_population` AFTER the population step (Steps 5–6), so growth on turn N raises the ceiling on turn N.

No DB migration or RPC change. The stored `max_ground_defenses` field remains — the turn engine keeps refreshing it; the UI just no longer trusts it as the source of truth between turns.

## Out of scope

- Backfilling stored `max_ground_defenses` for existing systems (turn engine will overwrite on next Next-Turn).
- Making the divisor (20) configurable — hardcoded for now, alongside the other constants in the engine.
- Changing recruit cost, upkeep, or ground-force replacement math beyond consuming the new max.
- Any planet-type or faction modifier to the baseline.
