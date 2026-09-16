# Favores — asset editor and data model

Favores are mini-quests. Each is a template: a name, a description with random variables, a success criterion, a rarity weight, and rewards applied to senate blocs and/or affinities. This step builds the templates and their editor only — no in-game generation, bidding, or turn resolution yet.

## What you get

A new **Assets > Favores** page (admin only) that works exactly like Assets > Politics:

- An **Active Set** toolbar at the top with the same buttons: pick set, new, rename, duplicate, delete, make default, save to file, load from file. Same shared component, reused.
- A list of Favores in the active set, each editable in place.

## A Favor

- **Name** — e.g. "The Praetor's Purse".
- **Description** — free text with `{variables}` in braces, e.g. "Donate {amount} credits to the Temple of Concord."
- **Variables** — a small table per favor: key, minimum, maximum, step. These fill the braces when a favor is later generated.
- **Criterion** — one of four types to start:
  - *Influence Auction* — highest influence bid wins.
  - *Credit Auction* — highest treasury bid wins.
  - *Build Facility* — first to commission a chosen facility type (count configurable).
  - *Colonize Planet* — first to colonize N new planets.
  Each type shows only its own settings (bid floor, facility type dropdown, count, deadline in turns).
- **Rarity** — Common / Uncommon / Rare / Very Rare, purely a draw weight (editable weight number shown next to it).
- **Bloc reward** — a number, the standing granted with the targeted blocs.
- **Affinity reward** — a number, the standing granted toward the targeted affinities.
- **Targets** — multi-select of senate blocs from the active bloc set, and multi-select of affinities. Either or both may be set.

## Technical notes

New tables mirroring `senate_bloc_sets` / `senate_blocs`:

- `favor_sets` (id, name, description, created_by, timestamps)
- `favors` (id, set_id → favor_sets on delete cascade, name, description, variables jsonb default `[]`, criterion_type text, criterion_params jsonb default `{}`, rarity text default `common`, rarity_weight int default 100, bloc_reward int default 0, affinity_reward int default 0, target_bloc_ids uuid[] default `{}`, target_affinities text[] default `{}`, sort_order int, timestamps)

Both get GRANTs, RLS enabled, view-for-all / modify-for-admins policies, and `update_updated_at_column` triggers — same shape as the senate tables. `app_settings` gets `default_favor_set_id`.

New code:

- `src/lib/favores.ts` — types (`Favor`, `FavorSet`, `FavorSetBundle`), CRUD, default-set resolution, duplicate, JSON export/import. Modeled directly on `src/lib/senateBlocs.ts`.
- `src/lib/favorCriteria.ts` — criterion registry: id, label, parameter schema per type, so new criteria are added in one place.
- `src/components/FavorSetToolbar.tsx` — thin wrapper reusing the `SenateBlocSetToolbar` pattern; if the existing toolbar generalizes cleanly it is parameterized instead of copied.
- `src/pages/AdminFavores.tsx` — the editor page.
- Route `/admin/favores` in `App.tsx` behind `RequireRole admin`, and an Assets > Favores link in `Header.tsx`.

Affinity choices come from `senateAffinities.ts`; bloc choices come from the current default senate bloc set.

## Not in this step

Per-turn generation of three favors, the open-favor list in game, bidding orders, resolution during turn processing, and completion dispatches. The data model above is shaped so those attach later without migration churn.
