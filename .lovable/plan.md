
## Phase 2b — Target Binding & Plan Generation

Phase 2a decides *what* each AI faction wants (3 prioritized goals). Phase 2b decides *where and against whom* each goal would be pursued, and *what it would cost*, and writes that as an inspectable plan. Still zero writes to `player_orders` — you can watch the AI form concrete intent in the Inspector before Phase 3 turns intent into orders.

### Scope in one line
For each slot in a committed slate, resolve one concrete target and an estimated cost/feasibility, persisted as `ai_plans` + `ai_plan_steps`, revised on the same cadence as the slate.

---

### 1. Data model

`ai_plans` and `ai_plan_steps` already exist from Slice 1. Add columns only:

**`ai_plans` additions**
```
goal_id uuid fk ai_goals             -- which slate goal this plan realises
slate_slot int                        -- 1|2|3, denormalised for fast join
target_kind text                      -- 'system'|'player'|'fleet'|'none'
target_id uuid                        -- system_id | player_id | fleet_id (nullable)
target_label text                     -- human-readable ("Vesta Line", "Synod")
estimated_cost_credits int
estimated_cost_turns int
feasibility numeric                   -- 0..1
feasibility_reason text               -- 'ok' | 'no_target' | 'insufficient_power' | ...
committed_turn int
status text                           -- 'active'|'superseded'|'abandoned'|'achieved'
scoring_breakdown_json jsonb
```

**`ai_plan_steps`** stays untouched for now (execution is Phase 3).

RLS: admins full; players read own; service_role all. Grants per house rules.

### 2. Target selectors (`src/lib/ai/targetSelectors.ts`)

One pure function per goal code. All read-only over the existing snapshot data used by `worldview.ts` / `scoreGoals.ts`. Each returns `{ target_kind, target_id, target_label, score, breakdown }` or `null` when nothing qualifies.

| Goal | Target kind | Selector logic (deterministic, ties → id asc) |
|---|---|---|
| `colonize` | system | Nearest unowned habitable system to any owned system; prefer higher pop baseline; exclude systems already targeted by another own active plan |
| `expand_economy` | system | Own system with production below empire median; prefer highest headroom (max facility slots − built) |
| `enhance_offense` | system | Own system with highest shipyard tier / production; used as build hub |
| `bolster_defense` | system | Own system with lowest `defense_band` from worldview; break ties by frontier adjacency |
| `degrade_enemy` | player | `top_threat_player_id`; if null, argmax of `ai_relationships.opinion * -1` |
| `conquer` | system | Enemy-owned system adjacent to any own system with hostile intel value ≤ estimated own strike power × persona `risk_tolerance` factor; prefer lowest defender strength |

All selectors take the same `PlanCtx` (systems, own fleets, intel, relationships, worldview, persona). Output is stable across identical inputs — same determinism rules as Phase 2a.

### 3. Cost & feasibility (`src/lib/ai/planCost.ts`)

Uniform estimator per goal, reads existing combat/economy constants from `combat_constants`:

```
estimated_cost_credits = f(goal_code, target, persona)  -- e.g. conquer = attacker_power_needed * credits_per_ship_point
estimated_cost_turns   = ceil(distance / effective_map_speed) + build_lead_turns
feasibility            = clamp(0..1, own_capacity / required_capacity)
feasibility_reason     = 'ok' | 'no_target' | 'insufficient_power' | 'insufficient_credits' | 'blocked_by_range'
```

Feasibility is advisory in this phase — a plan can be recorded with `feasibility < 1` and status `active`; Phase 3 decides whether to actually spend orders on it.

### 4. Plan builder (`src/lib/ai/buildPlans.ts`)

Entry point `buildPlansForFaction(gameId, playerId, opts)`. Pure over fetched data; writes only when `opts.commit = true`.

Algorithm per tick, for each of the 3 slate slots:
```
1. Load slate goal for slot.
2. Run target selector for goal.code.
3. If null target:
     upsert ai_plans row status='active', feasibility=0, reason='no_target', target_kind='none'.
4. Else estimate cost + feasibility.
5. Upsert ai_plans keyed on (game_id, player_id, slate_slot):
     - if existing plan same goal_id + same target_id  -> update cost/feasibility only
     - if goal_id changed OR target_id changed         -> mark prior 'superseded', insert new
6. Emit ai_decision_log rows: one 'plan_bound' per slot with {goal_code, target, cost, feasibility, reason}.
```

Slate revision in Phase 2a already marks prior goals `superseded`; the plan builder mirrors that on plans automatically.

### 5. Turn integration

New phase `src/lib/turnProcessor/phases/aiPlans.ts` runs **immediately after** `aiSlates` in the turn processor. Same try/catch isolation — a plan failure never blocks the turn. No gating flag; runs whenever an AI faction has a persona + slate (mirrors the current post-gate slate behaviour).

Inspector "Compute Tick" button re-invokes `buildPlansForFaction` after `computeSlate` so dry-run and commit tests still hit the whole pipeline.

### 6. Inspector UI (`src/components/admin/ai/AIInspector.tsx`)

Add a **Bound Plans** block under Current Slate:
- One card per slot: goal, target label, feasibility bar, cost credits / cost turns, reason chip, "why this target" breakdown popover.
- Empty state when `target_kind = 'none'` with the reason.
- Revision Trace already reads `ai_decision_log`; filter widens to include `phase in ('goals','plans')`.

### 7. Snapshot integration

`saveSnapshot` / `loadSnapshot` in `AdminGames.tsx` already bake AI state. Add `ai_plans` (and, once used, plan-step rows) to both dump and restore blocks so Test 9-style determinism holds through Phase 2b too.

### 8. Files

**New**
- `src/lib/ai/targetSelectors.ts`
- `src/lib/ai/planCost.ts`
- `src/lib/ai/buildPlans.ts`
- `src/lib/turnProcessor/phases/aiPlans.ts`
- Migration: `ai_plans` new columns + grants unchanged

**Edit**
- `src/lib/turnProcessor/index.ts` — register phase after `aiSlates`
- `src/components/admin/ai/AIInspector.tsx` — Bound Plans block, extended trace filter, Compute Tick chains through
- `src/pages/AdminGames.tsx` — snapshot save/load extended with `ai_plans`

**Not touched:** `player_orders`, combat, ground combat, plan step execution (Phase 3).

---

## Test Plan (Phase 2b acceptance)

Hierarchical numbering. Priority 1 = must pass before Phase 3.

### 1. Plan creation
- **1.1** Faction with a fresh slate → first Compute Tick writes exactly 3 `ai_plans` rows, one per slot, all `status='active'`, each linked to the correct `goal_id` + `slate_slot`.
- **1.2** Each written plan has a matching `ai_decision_log` row with `phase='plans'` and `reason='plan_bound'`.
- **1.3** Non-AI factions produce zero plans.

### 2. Target selection determinism
- **2.1** Two dry-run ticks in a row with no state change return identical `{target_id, cost, feasibility}` per slot.
- **2.2** Snapshot → Compute Tick → restore snapshot → Compute Tick again → identical plan rows and identical `scoring_breakdown_json`.
- **2.3** Tie-breaking: two candidate systems with identical score → selector returns the lower `system_id`.

### 3. Per-goal selectors
- **3.1** `colonize` picks the nearest unowned habitable system to any owned system; verify by moving nearest system's ownership and re-running.
- **3.2** `expand_economy` picks an own system with production below empire median; if all systems above median, `target_kind='none'`, `reason='no_target'`.
- **3.3** `enhance_offense` picks the highest-production own system.
- **3.4** `bolster_defense` picks the own system with the lowest defense band; ties broken by frontier adjacency.
- **3.5** `degrade_enemy` binds to `top_threat_player_id` when present; falls back to most-hated relationship otherwise.
- **3.6** `conquer` picks an enemy-adjacent system whose defender strength ≤ persona-adjusted own strike power; if none, `feasibility=0` and `reason='insufficient_power'` (still recorded).

### 4. Cost & feasibility
- **4.1** `estimated_cost_credits` and `estimated_cost_turns` are non-negative integers; `feasibility` ∈ [0,1].
- **4.2** Reducing `game_factions.credits` below cost estimate flips `feasibility_reason` to `insufficient_credits` on next tick.
- **4.3** Removing all own systems adjacent to a `conquer` target flips reason to `blocked_by_range`.

### 5. Revision continuity
- **5.1** Slate unchanged, target still valid → plan row updated in place, no new row.
- **5.2** Slate revised and slot's goal changed → prior plan `status='superseded'`, new plan inserted with new `committed_turn`.
- **5.3** Slate unchanged but selector picks a new target (world moved) → prior plan `superseded`, new plan inserted; `ai_decision_log` records `target_changed`.
- **5.4** Slot's goal marked `achieved` in Phase 2a → matching plan flipped to `status='achieved'` on next tick.

### 6. Turn processor integration
- **6.1** `aiPlans` runs immediately after `aiSlates` for every AI faction with a persona; verified by phase log order.
- **6.2** Throwing inside `aiPlans.ts` is caught; the rest of the turn completes; a decision log entry with `reason='phase_error'` is recorded.
- **6.3** `processTurn` runtime delta vs Phase 2a within noise (< 10%) on Test050.

### 7. Inspector
- **7.1** Bound Plans block shows 3 cards for the selected AI faction with target label, feasibility bar, cost, reason chip.
- **7.2** "Compute Tick (dry-run)" chains slate + plan build and previews changes without writing; "Commit Tick" persists both.
- **7.3** Revision Trace shows interleaved `phase='goals'` and `phase='plans'` rows in reverse chronological order.
- **7.4** Empty-state card renders when `target_kind='none'` with the correct reason chip.

### 8. Snapshot determinism
- **8.1** Save snapshot, advance 2 turns, restore snapshot, re-run same turns → identical `ai_plans` rows (same target_id / cost / feasibility / breakdown) at each turn.

### 9. Manual test script for Test050
1. Load Test050, set Synod persona = Warlord.
2. Run one turn → open Inspector → confirm P1 = `conquer` and Bound Plan targets an adjacent Dravian system with `feasibility` matching Synod's fleet power.
3. In Test Mode, empty Synod's largest fleet → next tick: same slot, same goal, plan `superseded` with new plan showing `feasibility=0`, `reason='insufficient_power'`.
4. Refill the fleet → plan re-binds with `feasibility ≥ 0.5` and `reason='ok'`.
5. Snapshot before step 2, restore, replay → all plan rows match byte-for-byte in `scoring_breakdown_json`.

### Deferred (still open from Phase 2a)
- **Test 9 (Phase 2a)** — still not run; carry forward.

### Out of scope (Phase 3+)
- Writing `player_orders` from plans.
- `ai_plan_steps` execution.
- Multi-turn lookahead, coalitions, LLM narration.
