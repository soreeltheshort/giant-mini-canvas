# Senate Blocs — separate politics groups from military factions

## Goal
Politics groups are their own thing, unrelated to the military factions (provinces, Synod, etc.). Rename the politics side to "senate blocs" everywhere in code, give blocs their own editable content (name, image, description), let admins save and load sets of blocs like maps, and pick which set a new game uses.

## Terminology
- Existing military/province groups keep the name **faction** — untouched.
- Politics groups become **senate bloc** (`SenateBloc`, `senateBlocs`, `useSenateBlocs`, `senate_blocs`).
- Nothing in the politics code reads `useFactions` any more.

## 1. Data (backend)
Two new tables, both with grants + RLS (read for signed-in users, write for admins):
- `senate_bloc_sets` — `id`, `name`, `description`, `created_by`, `created_at`. A named, loadable collection (the "save file").
- `senate_blocs` — `id`, `set_id` (FK, cascade delete), `name`, `description`, `image_url`, `accent_color`, `sort_order`.

Plus:
- `app_settings.default_senate_bloc_set_id` — the last-used set, used as the default at game creation.
- `games.senate_bloc_set_id` — which set a game uses (nullable; falls back to the default set).

Seed one starter set, "Republic Senate", with 9 blocs in the game's voice, e.g. Optimate Concord, Populares Union, Mercantile Curia, Collegium Technica, Cult of the Iron Sun, Legionary League, Frontier Petitioners, Provincial Assembly, Old Republic Loyalists — each with a short description and no image until one is chosen.

## 2. New admin page: Assets > Politics
Route `/admin/politics`, admin-only, added to the existing Assets menu in the header.
- Set selector at the top: choose the active set, create a new set, rename, duplicate, delete.
- Bloc list for the active set: add, delete, reorder; edit name, description, accent color.
- Image chosen from the existing stored images library (same `images` bucket used by the Images page) — pick from a dropdown/grid of uploaded images or paste a URL.
- Save/Load: export the active set as a JSON file and import a JSON file back as a new set, matching the Map Config save/load behaviour.

## 3. New game selection
In the new-game flow (where the map is picked), add a **Politics Set** picker beside the map picker, defaulting to `app_settings.default_senate_bloc_set_id`; choosing a set stores it as the new default and writes `senate_bloc_set_id` on the created game.

## 4. Politics panel rewrite
`PoliticsPanel.tsx` renames its internals to blocs and loads the game's bloc set through a new `useSenateBlocs(setId)` hook:
- Cards show bloc image, name and accent colour — real content from the set, no faction names, no "You" badge.
- Hovering fills the dossier below with the bloc's description plus the current placeholder attributes (leader, standing, influence, stability) until real politics data exists.
- If a set has fewer than 9 blocs, only that many cards render.

## Technical notes
- Migration order per table: `CREATE TABLE` → `GRANT` → `ENABLE ROW LEVEL SECURITY` → policies.
- Delete of a set cascades to its blocs; games referencing a deleted set fall back to the default set.
- `src/lib/factionUtils.ts`, `useFactions`, the turn engine and all map/military code are untouched.

## Out of scope
- Real politics mechanics (votes, agendas, relationships) — the dossier stays placeholder.
- Renaming the existing military factions.
