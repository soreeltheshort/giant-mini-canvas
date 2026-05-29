# AI Threat-Assessment Beliefs

Add two first-class AI world beliefs the deterministic AI will use to decide when to re-plan, plus persona-level recompute tolerances and admin/log surfaces.

## The two beliefs

For every AI faction, computed each turn at the end of the turn processor:

1. **`enemy_strength_total`** — running total of believed military strength of all known enemies (fog-aware).
   - For each enemy fleet ever seen (`player_fleet_intel` rows owned by this faction), sum `quantity_seen × ship_type.points` across all ship-type rows for that fleet.
   - Use the **last-seen** snapshot — if the fleet hasn't been re-spotted this turn, the previous belief stands. If it has been re-spotted, the intel row was already overwritten this turn by the visibility/combat phases, so simply re-summing intel naturally implements "remember + update on re-sighting."
   - Exclude friendly factions (own faction + same `derived_class = 'friend'` in `ai_relationships`, if present; otherwise just self).

2. **`enemy_strength_nearby`** — point value of enemy fleets **currently visible this turn** within **8 hexes** of any planet owned by the faction.
   - "Currently visible" = `player_fleet_intel.last_seen_turn = currentTurn`.
   - Distance = hex distance (use existing `hexUtils` helper) between the enemy fleet's hex and any owned-system hex; min over owned planets ≤ 8.
   - Owned planets come from `mapState.systems` filtered by owner = this faction.

## Persistence

Write one `ai_world_beliefs` row per (game, player, turn, belief_key) for both keys with `value_json = { points, fleet_count, breakdown }`. Existing table is reused — no schema change for beliefs.

## Persona tolerances (schema change)

Add two columns to `ai_personas`:
- `enemy_strength_total_tolerance_pct numeric NOT NULL DEFAULT 0.15`
- `enemy_strength_nearby_tolerance_pct numeric NOT NULL DEFAULT 0.25`

Semantics: if `|new − last_recompute_baseline| / max(last_baseline, 1) ≥ tolerance`, mark goals for recompute. For this iteration we **flag** the event (a log entry + `needs_goal_recompute` belief row) — actual goal recomputation is downstream and out of scope.

The "last recompute baseline" is the value of the belief at the last turn that triggered a recompute (or first turn for that faction). Store it as a third belief row `enemy_strength_total_baseline` / `enemy_strength_nearby_baseline` updated only when a trigger fires.

## New phase

Add `src/lib/turnProcessor/phases/threatAssessment.ts`, registered in `PHASE_ORDER` **after `visibilityPhase`** (so intel rows are fresh). Phase:
1. Loads `ai_personas` for personas attached to AI factions in this game.
2. Loads `player_fleet_intel` + `ship_types.points` for each AI faction.
3. Computes the two metrics, writes `ai_world_beliefs`, compares vs baseline, and emits:
   - one `threat_assessment` game-log entry per AI faction with both numbers and whether either trigger fired,
   - and updates the baseline rows when a trigger fires.

## Admin UI surfacing

`AIInspector.tsx` already has a "World beliefs (latest)" section. Add a dedicated **"Threat assessment"** card above it that pulls the latest row for `enemy_strength_total`, `enemy_strength_nearby`, their baselines, the persona tolerances, and the delta % — color the delta when over tolerance.

`AdminAIConfig.tsx` persona editor: add two number inputs (0–1, step 0.05) for the two tolerances next to the existing trait sliders.

## Files

- **New**: `src/lib/turnProcessor/phases/threatAssessment.ts`
- **Edit**: `src/lib/turnProcessor/index.ts` (register phase), `src/lib/turnProcessor/types.ts` (add `threat_assessment` to `PhaseName`)
- **Edit**: `src/components/admin/ai/AIInspector.tsx` (new section)
- **Edit**: `src/pages/AdminAIConfig.tsx` (two tolerance inputs)
- **Migration**: add two columns to `ai_personas` with defaults; backfill is automatic via DEFAULT.

## Out of scope (call out)

- Actually re-running goal selection on a trigger — only the trigger flag/log is produced now.
- Treating "friend" factions specially beyond excluding self (no `ai_relationships` integration this pass unless you want it).
