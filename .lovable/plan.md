## Goal

Instead of restoring snapshots in-place (overwriting the current game), let snapshot loads **fork a new Game** so the original is preserved. Each fork shows clear lineage (which game + which snapshot it came from) and branches are easy to find again during heavy testing.

## Naming scheme

Every game has a `name` and a derived `branch_label` that captures lineage:

- Original game: `Game050`
- Fork from Game050's snapshot "SS04": `Game050:SS04`
- Fork from that branch's snapshot "SS07": `Game050:SS04:SS07`
- A second fork from the same `Game050:SS04` snapshot SS07: `Game050:SS04:SS07 (b)`, then `(c)`, etc.

The colon chain always traces back to the root, so any depth of re-branching is unambiguous.

## Data model

Add two columns to `games`:

- `parent_game_id uuid` — the game this was forked from (null for originals)
- `parent_snapshot_id uuid` — the snapshot row that seeded this fork
- `forked_at timestamptz` — when the fork was created (drives "most recent" sorting)

No change to `game_snapshots`. Snapshots remain point-in-time captures of a game.

## Fork flow (replaces "Restore")

On the Admin Games → Snapshots list, the action becomes **Fork from snapshot**:

1. Copy `map_data_json` + `turn_number` from the snapshot into a brand-new `games` row.
2. Set `parent_game_id`, `parent_snapshot_id`, `forked_at = now()`.
3. Compute `name` from parent's name + snapshot label, appending `(b)`, `(c)`, ... if that exact name already exists.
4. Re-create the dependent per-game rows the snapshot needs (game_fleets, game_factions, etc.) the same way "Load snapshot" does today, but pointed at the new game id.
5. Navigate to the new game.

The old in-place "Restore" is removed so originals are never overwritten.

## Games list UX (under /admin/games)

Reorganize the list to make branches obvious and recency scannable:

- **Group by root game.** Each root (no parent) is a top-level row; its descendants render indented underneath, sorted by `forked_at desc`.
- Each branch row shows: branch name, parent → snapshot label, turn number, `forked_at` ("3m ago"), and a "Last opened" timestamp.
- **"Recent branches" panel** at the top of /admin/games: flat list of the 10 most recently forked or opened branches across all roots, so during testing the latest fork is always one click away.
- Filter chip: "Originals only / Include branches".
- A small "SS" badge on every forked row; tooltip shows the full lineage chain.

## Snapshots sub-page

Keep `/admin/games` as the lineage-aware games browser. Add `/admin/games/snapshots` as a dedicated **Snapshots** page (linked from the Games header) that lists every snapshot across every game with: game name, turn, label, created_at, and a **Fork** button. This is the heavy-use surface during testing.

## Technical notes

- Migration: add `parent_game_id`, `parent_snapshot_id`, `forked_at`, `last_opened_at` to `public.games` with appropriate FKs (`on delete set null` so deleting a parent doesn't cascade-destroy branches). Index `(parent_game_id)` and `(forked_at desc)`.
- Update `last_opened_at` whenever a game is opened in `/play/:gameId` or `/admin/games`.
- Branch-name collision handling lives in a small helper that queries existing names with the same prefix and picks the next `(letter)` suffix.
- `loadSnapshot` in `AdminGames.tsx` is replaced by `forkFromSnapshot`; the existing per-game materialization logic (fleets, factions) is reused against the new game id.
- Routes: add `/admin/games/snapshots` → new `AdminSnapshots.tsx` page. `/admin/games` keeps the grouped tree view.

## Out of scope

- No changes to how snapshots are *saved* — same button, same table.
- No merging branches back together.
- No UI for renaming auto-generated branch names (can be added later if needed).
