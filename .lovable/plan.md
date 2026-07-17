
## Phase 2a — Prioritized Goals + Stability-Gated Revision

Answer to "next step": build the remainder of Phase 2a (Slice 1 is already in). Still no writes to `player_orders` — this phase only decides *what the AI wants*, so you can watch it think in the Inspector before we wire planners.

### Scope in one line

Each AI faction gets a fixed 3-slot goal slate committed for N turns, watched by a compact worldview fingerprint that forces re-planning when the world moves outside persona-tuned tolerances.

---

### 1. Data model

**New table `ai_goal_slates`** — one row per `(game_id, player_id)` (unique).

```
id uuid pk
game_id uuid fk games
player_id uuid fk auth.users
faction_key text
slot1_goal_id / slot2_goal_id / slot3_goal_id  uuid fk ai_goals (nullable)
committed_turn int
next_mandatory_review_turn int
worldview_snapshot_json jsonb   -- the fingerprint at commit time
worldview_hash text             -- cheap change detector
last_revision_reason text       -- 'mandatory'|'tolerance'|'lost_system'|'goal_resolved'|'initial'
updated_at, created_at
```
RLS: admins full; players read own; service_role all. Grants per house rules.

**`ai_goals` gets:**
- `slate_slot int` (1|2|3|null)
- `progress_json jsonb default '{}'`
- `outcome text default 'pending'` — enum-in-check: `pending|achieved|abandoned|superseded`

No changes to existing AI tables. `landed_forces`, `player_fleet_intel`, `ai_world_beliefs` (from threat assessment) are read as inputs.

### 2. Worldview fingerprint (`src/lib/ai/worldview.ts`)

Pure function `computeWorldview(ctx) => { dims, hash }`. All dims come from existing data — no new sensors.

| Dim | Source | Tolerance semantics |
|---|---|---|
| `owned_systems_count` | game systems where owner matches faction (uses `ownerMatchesFaction`) | integer delta, tolerance `± T_systems` |
| `treasury_band` | `game_factions.credits` bucketed (0–100 / 101–500 / 501–2k / 2k–10k / 10k+) | band step |
| `fleet_power_band` | Σ ship point-cost of own `game_fleets` / `game_fleet_ships`, bucketed same way | band step |
| `frontier_pressure` | count of owned systems adjacent (≤2 hex) to a hostile fleet or hostile-owned system | integer delta `± 2` |
| `top_threat_player_id` | argmax of `ai_relationships.opinion * -1` (most-hated), null-safe | identity change |
| `relationship_shift_max` | max abs delta of any relationship opinion vs snapshot | numeric `> 0.25` |
| `lost_system_this_window` | any own system flipped ownership since `committed_turn` | boolean → forced |
| `at_war_count` | count of `derived_class = 'enemy'` or hostile intel contacts | integer `± 1` |
| `enemy_strength_total` / `enemy_strength_nearby` | already written by `threatAssessment.ts` | reuse existing persona tolerance % |

`hash` = stable SHA-1 of the canonicalised dim JSON (used only for a fast "unchanged" short-circuit in the log; tolerance is still the source of truth).

Trait modulation on numeric tolerances:
```
effective = base * (1 + 0.6*loyalty - 0.6*paranoia)   // clamp [0.25*base, 3*base]
```
Commitment window:
```
max_commitment_turns = clamp(round(4 + 8*loyalty - 4*paranoia), 3, 12)
next_mandatory_review_turn = committed_turn + max_commitment_turns
```

### 3. Goal scoring (`src/lib/ai/scoreGoals.ts`)

For each of the 6 goals in `goalCatalog.ts`:

```
score = base_weight
      * urgency_multiplier          -- from ai_persona_goal_weights
      * traitFactor(goal, persona)  -- per-goal formula (see below)
      * relationshipFactor(goal, ctx) -- e.g. conquer scales with top_threat opinion
      * beliefFactor(goal, worldview) -- e.g. bolster_defense scales with enemy_strength_nearby
```

Per-goal trait formulas (documented in file header, one-liner each):
- `colonize`: `1 + expansionism*0.8`
- `expand_economy`: `1 + economic_focus*0.9`
- `enhance_offense`: `1 + aggression*0.7 + risk_tolerance*0.3`
- `bolster_defense`: `1 + paranoia*0.9 - risk_tolerance*0.3`
- `degrade_enemy`: `1 + aggression*0.5 + paranoia*0.4`
- `conquer`: `1 + aggression*0.8 + expansionism*0.4 - diplomacy*0.4`

Return sorted `[{goal_code, score, breakdown}]`. Top 3 become the slate; ties broken by persona base_weight then goal_code alpha.

### 4. Slate builder (`src/lib/ai/goalSlate.ts`)

Entry point: `computeSlate(gameId, playerId, opts)` — pure over the data it fetches; no side effects except when `opts.commit = true`.

Algorithm each turn:
```
1. Load existing slate (if any) + persona + worldview.
2. Compute current fingerprint.
3. Decide revision:
   - no slate                       -> reason='initial'
   - currentTurn >= next_mandatory  -> 'mandatory'
   - lost_system_this_window        -> 'lost_system'
   - any slate goal.outcome != pending -> 'goal_resolved'
   - any dim outside effective tol  -> 'tolerance' (record which dim)
   - else                           -> keep slate, no writes
4. On revision: score goals, pick top 3, upsert ai_goals rows with slate_slot 1/2/3
   and outcome='pending', mark prior slate goals outcome='superseded' (unless
   still in top 3 — then reuse row & bump slate_slot if changed).
5. Upsert ai_goal_slates with new snapshot/hash/committed_turn.
6. Write ai_decision_log rows: one for the reason, one per goal with score breakdown.
```

### 5. Turn integration — deliberate seam, but no orders

Two invocation surfaces, same code path:

- **Turn processor hook (opt-in per-game flag `enable_ai_slates`).** New phase `src/lib/turnProcessor/phases/aiSlates.ts` after `threatAssessment`, before economy. Wrapped in try/catch — a slate failure never blocks the turn. For every AI faction with a persona, call `computeSlate(..., { commit: true })`. Guarded off by default until we've watched a few runs.
- **Inspector "Compute Tick" button.** Runs the same function against the current turn without processing the turn. Uses dry-run mode (`commit: false`) for preview and a "Commit" toggle when you want to persist.

`processTurn()` in `gameLifecycle.ts` gains one call site behind the flag. Zero effect on non-AI factions and zero effect on turn output otherwise.

### 6. Inspector UI (`src/components/admin/ai/AIInspector.tsx`)

Two new sections, styled to match the existing threat-assessment card:

**Current Slate** — three lanes P1/P2/P3 with goal code, score, key breakdown factors, `slate_slot`, `outcome` chip, `progress_json` preview, `committed_turn`, `next_mandatory_review_turn`.

**Revision Trace** — table of `ai_decision_log` rows filtered to `phase = 'goals'` for the selected game/player, newest first, showing turn, reason, and which dim tripped (from the log payload).

Plus two buttons at the top of the slate section: **Compute Tick (dry-run)** and **Commit Tick**. Admin only.

### 7. Files

**New**
- `src/lib/ai/worldview.ts`
- `src/lib/ai/scoreGoals.ts`
- `src/lib/ai/goalSlate.ts`
- `src/lib/turnProcessor/phases/aiSlates.ts`
- Migration: `ai_goal_slates` + `ai_goals` new columns + grants/RLS

**Edit**
- `src/lib/turnProcessor/index.ts`, `src/lib/turnProcessor/types.ts` — register phase
- `src/lib/gameLifecycle.ts` — flag check + phase enrol
- `src/components/admin/ai/AIInspector.tsx` — slate + trace UI + tick buttons
- `src/pages/AdminAIConfig.tsx` — expose the `enable_ai_slates` game-level flag (per-game admin toggle lives on `games`)
- Migration for `games.enable_ai_slates boolean not null default false`

**Not touched:** `player_orders`, combat, ground combat, planners (Phase 3+).

---

## Test Plan (Phase 2a acceptance)

Priority 1 tests must pass before we move on to Phase 3.

### A. Slate creation
- **A1** New AI faction with no prior slate → first Compute Tick writes exactly one `ai_goal_slates` row with 3 filled slots, matching top-3 scored goals; log reason `initial`.
- **A2** Slate `committed_turn = currentTurn`; `next_mandatory_review_turn = committed_turn + clamp(round(4 + 8*loyalty − 4*paranoia), 3, 12)`.
- **A3** Warlord (aggression 0.9) puts `conquer` or `enhance_offense` in P1; Trade Senator (economic_focus 0.9) puts `expand_economy` in P1; Paranoid Isolationist puts `bolster_defense` in P1. Verify from the score breakdown in `ai_decision_log`.

### B. Stability
- **B1** Turn advances with all dims unchanged → Compute Tick does NOT rewrite the slate; log shows "keep, no dim breach".
- **B2** Treasury increases within band → no revision.
- **B3** Treasury crosses a band → revision reason `tolerance:treasury_band`.
- **B4** `owned_systems_count` changes by +1 with `paranoia=0.9` (tight tolerance) → revision; same change with `loyalty=0.9` (wide) → no revision.

### C. Forced revisions
- **C1** Own system flips ownership → next tick revision reason `lost_system` regardless of other tolerances or commitment window.
- **C2** Reach `next_mandatory_review_turn` with all dims stable → revision reason `mandatory`.
- **C3** Mark a slate goal `outcome='achieved'` manually → next tick revision reason `goal_resolved`.

### D. Goal continuity
- **D1** Revision that keeps the same goal in a slot: existing `ai_goals` row is reused, `slate_slot` preserved, `outcome` stays `pending`.
- **D2** Revision that drops a goal: prior row becomes `outcome='superseded'`; new goal inserted with the freed slot.

### E. Threat integration
- **E1** `enemy_strength_nearby` above baseline+tolerance (from threat assessment) → revision reason includes `tolerance:enemy_strength_nearby` AND `bolster_defense` moves up at least one slot for Paranoid Isolationist.
- **E2** New `top_threat_player_id` for Warlord → `conquer` targeting that player scores higher; slate reshuffles if it wasn't already P1.

### F. Turn processor integration
- **F1** `games.enable_ai_slates = false` (default) → running a turn writes NO slate rows and NO `phase=goals` decision logs. `processTurn` runtime unchanged within noise.
- **F2** `enable_ai_slates = true` → each AI faction has exactly one slate row and one "reason" decision log entry per turn; a phase failure (simulate by throwing in `aiSlates.ts`) is caught and the rest of the turn still processes.
- **F3** Non-AI factions never get slates.

### G. Inspector
- **G1** Admin opens Inspector on a game with slates → sees P1/P2/P3 with score breakdowns and both timestamps.
- **G2** "Compute Tick (dry-run)" shows what would change without writing; "Commit Tick" persists and refreshes the panel.
- **G3** Revision Trace lists the last N `phase=goals` log rows in reverse chronological order with the reason column populated.

### H. Determinism
- **H1** Snapshot a game, run Compute Tick, restore snapshot, run Compute Tick again → identical slate rows, identical scores in the log breakdown.

### Manual test script for Test050
Load Test050 → enable `enable_ai_slates` on the game → set Synod's persona to Warlord → run turn 48 → open Inspector: expect P1=`conquer`, threat-driven revision reason. Advance turns with no world change until `next_mandatory_review_turn` hits → expect `mandatory` revision.

---

### Open tests (deferred, still to run)
- **Test 9** — not yet run. Skipped during the Phase 2a acceptance pass; revisit and run before closing Phase 2a.

---

### Out of scope (explicitly still deferred)
- Planners that emit `player_orders` (Phase 3+).
- Follow-through queue *execution* (table exists from Slice 1).
- `ai_relationship_events` emission from combat (Phase 6).
- LLM narration of decisions.
- Multi-turn lookahead, coalitions, treaty negotiation.
