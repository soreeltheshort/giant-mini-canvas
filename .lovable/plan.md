# Generalized Access Strategy: Game Membership + Own Files

## Goal

Today most game and asset tables are readable by *any* signed-in account (`USING true`). The intent is:

- **Players** see only games they are in, plus the data needed to render and run their turn.
- **Everyone** sees their own files (saved maps, fleet templates, config uploads) — not other people's.
- **Testers** keep full access to the testing menus and to the games they create.
- **Admins** keep unrestricted access.

Rather than patching one table at a time, this introduces a single reusable access rule and applies it everywhere.

## The three access tiers

| Tier | Contents | Rule |
|---|---|---|
| **Reference data** | ship types, weapons, facility types, planet types, hull classes, battle phases, combat constants, naming conventions, factions, group modifiers, system actions, fleet size categories, wiki pages, cutscenes | Readable by any signed-in user. Public (signed-out) read removed except the wiki. Writes stay admin-only. |
| **Game data** | games, game_factions, game_fleets, game_fleet_ships, game_logs, game_snapshots, ships_in_transit, system_ship_production, AI tables | Readable only if you are *in* that game (or created it, or are an admin). |
| **Personal data** | saved_maps, saved_factions_configs, fleets, fleet_ships, fleet_faction_tags, profiles, battle runs/events, storage files | Owner or admin only, with the game-template exception below. |

## Core building block

One security-definer helper decides game access for every table:

```
can_access_game(game_id) =
     admin
  OR games.created_by = me
  OR I have a game_factions row in that game
```

Every game-scoped table's read policy becomes `can_access_game(game_id)` instead of `true`. Nested tables (game_fleet_ships, ai_plan_steps, battle events) resolve through their parent.

Testers are covered automatically: their testing games are ones they created. Their existing "tester manages own games" write policies stay untouched, so the testing menus keep working. The one tester-specific addition is read access to shared **config files and map libraries used by testing** — see below.

## Notable exceptions to get right

- **Fleet templates are shared into games.** `game_fleets` points at rows in `fleets` (garrisons are owned by the game creator, not the player). Owner-only reads on `fleets` / `fleet_ships` would blank out garrison and AI fleets for players. Rule becomes: *owner, or admin, or the fleet is referenced by a game I can access.*
- **Saved maps and factions configs.** Owner or admin only for the library listing. Testers additionally read entries used by games they created. Storage buckets `map-files` and `config-files` get the same treatment: the blanket "authenticated can read" storage policies are dropped, keeping the per-owner folder policies, plus a tester/admin read for the shared config library.
- **Battle runs/events** currently readable by signed-out visitors; restrict to creator, admin, or tester.
- **Anonymous access.** Every remaining `{public}` policy is re-scoped to `authenticated`, and `anon` grants are revoked, except intentionally public surfaces (wiki pages, newsletter/studio signup inserts).

## What this deliberately does **not** do yet

Enforcing *fog of war* in the database (a player only sees enemy fleets their sensors detect) is a separate, larger change: the map itself lives in `games.map_data_json` as one blob, and visibility is currently filtered in the client. This plan stops at "members of the game only". Server-side per-faction filtering would need filtered views or an edge function that returns a redacted game state, and is proposed as a follow-up round.

## Rollout

1. Add the `can_access_game` helper and a matching `is_staff` (admin or tester) helper.
2. Migration A — reference tables: drop public/anon reads, keep authenticated read.
3. Migration B — game tables: replace every `USING (true)` read with membership check.
4. Migration C — personal tables + storage: owner/admin scoping, fleet-template exception, drop broad storage reads.
5. Verify by signing in as a non-member player, a tester, and an admin, and walking: dashboard, load game, run a turn, fleet builder, map editor, testing menus. Any query that breaks gets fixed by narrowing the client query, not by widening the policy.

## Technical notes

- Helpers are `SECURITY DEFINER STABLE SET search_path = public` to avoid RLS recursion between `games` and `game_factions`.
- Membership lookups add a subquery per row; indexes on `game_factions(game_id, user_id)` and `game_fleets(game_id)` are added if absent.
- Policies are replaced with `DROP POLICY IF EXISTS` + `CREATE POLICY ... TO authenticated` so role targeting is explicit everywhere.
- Grants are re-asserted per table (`authenticated` CRUD as appropriate, `service_role` all, `anon` revoked).
- Edge functions and the turn processor run under the service role where needed and are unaffected.
