
# Make Snapshots Fully Self-Contained

## Problem

Snapshots only store `map_data_json`. Ship rosters live in `game_fleet_ships` (per-game, mutable each turn) and faction/economy state lives in `game_factions`. Restore rewrites only the map JSON, so anything the game changed since the snapshot (troops loaded on Infectors, HP, treasury, points, intel, etc.) persists through the "restore" — the snapshot silently loses fidelity.

## Fix

Bake all mutable per-game state into the snapshot row, and rewrite Restore to fully replace it.

### 1. Schema — extend `game_snapshots`

Add nullable JSONB columns (nullable so old rows still load):

- `game_fleets_json` — full `game_fleets` rows for the game
- `game_fleet_ships_json` — full `game_fleet_ships` rows for the game
- `game_factions_json` — full `game_factions` rows for the game
- `player_system_intel_json` — full rows for the game
- `player_fleet_intel_json` — full rows for the game
- `player_orders_json` — outstanding orders at snapshot time
- `game_meta_json` — `{ turn_phase, ... }` small object for game-row fields beyond `turn_number` / `map_data_json`

No new tables, no policy changes (existing snapshot policies cover it).

### 2. Save path — `saveSnapshot` in `src/pages/AdminGames.tsx`

Before insert, fetch all of the above for `selectedGame.id` in parallel and include them in the insert payload alongside today's `map_data_json`, `turn_number`, `label`.

### 3. Restore path — `loadSnapshot` in `src/pages/AdminGames.tsx`

Replace the current single `games` update with a transactional-style sequence:

1. `DELETE FROM game_fleet_ships WHERE game_fleet_id IN (SELECT id FROM game_fleets WHERE game_id = :id)`
2. `DELETE FROM game_fleets WHERE game_id = :id`
3. `DELETE FROM player_system_intel / player_fleet_intel / player_orders WHERE game_id = :id`
4. `UPDATE game_factions` per snapshotted row (or delete+insert) — keep user_id/faction_id mapping intact
5. Insert snapshotted `game_fleets` rows **with their original ids** so `map_data_json.fleets[].fleet_id` still resolves
6. Insert snapshotted `game_fleet_ships` rows (disable the AFTER INSERT snapshot trigger for this operation, or use a raw insert path that bypasses it — see Technical Details)
7. Insert snapshotted intel + orders rows
8. `UPDATE games SET map_data_json = :map, turn_number = :turn, turn_phase = :phase`

If snapshot lacks the new JSON columns (legacy snapshots), fall back to today's behavior and toast a warning: "Legacy snapshot — ship rosters not restored."

### 4. Fork path — `src/lib/forkGameFromSnapshot.ts`

Currently re-materializes fleets from map JSON via the trigger. Update it to prefer snapshotted `game_fleets_json` / `game_fleet_ships_json` when present — insert with **new** UUIDs and rewrite `map_data_json.fleets[].fleet_id` to match. Fall back to current materialization for legacy snapshots.

### 5. UI

- Snapshot list: badge "Full" vs "Legacy (map only)" so the difference is visible.
- Confirm dialog on Restore already warns about overwrite; add one line: "Ship rosters, treasury, and intel will be restored."

## Technical Details

- `trg_game_fleets_snapshot_ships` fires `AFTER INSERT` on `game_fleets` and copies from the template `fleet_ships`. During Restore we don't want that — we're inserting authoritative rows. Two options:
  a. Add a `SET LOCAL session_replication_role = 'replica'` around the restore (requires an RPC — cleanest).
  b. Insert `game_fleets` first, then `DELETE FROM game_fleet_ships WHERE game_fleet_id IN (...)`, then insert the snapshotted `game_fleet_ships`. Simpler; two extra statements. Recommended.
- Keep snapshot payload size in check: skip `battle_runs` / `battle_phases` / `battle_events` / `game_logs` (history, not state).
- Migration must include `GRANT` matching existing `game_snapshots` grants for the new columns (columns inherit — no new grants needed, just noting).
- No changes to RLS.

## Files Touched

- New migration: add JSONB columns to `game_snapshots`
- `src/pages/AdminGames.tsx` — `saveSnapshot`, `loadSnapshot`
- `src/lib/forkGameFromSnapshot.ts` — prefer snapshotted rosters when present
- `src/pages/AdminSnapshots.tsx` — legacy badge (small)

## Out of Scope

- Snapshotting battle history, logs, AI planner state — those are append-only history, not point-in-time state.
- Auto-snapshot on turn processing (can be a follow-up).
