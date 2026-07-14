# Performance Analysis Plan: Game Load & Turn Processing (Admin-Only)

## Goal
Measure — not guess — where wall-clock time is spent when (a) loading a game in Admin and (b) running a turn. Produce a per-activity breakdown you can read after each run to decide what to optimize. **Instrumentation runs only for admins**; regular players pay no overhead.

## Admin gating
- Reuse the existing role check (`has_role(auth.uid(), 'admin')`) already used for admin routes.
- On the client, gate via the current `useUserRole` / admin context so the perf helpers become no-ops for non-admins.
- Server-side (turn processor): accept an `enablePerf: boolean` flag on `RunTurnArgs`. `AdminGames.runTurn` passes `true`; `gameLifecycle.ts`'s player-triggered path passes `false`. This keeps player turn runs unaffected even if a non-admin path ever calls the processor.
- The `perf_report` `game_logs` row is only inserted when `enablePerf` is true, so player logs stay clean.

## Approach
Add lightweight `performance.now()` timers around every meaningful step, collect timings into a structured report, and (admin-only) surface it two ways:
1. `console.table(...)` — immediate developer view.
2. A single `log_type: "perf_report"` row in `game_logs` with `details_json.perf = [{name, ms, pct}, ...]` so results are persisted and comparable across turns.

No schema changes. No behavior changes.

## What we will instrument

### A. Game loading (AdminGames "Load" flow) — admin-only
- `games.select`, `map.download`, `map.deserialize`
- `factions.load`, `intel.load`, `logs.load`, `snapshots.load`
- `catalog.load` (ship_types + facility_types)
- `render.first_paint` (data-ready → first canvas draw via `requestAnimationFrame`)

### B. Turn processing (`runTurnProcessor`) — only when `enablePerf`
Wrap each phase in `PHASE_ORDER` and record `{name, ms}`, plus:
- `seedFactionPlayers`
- `orders+players+factions` parallel load
- Phases: `economy`, `shipProduction`, `combat`, `scuttle`, `movement`, `transferShips`, `groundCombat`, `infectIntelLeech`, `visibility`, `threatAssessment`
- `logs.bulkInsert`
- Post-turn in `AdminGames.runTurn`: `map.serialize`, `games.update`, `factions.updateLoop` (per-player await — suspected hotspot), `refreshLogs`, `fetchGames`

### C. Sub-phase drill-down (heaviest phases only)
Inside `groundCombat` and `economy`, add nested timers around fetch / compute / write blocks. Other phases stay at phase-level until the report tells us to drill deeper.

## Report shape
```
Turn 47 perf (Test050) — admin
┌─────────────────────┬────────┬──────┐
│ step                │ ms     │ %    │
├─────────────────────┼────────┼──────┤
│ economy             │  1240  │ 38%  │
│ groundCombat        │   610  │ 19%  │
│ factions.updateLoop │   410  │ 13%  │
│ ...                 │        │      │
└─────────────────────┴────────┴──────┘
total: 3220 ms
```

## Files touched
- `src/lib/turnProcessor/index.ts` — `PerfTimer` helper, `enablePerf` flag on `RunTurnArgs`, wrap phases + bulk insert, return report on result.
- `src/lib/turnProcessor/phases/economy.ts`, `phases/groundCombat.ts` — nested timers guarded by the same flag.
- `src/pages/AdminGames.tsx` — time load-game + post-turn steps, `console.table`, insert `perf_report` row. All gated on the admin check.
- `src/lib/gameLifecycle.ts` — pass `enablePerf: false` so player-driven turn processing stays untouched.
- No new files, no migrations.

## Out of scope (Phase 2)
- Actual optimizations (batching per-player updates, indexes, memoizing deserialization).
- Server-side timings inside RLS / edge functions.
- Instrumenting `PlayerGame.tsx` load path.

## Deliverable
After you run one turn as an admin on Test050, you get a console table + a persisted `perf_report` row telling us which phase and sub-step to attack first. Regular players see and pay for nothing.
