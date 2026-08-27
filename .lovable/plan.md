# Turn Briefing — first step of the Politics section

When a player opens a game for the first time on a new turn, a **Turn Briefing** overlay opens automatically summarising everything that changed during the last processed turn. It can be dismissed, and re-opened any time from a Briefing button in the game header.

## What the briefing shows

Sections, each hidden when it has nothing to report:

1. **Treasury & Economy** — treasury now vs. before, tribute collected, maintenance paid, net change, and current admin/combat points available.
2. **Territory** — systems captured, lost, or colonised; starbases founded or destroyed; planets under invasion.
3. **Military** — space battles and ground combats involving the player, with winner, ships/troops lost and gained; production completed and ships delivered.
4. **Orders & Capability** — orders that resolved or expired this turn (e.g. attack orders consumed), production finished, points available for the new turn.
5. **All Dispatches** — the full list of dispatches addressed to the player for that turn, rendered the same way the news feed shows them. New dispatch types added later appear here automatically.

Header line: "Turn 49 Briefing — Dravian Republic", with a short one-line lede ("Two systems changed hands; treasury up 412 credits.").

## Behaviour

- Opens automatically on the first load of a game turn the player hasn't acknowledged.
- "Acknowledge" closes it and records that turn as seen, so it never auto-opens again for that turn (survives reloads and device changes).
- A "Briefing" button in the game header re-opens it read-only at any time during the turn.
- Turn 1 / no previous processed turn: briefing shows an opening-orders message rather than deltas.

## Technical notes

- **Data source**: `game_logs` rows for the last processed turn (`game.turn_number - 1`), filtered to this player by observer/faction fields already used by the dispatch feed, plus the player's `game_factions` row (`treasury`, `last_tribute`, `last_maintenance`, `admin_points_remaining`, `combat_points_remaining`). No new turn-processor writes are required in this step; the briefing is derived from logs that already exist.
- **New module** `src/lib/briefing/buildTurnBriefing.ts` — pure function taking logs + faction row + map state and returning a typed `TurnBriefing` object with the five sections. Keeps the presentation component dumb and makes the summary reusable later (e.g. feeding an LLM-written version in a later phase, same way ground-combat dispatches are structured).
- **New component** `src/components/game-shell/TurnBriefingOverlay.tsx` built on the existing `ImperialOverlay` (`expanded` size, Roman techno-classical styling, section headers in Cinzel).
- **Wiring** in `src/pages/PlayerGame.tsx`: load the briefing alongside the existing dispatch fetch, auto-open when unacknowledged, add the header button via `GameHeader`.
- **Persistence**: add a `last_briefing_turn integer not null default 0` column to `game_factions` (existing RLS/grants already scope that table to the owning player and staff). Acknowledge writes the current turn number.
- **Log coverage check**: before building the sections, confirm which log types currently carry per-player attribution (`planet_captured`, `planet_colonized`, `dispatch_ground_combat`, `battle_resolved`, economy entries). Any category not represented in the logs is listed in the briefing as unavailable rather than silently omitted, and adding those log entries becomes a follow-up step.
