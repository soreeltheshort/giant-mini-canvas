## Goal

Merge the two "garrison" concepts into one Planet Details panel that shows current status, threats, and controls, and give ground defenses a per-turn upkeep cost.

## Changes

### 1. Rework `GarrisonCard` into a unified panel

File: `src/components/game-shell/GarrisonCard.tsx`

The card takes `gameId`, `systemId`, plus new props: the live `SystemData` from `mapState`, the owning `player` (for treasury / capability checks), `testMode`, and write callbacks.

Displayed sections (top to bottom):

1. **Ground Defenses** — `current_ground_defenses` / `max_ground_defenses`, with a progress bar and an "Upkeep: N cr/turn" line.
   - Buttons: **Recruit +1** (cost = `ground_force_replacement_cost`, only if `current < max`, deducts treasury) and **Disband -1** (refunds 0, only if `current > 0`).
   - In test mode: raw input fields for current/max (existing test editor moves here so we have a single garrison surface).
2. **Stationed Ships (Garrison Fleet)** — existing ship list from `game_fleet_ships` for the `is_garrison=true` fleet.
   - If the fleet row is missing, call `ensure_game_garrisons(_game_id)` RPC on mount and re-query, so Dravian and any other post-hoc systems get initialized instead of showing "not yet initialized".
3. **Invaders in Orbit** — enumerate `mapState.fleets` whose `hex_x/hex_y` match this system's hex AND whose `owner_classification` differs from this system's owner. Show fleet name, owner, and (if known) ground-invasion capacity. Purely informational — resolution stays in the ground-combat phase.

Non-owner viewers see everything read-only. Test mode grants edit rights regardless of ownership.

### 2. Wire the panel into `LeftPanel.tsx`

`InlineRegionDetail` currently renders `GarrisonCard` for real systems and, separately, a `SystemTestEditor` with garrison inputs. Consolidate:

- Remove the garrison block from `SystemTestEditor` (facility editing stays there).
- Always render the new `GarrisonCard`, passing `testMode`, `onTestSetGarrison`, and new `onRecruitGarrison` / `onDisbandGarrison` callbacks.

### 3. New player-facing garrison actions

File: `src/pages/PlayerGame.tsx`

Add `handleRecruitGarrison(systemId)` and `handleDisbandGarrison(systemId)`:
- Recruit: check `system.current_ground_defenses < system.max_ground_defenses` and player treasury ≥ `ground_force_replacement_cost`; deduct from `game_factions.treasury`; increment `current_ground_defenses`; persist via the same `writeSystemEdit` path plus a `game_factions` update; log a `player_action` row.
- Disband: decrement `current_ground_defenses` (min 0); no refund; log.

These wrap the existing serialization/write flow — no new schema.

### 4. Ground-defense upkeep (1 credit per unit per turn)

Files: `src/lib/turnEngine.ts`, `src/lib/turnProcessor/phases/economy.ts`

- Extend `TurnConstants` with `ground_defense_maintenance: number` (default `1`).
- In `processNextTurn`, add `groundDefenseMaintenance = current_ground_defenses * constants.ground_defense_maintenance` to `upkeepBreakdown` and include it in `totalUpkeep`. Deducted from player treasury the same way facility maintenance already is (economy phase already sums `p.upkeep`).
- Surface the new line in the `TestModePanel` / economy previews only where the breakdown is already shown; no new UI otherwise.

No migration — constants live in code (existing `DEFAULT_TURN_CONSTANTS` pattern).

### 5. Missing-garrison-fleet self-heal

`ensure_game_garrisons` already exists and is idempotent. `GarrisonCard` will call it once when it finds no `is_garrison` row for the system, then re-query. This addresses Dravian and any future system that predates its garrison row.

## Out of scope

- Building/scrapping ships inside the stationed garrison fleet (separate feature — the existing ship-production flow handles this at the system level).
- Configurable per-unit upkeep value in the admin UI (constant lives in code; can be exposed later).
- Any change to how ground combat resolves.

## Files touched

- `src/components/game-shell/GarrisonCard.tsx` (rework)
- `src/components/game-shell/LeftPanel.tsx` (consolidate, drop garrison inputs from `SystemTestEditor`)
- `src/pages/PlayerGame.tsx` (new recruit/disband handlers, pass through)
- `src/lib/turnEngine.ts` (constant + upkeep line)
- `src/lib/turnProcessor/phases/economy.ts` (ensure new upkeep flows through)
