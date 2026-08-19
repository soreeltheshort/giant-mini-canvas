# Review: AI Dev Round 1

I checked both items against the codebase. The intent is sound, but four of the document's assumptions are wrong as written and would fail or silently misbehave. Below is what's true, what needs to change, and a corrected version of the round.

## 1. Kill switch — findings

- **`ctx.game` does not exist.** `TurnContext` (`src/lib/turnProcessor/types.ts`) carries `gameId`, `currentTurn`, `mapState`, `players`, `factions`, `orders`, `logs` — no game row. `ctx.game.enable_ai_slates` would throw, not silently read undefined.
- **Phases are objects, not functions.** All three are `export const aiSlatesPhase: Phase = { name, label, async run(ctx) }`. The `export async function aiSlatesPhase(ctx)` snippets don't match the file shape.
- **`ctx.log.push` is wrong.** It's `ctx.logs.push({ game_id, turn_number, phase, log_type, message })`.
- **The flag defaults to `false`.** The migration adds `enable_ai_slates boolean NOT NULL DEFAULT false`, and it was deliberately unhooked earlier so slates run every turn. Adding the guard as-is turns AI **off for every existing game**, including the test games. This is the opposite of "pure no-op".
- **`aiActionsPhase` is not registered as a phase in `PhaseName`** — worth confirming where it's invoked before adding a guard there.

Corrected approach:
1. Load the game row once in `runTurnProcessor` (`src/lib/turnProcessor/index.ts`) and add `game` (or just `enableAiSlates: boolean`) to `TurnContext`.
2. Guard inside each phase's `run(ctx)` body, logging via `ctx.logs.push`.
3. Backfill first: `update games set enable_ai_slates = true` for existing games (or default the new ctx field to `true` when the column is null/absent), so the guard is genuinely a no-op on day one.

## 2. Persona seed — findings

- **Column names are wrong.** `ai_persona_goal_weights` uses `goal_type`, not `goal_code`. `ai_personas` has no `is_active` column; it has `name, description, model_key, system_prompt`, seven trait columns, and two tolerance columns.
- **Omission is NOT exclusion.** `scoreGoals.ts` line 102: a missing weight row falls back to `{ base_weight: 1, urgency_multiplier: 1 }`. Omitted goals still score at full base weight. Both personas would behave nothing like intended.
- **`seedDefaultPersonas` actively re-adds omitted rows** — it backfills every code in `GOAL_CODES` for personas missing weights, so any hand-omitted goal comes back on the next seed run.
- **Traits are mandatory to the behavior.** `traitFactor` multiplies every goal by persona traits; a persona seeded without explicit traits inherits column defaults and won't act "dormant/defensive".

Corrected approach:
1. Seed both personas as entries in `DEFAULT_PERSONAS` (`src/lib/ai/seedDefaultPersonas.ts`) with explicit traits, rather than raw SQL — that keeps them idempotent and re-seedable.
2. Add an explicit per-persona goal-weight override map with **explicit `0` rows** for excluded goals (`colonize`, `expand_economy`, `degrade_enemy`, and for Neutral everything but `bolster_defense`), so exclusion survives both scoring and re-seeding.
3. Proposed traits — Synod: aggression 0.9, expansionism 0.5, economic_focus 0.1, risk_tolerance 0.6, loyalty 0.5, paranoia 0.5, diplomacy 0.0. Neutral Colonies: aggression 0.1, expansionism 0.05, economic_focus 0.3, risk_tolerance 0.1, loyalty 0.5, paranoia 0.9, diplomacy 0.3.

## 3. Open question from the document

Shared persona row vs per-instance: the code already supports both — `game_factions.ai_persona_id` overrides `factions.ai_persona_id`. Recommend **one shared row per persona** and per-instance variance later via game_factions overrides. No schema change needed either way.

## Agreements

The scope call is right: `conquer` and `bolster_defense` execution don't exist in `aiActions.ts` (only `enhance_offense` is wired), so both personas will be inert until the next round. No relationship-table writes are needed.

## Technical summary of the corrected round

| Item | Change |
| --- | --- |
| `src/lib/turnProcessor/types.ts` | Add `enableAiSlates: boolean` to `TurnContext` |
| `src/lib/turnProcessor/index.ts` | Select `enable_ai_slates` from `games`, populate ctx |
| `aiSlates.ts`, `aiPlans.ts`, `aiActions.ts` | Early return + `ctx.logs.push` skip entry inside `run()` |
| Migration | `update games set enable_ai_slates = true` backfill |
| `src/lib/ai/seedDefaultPersonas.ts` | Add Synod + Neutral Colonies with traits and explicit 0-weight exclusions |

Say the word and I'll build the corrected version; or tell me if you'd rather keep the kill switch defaulting off and flip games on manually.
