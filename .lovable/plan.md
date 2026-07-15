## Goal

Stop duplicate turn logs from piling up when a turn is processed more than once (either by re-running it, or by restoring/loading a snapshot and then reprocessing).

## Approach (Option B)

Before writing new logs for a turn, delete any existing logs for that (game_id, turn_number). Also, when a snapshot is restored in-place, wipe forward logs so stale future-turn entries from the abandoned timeline don't linger.

No schema changes. No snapshot payload bloat. One extra indexed DELETE per turn run.

## Changes

### 1. `src/lib/turnProcessor/index.ts`

In `runTurnProcessor`, immediately before the `logs.bulkInsert` step (and after all phases finish, so a mid-run failure doesn't wipe the previous good log until we're about to replace it), delete existing logs for the turn:

```ts
await perf.time("logs.deleteExisting", async () => {
  await (supabase as any)
    .from("game_logs")
    .delete()
    .eq("game_id", gameId)
    .eq("turn_number", currentTurn);
});
```

Then the existing bulk insert runs and writes the fresh set. Net effect: exactly one log set per (game, turn), always reflecting the most recent run.

Note: the `snapshot_restored` / `fork` marker logs written by `AdminGames.loadSnapshot` and `forkGameFromSnapshot` are keyed to the *snapshot's* turn number. Since restore is typically followed by re-running that turn, those marker logs would be wiped by the next run. That's acceptable — the audit trail for restore lives in `game_snapshots` itself. If we want to preserve them, we can move those markers to `turn_number = snapshot.turn_number - 1` or a sentinel, but leaving as-is is simpler and matches "log reflects current state of turn N."

### 2. `src/pages/AdminGames.tsx` — `loadSnapshot`

After the snapshot rows are re-inserted and `games.turn_number` is reset to `snapshot.turn_number`, delete any logs for turns strictly greater than the snapshot's turn (stale future-timeline entries):

```ts
await (supabase as any)
  .from("game_logs")
  .delete()
  .eq("game_id", gameId)
  .gt("turn_number", snapshot.turn_number);
```

This runs before the `snapshot_restored` marker log insert so the marker survives.

### 3. No change needed to `forkGameFromSnapshot.ts`

Forks already start with an empty `game_logs` for the new game (only the fork marker is inserted).

## Out of scope

- Preserving prior runs' logs for forensic diffing (that would be Option C).
- Copying logs into snapshot payloads (Option A).
- Any UI change to `TurnLogViewer` — with duplicates gone, the existing viewer just works.

## Performance

- Turn processing: one extra `DELETE ... WHERE game_id = ? AND turn_number = ?`. `game_logs` is already indexed on `game_id` (used by the existing viewer query); the extra filter on `turn_number` is a cheap in-memory filter on a small result set. Sub-millisecond in practice.
- Snapshot restore: one extra `DELETE ... WHERE game_id = ? AND turn_number > ?`. Runs once per manual restore action. Negligible.
- Snapshot save/load size: unchanged.
