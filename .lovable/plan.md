## Goal

Make AI Configuration Inspector show accurate per-turn history for **test-mode games**, while non-test games keep the current "latest snapshot only" behavior (admin can only inspect the current turn).

## Root cause (recap)

`ai_world_beliefs` has `UNIQUE(player_id, belief_key)`. The threat-assessment phase upserts on that key every turn, so each new turn overwrites the prior row in place. The inspector then reconstructs "previous turns" with `.lte(turn_number, turn).order(... desc).limit(1)`, which silently returns 0 once the row's `turn_number` has been bumped past the selected turn.

## Changes

### 1. Schema (migration)

- Add `games.is_test_mode boolean NOT NULL DEFAULT false`.
- On `ai_world_beliefs`:
  - Drop `UNIQUE(player_id, belief_key)`.
  - Add `UNIQUE(game_id, player_id, belief_key, turn_number)` so the same belief can be appended once per turn per player per game.
  - Add index `(game_id, player_id, belief_key, turn_number DESC)` for fast "latest" lookups.

No data migration needed — existing rows remain valid under the new unique key.

### 2. Threat assessment phase (`src/lib/turnProcessor/phases/threatAssessment.ts`)

- Read `games.is_test_mode` once at phase start.
- If `is_test_mode === true`: append per-turn rows. Use `upsert` on the new 4-column conflict target so re-running a turn is still idempotent.
- If `is_test_mode === false`: keep current behavior — one row per `(player, belief_key)` that is overwritten each turn. Implement this by deleting prior rows for that `(game_id, player_id, belief_key)` before inserting the new one (since the old 2-column unique is gone).
- Baseline rows (`*_baseline`) follow the same rule.

### 3. AI Admin Game Settings UI (`src/pages/AdminAIConfig.tsx` or wherever the game is selected for the inspector)

- Add a "Test mode (retain per-turn AI history)" toggle on the game row. Writes `games.is_test_mode`.

### 4. AI Inspector (`src/components/admin/ai/AIInspector.tsx`)

- Fetch `games.is_test_mode` for the selected game.
- Threat-assessment section:
  - If test mode: query the exact `turn_number = turn` rows. If none exist for that turn, render "No data recorded for turn N" (not 0).
  - If not test mode: hide the turn selector for this section and label it "Current turn only — enable test mode to retain history". Only show the most recent row.
- Same treatment for any other section in the inspector that currently relies on `.lte(turn_number, turn)` against `ai_world_beliefs`.

### 5. Backfill note

Prior to this change, only the latest snapshot exists in `ai_world_beliefs`. For Test050 turn 17 specifically, the historical data is gone and cannot be recovered. From the next processed turn forward, history will accumulate.

## Out of scope

- Other AI tables (`ai_goals`, `ai_plans`, `ai_relationships`, …). They have their own history semantics; this plan only fixes `ai_world_beliefs` per the reported symptom.
- Pruning/retention of old belief rows in test games — can be added later if the table grows.
