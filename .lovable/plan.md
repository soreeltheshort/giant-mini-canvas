# Phase 2a — Slice 1: Alignments, Goal Catalog, Persona Follow-through

Scoped subset of the Phase 2a plan. Implements the data model and config surface for three things: faction alignment, the goal catalog with priority weights, and persona-driven fall-through ("follow-through") activities. Scoring/runtime, slate building, fingerprint, known fleets, and goal-failure memory are **deferred** to a later slice.

---

## 1. Faction Alignment Table (directional)

Each row is `viewer → target`. One-sided: a row stores how the viewer regards the target.

### 1a. Admin override config table (new)
`faction_relationship_overrides`
- `id uuid pk`
- `viewer_faction_id uuid` → `factions.id`
- `target_faction_id uuid` → `factions.id`
- `forced_class enum ('friend','enemy')`
- `notes text`
- `created_at`, `updated_at`
- Unique on `(viewer_faction_id, target_faction_id)`
- Self-pair forbidden (CHECK)
- GRANTs: authenticated SELECT; admins full; service_role ALL.
- RLS: admins manage; authenticated read.

Admin must add the reciprocal row separately to lock both directions.

### 1b. Per-game derived alignment on `ai_relationships`
Add columns:
- `derived_class text not null default 'competitor'` — one of `friend | competitor | neutral | enemy`
- `class_source text not null default 'dynamic'` — `'override' | 'dynamic'`
- `class_updated_turn int not null default 0`

Initial values on row creation: `competitor` / `dynamic`. Override resolution happens at runtime (next slice); column is in place now so the inspector can read it.

### 1c. UI — Factions Config screen
New section "Hard-coded Relationships" on `src/pages/MapTestingConfig.tsx` (now titled Factions Config).
- Lists existing overrides as rows: Viewer faction · Target faction · Class · Notes · Delete.
- "Add" row picks two factions (different) + class.
- Inline component `src/components/factions-config/RelationshipOverridesPanel.tsx`.

---

## 2. Goal Catalog + Priority Weights

Six goal types live as constants in code (`src/lib/ai/goalCatalog.ts`):

| code | label | description |
|---|---|---|
| `colonize` | Colonize System | Take an unowned habitable system. |
| `expand_economy` | Expand Economy | Build econ facilities on an owned system below median production. |
| `enhance_offense` | Enhance Offensive Power | Grow own offensive power band. |
| `bolster_defense` | Bolster Defense | Raise defense band of the weakest owned system. |
| `degrade_enemy` | Degrade Enemy | Reduce a specific enemy's believed military power. |
| `conquer` | Conquer System | Take a specific enemy-owned system. |

Each persona scores candidates as `persona_base_weight * urgency_multiplier * opportunity_score`. The first two factors live on the existing `ai_persona_goal_weights` table — **we extend it with the new codes** for every persona via a data migration, using these recommended defaults:

| persona | colonize | expand_economy | enhance_offense | bolster_defense | degrade_enemy | conquer |
|---|---|---|---|---|---|---|
| Warlord | 0.6 | 0.5 | 1.3 | 0.7 | 1.2 | 1.4 |
| Trade Senator | 1.1 | 1.4 | 0.5 | 1.0 | 0.3 | 0.4 |
| Paranoid Isolationist | 0.7 | 0.9 | 0.9 | 1.5 | 0.5 | 0.3 |

Urgency multipliers default to `1.0`. Each weight row gets a `threshold_json` placeholder (e.g. `{ min_systems_owned: 1 }`) that the scoring slice will read.

`AdminAIConfig.tsx` already edits `ai_persona_goal_weights`; no UI work needed beyond confirming the new rows surface.

---

## 3. Persona-Configurable Follow-through Activities

When a tick has unspent production share (slate gaps or unfunded goals), the AI runs a **follow-through queue** defined per persona.

### 3a. New table `ai_persona_followthrough`
- `id uuid pk`
- `persona_id uuid` → `ai_personas.id`
- `step_order int not null` (1-based)
- `activity_code text not null` — see catalog below
- `enabled boolean not null default true`
- `params_json jsonb not null default '{}'` — per-activity tuning (e.g. `{ "hull_class": "destroyer" }`)
- `created_at`, `updated_at`
- Unique on `(persona_id, step_order)`
- GRANTs: authenticated SELECT; admins full; service_role ALL.
- RLS: admins manage; authenticated read.

### 3b. Activity codes (constants in `src/lib/ai/followthroughCatalog.ts`)

| code | description |
|---|---|
| `garrison_ground_forces` | Build ground forces at owned system with lowest garrison. |
| `build_defensive_strikecraft` | Build fighters/gunships at owned system with lowest defensive strikecraft. |
| `repair_damaged_hulls` | Allocate production to repair crippled/damaged ships. |
| `build_cheapest_defense_hull` | Construct cheapest defense-tagged hull at weakest-defense system. |
| `build_cheapest_offense_hull` | Construct cheapest offense-tagged hull at highest-production system. |
| `stockpile_treasury` | Skip production spend; bank the cinders. |

### 3c. Recommended default queue (seeded per persona)

**Warlord**
1. `repair_damaged_hulls`
2. `build_cheapest_offense_hull`
3. `build_cheapest_defense_hull`
4. `build_defensive_strikecraft`
5. `garrison_ground_forces`
6. `stockpile_treasury`

**Trade Senator**
1. `stockpile_treasury` (enabled = true; treasury-first economy)
2. `repair_damaged_hulls`
3. `build_defensive_strikecraft`
4. `garrison_ground_forces`
5. `build_cheapest_defense_hull`
6. `build_cheapest_offense_hull`

**Paranoid Isolationist**
1. `garrison_ground_forces`
2. `build_defensive_strikecraft`
3. `build_cheapest_defense_hull`
4. `repair_damaged_hulls`
5. `stockpile_treasury`
6. `build_cheapest_offense_hull`

Seeded via a data migration that backfills any persona missing rows. `seedDefaultPersonas` is also extended to write the queue for newly created personas.

### 3d. Admin UI
`src/pages/AdminAIConfig.tsx` already edits personas; add a "Follow-through Queue" subsection per persona with: drag-handle reorder, enabled toggle, activity dropdown (catalog), params textarea (JSON), add/remove rows. Component: `src/components/admin/ai/FollowthroughEditor.tsx`.

---

## 4. Inspector Read-out

Extend `src/components/admin/ai/AIInspector.tsx`:
- Add a "Relationships (derived class)" mini-section reading the new columns from `ai_relationships`.
- Add a "Persona follow-through" read-only section showing the selected faction's persona queue.

No "Compute Tick" button this slice — runtime evaluation lives in the next slice.

---

## 5. Migrations

Single migration:
1. `CREATE TABLE faction_relationship_overrides` + GRANTs + RLS + policies.
2. `CREATE TABLE ai_persona_followthrough` + GRANTs + RLS + policies.
3. `ALTER TABLE ai_relationships ADD COLUMN derived_class / class_source / class_updated_turn`.
4. Data migration: insert any missing `ai_persona_goal_weights` rows for the 6 new goal codes per existing persona using the table above; insert the recommended follow-through queue for each existing persona.

---

## 6. Files Touched

**New**
- `src/lib/ai/goalCatalog.ts`
- `src/lib/ai/followthroughCatalog.ts`
- `src/components/factions-config/RelationshipOverridesPanel.tsx`
- `src/components/admin/ai/FollowthroughEditor.tsx`

**Modified**
- `src/lib/ai/seedDefaultPersonas.ts` — also seed follow-through queue + new goal weights for new personas.
- `src/pages/MapTestingConfig.tsx` — mount `RelationshipOverridesPanel`.
- `src/pages/AdminAIConfig.tsx` — mount `FollowthroughEditor` per persona.
- `src/components/admin/ai/AIInspector.tsx` — render derived class + persona follow-through queue.

---

## 7. Updated Phase 2a Plan Status

**Implemented this slice**
- Faction alignment override config (directional).
- `derived_class` columns on `ai_relationships` (initialised, not yet computed at runtime).
- Goal catalog (6 types) + persona priority weights seeded for all personas.
- Persona-configurable follow-through queue + seeded defaults.
- Inspector read-outs for the above.

**Still deferred to next slices**
- Runtime derivation of `derived_class` (dynamic rules engine + override resolution).
- Slate builder (up to 3 slots, threshold-gated).
- Worldview fingerprint + stability-gated re-plan.
- `ai_known_fleets` table + visibility refresh.
- `ai_goal_failures` table + effort multiplier.
- `ai_revision_constants` singleton.
- Follow-through **execution** (this slice only configures the queue).
- "Compute Tick" inspector button + turn-loop integration.
- Per-goal-type planner bodies that emit orders.

---

## 8. Out of Scope

- Any change to `factions` table.
- Any change to existing weight rows (only inserts for missing `(persona, goal_type)` pairs).
- Engine wiring — nothing in this slice affects gameplay yet.
