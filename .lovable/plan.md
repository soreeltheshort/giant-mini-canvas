# Factions Config & Game Creation Defaults

## 1. Rename "Map Testing Config" → "Factions Config", move to Assets

- `src/components/Header.tsx`
  - Remove the `Map Testing Config` item from the **Testing** dropdown.
  - Add `Factions Config` to the **Assets** dropdown (admin-only, same dropdown as Map Config / AI Config). Link still points to `/map-testing/config` (no route rename — keeps existing bookmarks/links alive).
- `src/pages/MapTestingConfig.tsx`
  - Change page `<h1>` from "Map Testing Configuration" to "Factions Config".
  - Update `<title>` / any header text on the page accordingly.

(File names and the route stay the same to avoid a noisy refactor; only the user-facing label changes.)

## 2. Persist & reuse the last-loaded Factions Config

Goal: when an admin imports a Factions Config JSON via `MapConfigSaveLoad`, store the file in cloud storage and record it as the global default. Then every game-creation surface offers it as the prefilled default, plus lets the creator pick a different file.

### 2a. Backend

- New storage bucket: **`config-files`** (private). RLS:
  - Admins/testers can upload & read.
  - Authenticated users can read (so non-admin players creating a game can download the default).
- `app_settings` migration: add `default_factions_config_id uuid` (nullable, FK loosely to a new `saved_factions_configs` table).
- New table **`saved_factions_configs`**
  - `id uuid pk`, `name text`, `file_path text` (path in `config-files` bucket), `uploaded_by uuid`, `created_at timestamptz`.
  - GRANTs: `authenticated` SELECT; admins/testers full; `service_role` ALL.
  - RLS: admins/testers manage; authenticated read.

### 2b. Save/Load component changes

- `src/components/MapConfigSaveLoad.tsx`
  - On **Import**: in addition to upserting rows into Supabase tables, also upload the raw JSON to `config-files/{uuid}.json`, insert a `saved_factions_configs` row, and `app_settings.default_factions_config_id = <new id>`.
  - Add a "Loaded config: <name>" indicator pulled from `app_settings` + `saved_factions_configs`.

## 3. Game creation surfaces

All three creation flows get the same UX block:

- **Factions Config**: select dropdown of saved configs (default = global `default_factions_config_id`). Optional "Upload new..." opens file picker, which uploads to bucket, creates a row, sets it as the new default, then applies it (upsert into tables) before creating the game.
- **Map**: a select dropdown of `saved_maps` rows (default = `default_map_id`). Already implicit today — make it explicit so users can override and so the default is clearly surfaced.

Touched files:
- `src/pages/NewGameModes.tsx` — `SinglePlayerPanel`.
- `src/pages/TesterDashboard.tsx` — `createGame`.
- `src/pages/AdminGames.tsx` — game create form (currently just name + status; add the same two pickers).

Behavior: before calling `games.insert`, if the chosen config differs from the currently-applied one, upsert its rows into the tables (same logic as the existing import path), then proceed.

## 4. Out of scope

- No engine/data logic changes.
- No rename of `MapTestingConfig.tsx` file or `/map-testing/config` route.
- No changes to default-map management UI (it already lives in AdminGames).

## Open question

Should the "last loaded config" be **global** (like `default_map_id` today — every user sees the same default) or **per-user** (each admin remembers their own last)? The wording "non admin players who create a game" suggests **global**, which is what this plan implements. Confirm before I build.
