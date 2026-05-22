## In-game AI — phased rollout (Phase 1 ready to build)

Deterministic, heuristic in-game AI reusing the existing `ai_*` schema. No LLM calls on any gameplay path. LLM wrapper + `ai_personas.system_prompt`/`model_key` stay dormant for future narrative use.

Each phase is independently testable and approved separately. Only Phase 1 will be built on approval of this plan.

---

### Phase 1 — Persona management UI + Inspector + manual update

Zero gameplay impact. Pure admin tooling plus documentation.

**Persona CRUD on `/admin/ai-config`**
- List all personas with edit / duplicate / delete actions.
- "New persona" button → blank form.
- "Seed defaults" button → idempotently inserts the three starter personas (Warlord, Trade Senator, Paranoid Isolationist) if missing. Safe to click anytime; never overwrites existing edits.
- Persona editor form:
  - Name, description.
  - **Trait sliders** (0–100, numeric value shown): `aggression`, `expansionism`, `economic_focus`, `risk_tolerance`, `loyalty`, `paranoia`, `diplomacy`. Persisted in `ai_personas.traits_json`.
  - **Goal weight matrix** — one row per goal type (`defend_system`, `capture_system`, `eliminate_player`, `accumulate_treasury`, `build_fleet`, `survey_region`, `maintain_alliance`) with `base_weight` slider, `urgency_multiplier` slider, and a small JSON editor for `threshold_json`. Persisted in `ai_persona_goal_weights`.
  - Save / Cancel / Delete (with confirm).
- Persona → AI player assignment happens elsewhere later; Phase 1 only manages the library.

**AI Inspector tab** (read-only)
- Pick game + AI player + turn; render `ai_decision_log`, `ai_goals`, `ai_plans`/`ai_plan_steps`, latest `ai_world_beliefs`, `ai_relationships`. All show empty states until later phases ship.

**Manual update**
- Rewrite the "AI Architecture" manual page to describe the deterministic design and the phase rollout.
- Add a short note that the LLM wrapper exists but is dormant — reserved for future narrative work, not gameplay.

**Files**
- `src/pages/AdminAIConfig.tsx`
- New subcomponents under `src/components/admin/ai/`: `PersonaEditor.tsx`, `GoalWeightMatrix.tsx`, `AIInspector.tsx`, `TraitSliders.tsx`.
- Manual content file (location matches existing manual wiki convention).
- No schema changes, no engine wiring, no new modules under `src/lib/ai/`.

**Acceptance**
- Seed defaults creates three personas with full weight matrices; clicking twice does not duplicate.
- Can create a new persona from scratch, tweak sliders, save, reload — values persist.
- Can duplicate Warlord, edit independently, save.
- Can delete a persona with confirm.
- Inspector renders empty states without errors.
- Turn processing byte-for-byte unchanged.
- Updated manual page reads correctly.

---

### Phases 2–7 (approved in principle, built one at a time)

```text
Phase  What's new                           Risk  How you test
2      Beliefs + relationships              none  Inspector populates after a turn
3      Goal scoring                         none  Slider edits change goal mix
4      Plan rows (empty)                    none  plan_revision rows appear
5a–e   Concrete planners emit player_orders per   AI takes one action class per sub-phase
6      Combat → relationship events         low   Opinion shifts post-battle
7      Final manual polish                  none  Read the page
```

Each will be re-approved with its own plan before build.

### Out of scope
LLM in gameplay · multi-turn lookahead · coalition/treaty negotiation beyond opinion · persona-to-player assignment UI (lives in game-setup work).
