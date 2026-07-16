## Fix Draft Garrison UX + ownership bleed on Vesta Line

Three separate bugs on the planet panel. Each fix is scoped and unrelated to the others.

### 1. Draft Garrison button — no click sound, instant DB write

Today `handleRecruitGarrison` in `src/pages/PlayerGame.tsx` writes the system row directly (`writeSystemEdit` → immediate DB update of `current_ground_defenses`), which is why:
- there is no `playOrderPlaced()` sound (only test‑mode admin edits use that path),
- long DB waits look like a dead button,
- and it does not follow the "queue between-turn orders" convention that `handleBuildFacility` uses.

**Change:** convert Draft Garrison and Disband Garrison to queued `player_orders`, matching `handleBuildFacility`:

- Insert `player_orders` rows with new `order_type = "recruit_garrison"` / `"disband_garrison"` and `order_json = { system_id }`. No treasury debit at click time — validation moves to the economy phase.
- Call `playOrderPlaced()` immediately on click for audio feedback; toast "Order Submitted".
- Show queued recruit/disband orders in the same undo strip that already handles `build_facility` (so double‑clicking or misclicking is recoverable).
- Client‑side gating stays: hide/disable the button unless viewer owns the system, `cur < max`, and treasury ≥ cost.

**Turn processor:** add handlers in `src/lib/turnProcessor/phases/economy.ts` alongside `build_facility` handling. For each recruit order: re‑validate owner + cap + treasury; if OK, `current_ground_defenses += 1`, debit `ground_force_replacement_cost` via the player's maintenance accumulator, log `garrison_recruited`. Disband: `-1`, no refund, log `garrison_disbanded`. Bounded by `max_ground_defenses`.

### 2. "Test edit failed — canceling statement due to statement timeout"

That toast comes from `writeSystemEdit` on the direct-write path used by Draft Garrison. Root cause is systemic — `writeSystemEdit` rewrites the systems JSON on the game row and occasionally times out under load. Once (1) is done, Draft Garrison no longer touches `writeSystemEdit`, so the error path disappears for this action. No further backend work needed for this bug.

### 3. Ground Defenses includes invaders; owner pays their upkeep

Post‑refactor the model is:
- `system.current_ground_defenses` — owner's organised garrison only
- `system.landed_forces[]` — every hostile bucket on the surface

Two places still leak invader units into the owner's numbers:

**a. Display (`src/components/game-shell/GarrisonCard.tsx`).** `cur = system.current_ground_defenses` is already owner‑only, but users on Vesta Line see it inflated because prior turns folded invaders in before the refactor. Add a defensive filter: if any `landed_forces` bucket's `owner_classification` matches `system.owner` via `ownerMatchesFaction`, split it back out into a separate friendly row (it should never happen post‑refactor, but tolerate legacy data). Render `landed_forces` as a distinct "Hostile Forces on Surface" list under Ground Defenses with per-faction quantity — never summed into the `cur / max` line or its progress bar.

**b. Maintenance (`src/lib/turnEngine.ts` step 9b).** `groundDefenseMaintenance = current_ground_defenses * ground_defense_maintenance` — correct in principle, but the `processNextTurn` receives `sys` from `mapState.systems`, which for pre‑refactor games still has invaders folded in. Add a one‑shot migration in `src/lib/turnProcessor/phases/economy.ts` (before per‑system processing) that, for any system where `landed_forces` and `current_ground_defenses` were previously commingled, subtracts hostile buckets out of `current_ground_defenses` and pushes them into `landed_forces`. Guard on a `landed_forces_migrated` flag stored in the system's `details` so it only runs once per system. This guarantees the owner is only ever billed for their own troops going forward.

Also assert in `groundCombat.ts` landing stage that any bucket whose `owner_classification` matches `sys.owner` is folded into `current_ground_defenses` (not appended to `landed_forces`) — this is already documented in the type but worth re‑verifying in code and covering with an explicit branch.

### Files touched

- `src/pages/PlayerGame.tsx` — swap `handleRecruitGarrison`/`handleDisbandGarrison` to queue `player_orders`, play sound, include in undo strip
- `src/lib/turnProcessor/phases/economy.ts` — apply `recruit_garrison`/`disband_garrison` orders; one‑shot migration to split invaders out of `current_ground_defenses`
- `src/lib/turnProcessor/phases/groundCombat.ts` — verify same‑owner landings never enter `landed_forces`
- `src/components/game-shell/GarrisonCard.tsx` — render hostile `landed_forces` as a separate list, never merged into `cur`
- `src/components/game-shell/LeftPanel.tsx` — pass `landed_forces` through if it isn't already available via `system`

### Non‑goals

- No change to `ground_force_replacement_cost` or `ground_defense_maintenance` values.
- No change to combat resolution — surface combat still runs every turn via the existing two‑stage `groundCombat` phase.
- No new player order types beyond `recruit_garrison` / `disband_garrison`.
- No DB schema migration; `landed_forces` already lives in the systems JSON.