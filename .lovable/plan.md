# Scuttle Ships Are Off-The-Books

Ships assigned to the Scuttle tactical group should behave, for every UI and gameplay purpose, as if they were already gone. No capacity checks against them, no contribution to the fleet's map speed / attack range / maintenance / repair / supply / ground invasion / strikecraft counts, no upkeep charged for the last turn. They only exist to be deleted before movement (already implemented) and to fight as Rear if combat happens first (already implemented).

## What changes

**Capacity checks (submission-blocking)**
- `computeGroupStrikecraftCapacity` will skip any row whose `tactical_group === "Scuttle"`. Scuttle ships never generate a fighter/gunship over-capacity issue, and the Scuttle lane never renders a `FI x/y` / `GS x/y` badge.

**Fleet Detail derived stats**
- The main stat-aggregation loop in `FleetDetailContent.tsx` (starts near line 507) will `continue` on Scuttle rows. That removes them from:
  - `baseMaintenance` (displayed maintenance)
  - `minMapSpeed` (fleet map speed)
  - `minRawAttackSpeed` (attack range)
  - `totalRepair` / `availableRepair`
  - `totalSupply`
  - `fighterCap` / `fighterUsed` / `gunshipCap` / `gunshipUsed` / `fighterStorage` / `gunshipStorage`
  - `maxGroundInvasion`
- Result: the moment a ship is dropped into the Scuttle lane, every fleet stat re-renders as if the ship were not in the roster.

**Player attack-range validation**
- The submission-issues effect in `PlayerGame.tsx` (line ~905) will skip Scuttle rows when computing `speedByFleet`, so a slow Scuttle ship never shortens attack range.

**Turn processing (maintenance)**
- Economy phase (`phases/economy.ts` fleet-maintenance block near line 143) will fetch `tactical_group` too and exclude Scuttle rows from the fleet-maintenance sum. No last-turn upkeep is charged on ships that will be removed this same turn.

## Out of scope

- FleetBuilder (saved-template screen) totals stay as-is — Scuttle is a strategy slot there, and the saved template is not a live fleet.
- Combat treatment unchanged: Scuttle ships still fight as Rear this turn via the existing `battleSetup` normalization.
- No schema changes.

## Files touched

- `src/components/game-shell/FleetCompositionEditor.tsx` — skip Scuttle in `computeGroupStrikecraftCapacity`.
- `src/components/game-shell/FleetDetailContent.tsx` — skip Scuttle in the main aggregation loop.
- `src/pages/PlayerGame.tsx` — skip Scuttle when building `speedByFleet`.
- `src/lib/turnProcessor/phases/economy.ts` — exclude Scuttle rows from fleet maintenance.
