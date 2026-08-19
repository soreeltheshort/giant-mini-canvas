# AI Dev Round 1 — Kill Switch, Phase Rename, Two New Personas

Implements the three items in the uploaded verified review. I re-read the repo and confirmed every claim it makes.

## What I verified

- `TurnContext` has no game row and no AI flag; `runTurnProcessor` loads orders + game_factions + factions only.
- `aiActionsPhase` is declared `name: "ai_plans" as any` — the same name as `aiPlansPhase`. Since `index.ts` keys both perf timing and the phase-error log off `phase.name`, AI Actions failures and timings are currently misattributed to AI Plans. All ~10 internal `ctx.logs.push` calls in that file also hardcode `phase: "ai_plans"`.
- `games.enable_ai_slates` exists, `NOT NULL DEFAULT false`, and is read nowhere in the turn processor (only the AI Inspector reads it for display).
- `RECOMMENDED_GOAL_WEIGHTS` in `goalCatalog.ts` is keyed by persona **name** and is the only source the seeder's `backfillGoalWeights` uses; a `goalWeights` field on a `DEFAULT_PERSONAS` entry would be silently ignored. Confirmed the `?? 1.0` fallback, so explicit `0` entries are required to zero a goal.
- `ai_personas` has no `is_active`; traits are the 7 confirmed columns. `model_key` / `system_prompt` are unused anywhere in `src/`.
- Only `enhance_offense` has an execution path, so both new personas stay inert until `bolster_defense` / `conquer` land.

## Step 1 — Phase rename (own change, no behaviour shift)

`src/lib/turnProcessor/phases/aiActions.ts`: `name: "ai_actions"`, and every internal log's `phase:` field moves from `"ai_plans"` to `"ai_actions"`. Add `"ai_actions"` to the `PhaseName` union in `types.ts` (and `"ai_slates"` / `"ai_plans"` are already there). This makes AI Actions logs and perf timings distinguishable, which is a prerequisite for verifying step 2.

## Step 2 — AI kill switch

- `TurnContext` gains `enableAiSlates: boolean`.
- `index.ts` adds a fourth parallel query for `games.enable_ai_slates` and populates the field.
- `aiSlates`, `aiPlans`, `aiActions` each open `run()` with a guard: if disabled, push one `ai_skip` log naming their own phase and return.
- Migration: `update games set enable_ai_slates = true;` so the flag behaves as an off-switch, not an opt-in — existing games keep their current behaviour.
- Add a per-game toggle for the flag in the AI Inspector admin panel (it already loads the column) so a run can be killed without a code change.

Note: this restores gating that was removed earlier when slates appeared stale. The backfill-to-true plus the visible admin toggle avoids the "AI silently off" failure mode that caused that removal.

## Step 3 — Two new personas

Two files, both required:

- `src/lib/ai/seedDefaultPersonas.ts` — append `Synod` (aggression 0.9, expansionism 0.5, economic_focus 0.1, risk_tolerance 0.6, loyalty 0.5, paranoia 0.5, diplomacy 0.0) and `Neutral Colonies` (0.1 / 0.05 / 0.3 / 0.1 / 0.5 / 0.9 / 0.3) to `DEFAULT_PERSONAS`.
- `src/lib/ai/goalCatalog.ts` — append matching entries to `RECOMMENDED_GOAL_WEIGHTS` with explicit `0` values for the goals each persona must never pursue: Synod = enhance_offense 1.0, conquer 1.0, bolster_defense 0.6, rest 0; Neutral Colonies = bolster_defense 1.0, rest 0.

One shared persona row each; per-game variance stays available via `game_factions.ai_persona_id`.

## Not in this round

`bolster_defense` and `conquer` execution (next two rounds, in that order), and an implement-or-drop decision on the vestigial `model_key` / `system_prompt` / `ai_plan_steps` schema.
