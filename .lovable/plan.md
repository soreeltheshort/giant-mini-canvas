# Phase 2a — Plan Status

## Slice 1 — DONE (this iteration)

- **Faction alignment override config (`faction_relationship_overrides`)** — directional viewer→target rows, friend/enemy, admin-managed via new "Hard-coded Relationships" section on Factions Config (`src/components/factions-config/RelationshipOverridesPanel.tsx`). Pairs not listed default to `competitor`.
- **Derived alignment columns on `ai_relationships`** — `derived_class` (`friend|competitor|neutral|enemy`, default `competitor`), `class_source` (`override|dynamic`, default `dynamic`), `class_updated_turn` (default 0). Initialised on row creation; runtime derivation not yet wired.
- **Goal catalog (`src/lib/ai/goalCatalog.ts`)** — 6 codes: `colonize`, `expand_economy`, `enhance_offense`, `bolster_defense`, `degrade_enemy`, `conquer`. Includes `RECOMMENDED_GOAL_WEIGHTS` for each default persona. Catalog codes are now the leading "+ add" buttons in the persona editor; legacy codes remain available for back-compat.
- **Follow-through catalog (`src/lib/ai/followthroughCatalog.ts`)** — 6 activity codes: `garrison_ground_forces`, `build_defensive_strikecraft`, `repair_damaged_hulls`, `build_cheapest_defense_hull`, `build_cheapest_offense_hull`, `stockpile_treasury`. Includes `RECOMMENDED_FOLLOWTHROUGH` per default persona + a neutral `DEFAULT_FOLLOWTHROUGH_QUEUE` for custom personas.
- **`ai_persona_followthrough` table** — per-persona ordered queue (`step_order` unique per persona), `enabled` toggle, free-form `params_json`. Admin RLS write, public read.
- **Admin UI — `FollowthroughEditor`** — mounted inside each persona card on `AdminAIConfig`. Reorder ↑/↓, enable toggle, activity dropdown, params JSON.
- **Inspector additions** — Relationships table now shows `derived_class` / `class_source` / `class_updated_turn`. New "Persona follow-through queue" section reads the selected faction's persona queue.
- **`seedDefaultPersonas` refactor** — now also backfills any missing goal-weight rows (6 codes) and inserts the recommended follow-through queue. Safe to re-run; the function returns `{inserted, skipped, backfilled}`.
- **Backfill for the existing "Synod Standard" persona** — applied via insert: 6 new goal-weight rows at neutral defaults, default 6-step follow-through queue.

## Still deferred (later slices)

- Runtime derivation of `derived_class` (dynamic rules + override resolution at tick start).
- Slate builder — up to 3 slots, threshold-gated, persona-weighted scoring.
- Worldview fingerprint + stability-gated re-plan.
- `ai_known_fleets` table + visibility/decay refresh.
- `ai_goal_failures` table + effort-multiplier memory.
- `ai_revision_constants` singleton (thresholds, decay rates).
- **Execution** of follow-through activities (this slice only configures the queue).
- Per-goal-type planner bodies that emit orders.
- Inspector "Compute Tick" button + turn-loop integration.

## Files added/modified this slice

**New**
- `src/lib/ai/goalCatalog.ts`
- `src/lib/ai/followthroughCatalog.ts`
- `src/components/factions-config/RelationshipOverridesPanel.tsx`
- `src/components/admin/ai/FollowthroughEditor.tsx`

**Modified**
- `src/lib/ai/seedDefaultPersonas.ts` — drops embedded weights, uses catalog, seeds follow-through.
- `src/pages/MapTestingConfig.tsx` — mounts `RelationshipOverridesPanel` under a new section.
- `src/pages/AdminAIConfig.tsx` — mounts `FollowthroughEditor` per persona; new goal codes are first in the "+ add" list.
- `src/components/admin/ai/AIInspector.tsx` — extended relationships columns; new persona follow-through read-out.

**Database** (one migration)
- `faction_relationship_overrides` table + RLS + GRANTs + updated_at trigger.
- `ai_persona_followthrough` table + RLS + GRANTs + updated_at trigger.
- `ai_relationships` extended with `derived_class`, `class_source`, `class_updated_turn`.

## Out of scope (unchanged)

- No change to `factions` table.
- No change to existing weight rows (only inserts for missing pairs).
- No engine wiring — nothing in this slice affects gameplay yet.
