## Goal

Turns are processed **per faction**, not per player slot. A faction is "active" in a game when it has a player **or** an AI persona. Operators are uniform (player or AI) but **assignment is asymmetric**:

- **Players** in lobby/setup can only join **player factions** (the 6 Roman provinces today).
- **AIs** can be attached to any faction — player or non-player.
- **Admin impersonation** is the only path to "log in as" a non-player faction.

---

## Current state (recap of what to refactor)

- `game_players` mixes faction identity + operator + per-turn state on one row.
- `player_slot` (1–6, hard-coded to PROVINCE_NAMES) is the *de-facto* faction key everywhere: economy aggregation (`Map<number, …>`), `owner_classification = "PROVINCE_<slot>"`, visibility, fleet ownership, `PlayerGame.tsx` labels.
- AI factions outside slots 1–6 (Synod_int1, Lost Colonies, …) have `player_slot = null`, so the per-turn pipeline silently no-ops them.
- "Neutral map-owner" rows (no player, no AI) live in the same table and pollute the admin Players column.
- Nothing in the schema marks a faction as "player-eligible" vs "non-player" — today it's implicit (a faction has a Roman-province `code_name` ⇒ it's a player faction).

---

## Target model

### 1. Mark faction eligibility explicitly

Add `factions.is_player_faction boolean NOT NULL DEFAULT false`. Backfill `true` for the six Roman provinces (`Valerian`, `Aurelian`, `Cassian`, `Dravian`, `Marcellan`, `Octavian`) by `code_name`. Everything else (Synod_int1, Lost Colonies, etc.) stays `false`.

This becomes the single source of truth for "can a human player be assigned here?". The 1–6 slot numbering is preserved as a UI label (`player_slot`) but no longer authoritative.

### 2. Rename `game_players` → `game_factions`

One row per **active faction** in a game. Keep the same PK so `player_orders.player_id`, `ai_*` tables, and logs don't move.

| column | meaning |
|---|---|
| `game_id`, `faction_id` | unique together, the spine |
| `user_id` | player operator, or null |
| `ai_persona_id` | AI operator, or null |
| `player_slot` | **seat label only** (1–6 for Roman provinces); nullable; not a join key |
| treasury / capability / visibility / orders_locked / initialized | unchanged per-turn faction state |

Invariant: `user_id IS NOT NULL OR ai_persona_id IS NOT NULL`. Enforced by `CHECK` after we delete today's orphan neutral rows.

### 3. Assignment rules (enforced in code + DB)

- **Player join (lobby, `status = 'setup'`)**: only allowed when target `factions.is_player_faction = true`. Enforced by:
  - UI: lobby faction picker shows only player factions.
  - RLS: tighten the existing `"Users can join setup games"` policy to also require `EXISTS (SELECT 1 FROM factions f WHERE f.id = game_factions.faction_id AND f.is_player_faction = true)`.
- **AI attach**: any faction — admin sets `factions.ai_persona_id` in Map Testing Config; seeder creates the `game_factions` row regardless of `is_player_faction`.
- **Admin impersonation**: the only way to "log in as" a non-player faction. The `impersonate` edge function continues to mint a session for an admin into any `game_factions` row.
- **Players cannot switch** to a non-player faction post-join: handled by the same RLS check on UPDATE-of-self.

### 4. Owner string resolution

Map data still stores `owner_classification` as a free-text label (`"PROVINCE_4"`, `"Synod_int1"`, `"Cassian"`). Add `src/lib/factionUtils.ts` helpers:

- `resolveOwnerToFaction(ownerClass, factions): Faction | null` — central resolver.
- `factionOwnerStrings(faction): Set<string>` — the strings that mean "this faction owns it" (`PROVINCE_<seat>` if seated, `code_name`, `name`).

Every turn-processor phase resolves owner → `faction_id` once at the top and operates on `faction_id` thereafter. No mass rewrite of stored owner strings.

### 5. Operator abstraction

Replace `PlayerCtx` with `FactionCtx`:

```ts
interface FactionCtx {
  id: string;                // game_factions.id
  faction_id: string;
  faction_code_name: string;
  faction_name: string;
  is_player_faction: boolean;
  operator: "player" | "ai";
  user_id: string | null;
  ai_persona_id: string | null;
  player_slot: number | null;
  // …existing economy + visibility fields
}
```

`turnProcessor/index.ts` loads `game_factions` joined to `factions`, builds `Map<faction_id, FactionCtx>`, every phase iterates that map. `playerEcon` → `factionEcon: Map<string, …>` keyed by `faction_id`.

---

## File-by-file changes

1. **Migrations** (single migration call)
   - `ALTER TABLE factions ADD COLUMN is_player_faction boolean NOT NULL DEFAULT false;`
   - `UPDATE factions SET is_player_faction = true WHERE code_name IN ('Valerian','Aurelian','Cassian','Dravian','Marcellan','Octavian');`
   - `DELETE FROM game_players WHERE user_id IS NULL AND ai_persona_id IS NULL;`
   - `ALTER TABLE game_players RENAME TO game_factions;` (FKs and the existing unique index follow the rename automatically).
   - Replace partial unique index with `CREATE UNIQUE INDEX game_factions_game_faction_uniq ON game_factions(game_id, faction_id);`
   - `ALTER TABLE game_factions ADD CONSTRAINT game_factions_has_operator CHECK (user_id IS NOT NULL OR ai_persona_id IS NOT NULL);`
   - Drop old `"Users can join setup games"` policy on the renamed table; recreate as: same check + `AND EXISTS (SELECT 1 FROM factions f WHERE f.id = faction_id AND f.is_player_faction = true)`.
   - Re-grant table privileges under the new name.

2. **`src/lib/factionUtils.ts`** — add `resolveOwnerToFaction`, `factionOwnerStrings`, `isPlayerFaction(faction)`.

3. **`src/lib/gameLifecycle.ts`**
   - Rename `seedFactionPlayers` → `seedGameFactions`.
   - Pass A (AI factions) unchanged in intent — works for any faction with `ai_persona_id`.
   - Pass B: only insert rows where the map-owner resolves to a faction *and* it has an operator (player back-fill or AI persona). Do not insert pure-neutral rows.
   - `startGame` / `processTurn`: aggregate economy by `faction_id` via `factionOwnerStrings(faction)`.

4. **`src/lib/turnProcessor/{index,types}.ts`** — `PlayerCtx` → `FactionCtx`; `players` → `factions`; `playerEcon` → `factionEcon` (string keys).

5. **`src/lib/turnProcessor/phases/*.ts`** — each phase resolves owner strings to `faction_id` at the top, operates on `faction_id` from then on. Visibility writes keyed by `faction_id`.

6. **`src/lib/turnZero.ts`, `src/lib/hexAccess.ts`** — accept `FactionCtx` / `faction_id`; keep `player_slot` only where a UI uses it as a label.

7. **`src/pages/PlayerGame.tsx`**
   - Fetch the calling user's `game_factions` row joined to `factions`.
   - Refuse to render (redirect to `/my-games`) if the resolved faction is not `is_player_faction = true` *and* the session is not an admin impersonation. This is a defensive client-side guard; RLS is the real wall.
   - Replace `\`PROVINCE_${player.player_slot}\`` with the seat string from the faction (uses `player_slot` when set, otherwise `code_name`).
   - Ownership comparisons use `ownerStrings.has(f.owner_classification)`.

8. **`src/pages/TesterDashboard.tsx`** (lobby join flow)
   - Faction picker queries `factions` filtered by `is_player_faction = true`.
   - Insert into `game_factions` with `(game_id, user_id, faction_id, player_slot)` — `player_slot` derived from the chosen Roman-province seat.

9. **`src/pages/AdminGames.tsx`**
   - Players column: rows are now only Player + AI (no "inactive" placeholders, since they were deleted).
   - Reseed button calls `seedGameFactions`.
   - Admin "Add player" UI continues to allow assigning any user to any **player faction** seat; a separate "Attach AI" affordance handles non-player factions (already covered by Map Testing Config `ai_persona_id`).

10. **`src/pages/AdminUsers.tsx` / impersonate edge function**
    - Admin impersonation dropdown lists **all** active `game_factions` rows for a game (player + AI factions). This is the only route by which a session targets a non-player faction.

11. **`src/components/admin/ai/AIInspector.tsx`**, **`src/pages/MyGames.tsx`**
    - Rename queries from `game_players` → `game_factions`.
    - Inspector dropdown lists every row with `ai_persona_id IS NOT NULL` — Synod_int1 now appears.
    - MyGames "My faction" label uses `faction.name`, falling back to `PROVINCE_NAMES[player_slot]`.

12. **`src/integrations/supabase/types.ts`** — regenerated by the migration.

---

## Migration safety

- Single migration: column add → backfill → orphan delete → rename → check constraint → re-policy → re-grant. Atomic.
- All FKs (`player_orders.player_id`, AI tables' `player_id`) keep resolving because PKs are stable.
- `is_ai` and the old partial index are left in place for now; a follow-up migration can drop them once code is fully off them.

---

## Out of scope

- AI decision logic (goals, plans, orders).
- Battle/combat code beyond owner-string resolution.
- Redesign of the Players column UI — same layout, fewer rows.
- Adding new non-player factions to seed data.

---

## Verification

- Test047 (Synod_int1 AI, owns 0 systems): post-migration `game_factions` has 1 player row (Dravian/DOn) + 1 AI row (Synod_int1). Players column shows `DOn, AI`.
- AI Inspector dropdown lists `Synod_int1`. Running a turn produces a per-faction log row for it (no-op economy).
- Tester lobby: faction picker shows only the 6 Roman provinces. Direct INSERT attempt against a non-player faction id is blocked by RLS.
- Admin impersonation: dropdown lists Synod_int1; selecting it loads PlayerGame as that faction. A non-admin user hitting the same URL is bounced.
- Existing 6-player active game: tribute/upkeep numbers unchanged before/after migration.