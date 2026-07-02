# Admin Test Mode (In-Game)

A per-session toggle available to admins on any game. When ON, unlocks direct edits that bypass normal rules: teleport fleets, add/remove ships, set treasury and supply, add/remove facilities. Every edit writes a `game_log` entry so it's auditable.

## Toggle

- Small "TEST MODE" switch in the game header, visible only when `isAdmin === true`. Works whether or not `?asFaction=` is set.
- State lives in local React state on `PlayerGame` (session-only). Refresh = off.
- When OFF, the app behaves exactly as it does today. When ON, extra edit affordances appear with a crimson border/badge so it's obvious you're in Test Mode.

## Edits unlocked in v1

**Move fleet to any hex (teleport)**
- In Fleet Detail, a "Teleport" button under position enters a picker mode. Next map click sets `game_fleets.hex_x/hex_y`. Bypasses movement/orders entirely.

**Add / remove ships in a fleet**
- In Fleet Detail composition editor, a Test Mode row: ship-type picker + quantity + "Add", writes N `game_fleet_ships` rows into the Core group with full HP.
- Delete buttons on existing rows work regardless of ownership/lock state.

**Set treasury & supply**
- New "Test Mode" ImperialCard on the left panel (only when ON) with:
  - Treasury number input for the current player → updates `game_factions.treasury`.
  - Fleet dropdown + `current_supply` number input → updates `game_fleets.current_supply`.

**Add / remove facilities in a system**
- On System detail panel, Test Mode section: facility-type picker + "Add now" (writes directly to the systems JSON in `games.map_data_json`, marking it built this turn) and delete-X on existing facilities.

## Audit trail

Every Test Mode edit inserts a `game_logs` row with:
- `log_type = "test_mode_edit"`
- `phase = "admin"`
- `message`: human-readable ("TEST MODE: teleported Dravian Test to (12,7)", "TEST MODE: +5000 credits to Dravian", etc.)
- `details_json`: before/after values, admin user_id, target ids.

These show up in existing admin log views without changes.

## Security

- All Test Mode UI is gated on the client by `useAuth().isAdmin`.
- Server-side: relies on existing RLS. Admins already have update rights on `game_fleets`, `game_fleet_ships`, `game_factions`, and `games` via existing admin-scoped policies used by MapTesting / AdminGames. No new policies needed unless a check reveals a gap; if one is missing we add a targeted admin-only policy in a migration during build.
- No new secrets, no new endpoints. All writes go through the existing `supabase` client under the admin's session.

## Files touched (new + edited)

- **New**: `src/lib/testMode/testActions.ts` — thin wrapper functions (`teleportFleet`, `addShipsToFleet`, `removeFleetShip`, `setTreasury`, `setFleetSupply`, `addFacility`, `removeFacility`) that each perform the write + log entry.
- **New**: `src/components/game-shell/TestModePanel.tsx` — the left-panel card (treasury / fleet supply inputs).
- **Edited**: `src/pages/PlayerGame.tsx` — hosts `testMode` state, the header toggle (admin-only), passes `testMode` + action handlers down.
- **Edited**: `src/components/game-shell/FleetDetailContent.tsx` — Test Mode teleport button + add-ship row (visible only when `testMode` prop is true).
- **Edited**: `src/components/game-shell/FleetCompositionEditor.tsx` — accept `testMode` prop; when true, always allow row deletes.
- **Edited**: system detail component (currently rendered inside `InlineContextContent`) — Test Mode facility add/remove.

## Out of scope

- Persisting the toggle across refresh or across admins.
- Editing enemy factions' treasury / other-faction resources (v1 acts on the current viewing faction).
- Running or undoing turns from Test Mode (turn engine is separate).
- Bulk operations, undo history, or CSV import.
