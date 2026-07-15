
## Goal

Today, a `fleet_attack` order triggers a single-round ground combat. If both invaders and defenders survive, the round ends in "stalemate" and nothing happens next turn unless the attacker re-issues the order. We'll split the mechanic in two so any planet with opposing ground forces automatically continues combat each turn until one side is eliminated.

## Model change

Introduce a new persistent per-planet field:

```
SystemData.landed_forces: Array<{
  owner_classification: string;   // faction name/code, matches sys.owner comparison
  quantity: number;               // ground-force units on the surface
}>
```

Stored inside the existing `games.map_data_json` (no DB migration — systems already serialize to JSON). Empty/omitted = nothing on the surface.

Meaning:
- `sys.current_ground_defenses` remains the defender's organized garrison (planet owner).
- `sys.landed_forces` is every OTHER faction's boots on the ground (hostile to owner, and possibly hostile to each other).
- A faction can have at most one bucket per planet — landings from the same faction stack.

## New phase split

Rename/restructure the ground combat phase into two sub-steps, both inside `phases/groundCombat.ts` (single phase, two ordered stages):

### Stage 1 — Landing (once per turn, triggered by orders)

Existing invasion-eligibility rules stay identical (fleet_attack order + `Attack Planet` strategy + effective GI + range). Instead of resolving combat immediately:

1. Compute each invader's effective GI as today.
2. Add that GI to `sys.landed_forces[owner_classification]` (create bucket if missing).
3. Write back the fleet's `current_ground_invasion` = 0 (troops disembarked). INFECT-transport destruction (existing code) still runs here.
4. Log `troops_landed` per invader with quantity landed.

No inter-invader Phase A here — landings just deposit forces.

### Stage 2 — Surface combat (every turn, every contested planet)

Runs for every system where `landed_forces.length > 0`. One deterministic round per turn:

1. **Hostile-vs-hostile pairing (Phase A).** If two or more owners are present in `landed_forces` who are hostile to each other, deterministically shuffle owner buckets, pair them, resolve one simultaneous round per pair using the existing `resolveRound` engine and `ground_combat_kill_chance`. Odd bucket sits out. Update buckets, drop zeros.
2. **Assault on garrison (Phase B).** Among surviving hostile buckets, pick the largest (ties broken deterministically) as champion. Champion fights ONE round vs `current_ground_defenses`. Apply losses.
3. **Ownership resolution** (after the round):
   - If `current_ground_defenses > 0` OR more than one owner still holds surface forces → no ownership change; state persists for next turn.
   - If `current_ground_defenses == 0` AND exactly one non-owner faction has surface forces left → that faction captures the planet. Its bucket empties into `current_ground_defenses` as the new garrison (or stays as `landed_forces` under the new owner — see design detail below). Existing Synod-purge and colonize logic run here.
   - If everyone is wiped → planet becomes ownerless (existing "mutual annihilation" case) but only when defender also hit 0.
4. INFECT survivor-multiplier and INFECT capture rules apply exactly as today, just gated on the Phase B step of the persistent engine.

### Persistence

Because `landed_forces` lives on the system, the surface combat stage runs automatically every turn for any contested planet — no new player order, no re-issued attack. Combat continues round by round until resolved.

## Logging

- `troops_landed` (new, stage 1): landing event per invader.
- `surface_combat_round` (new, stage 2): per-planet round summary with Phase A pairings, Phase B result, remaining forces.
- Existing `planet_captured` / `planet_colonized` / `ground_invasion_repulsed` / `dispatch_ground_combat` fire from stage 2 when the round concludes ownership.
- `surface_combat_ongoing` (new): fires when the round ended but forces remain on both sides, so the log viewer explicitly shows "combat continues next turn".

## Order & attack-range interaction

- `fleet_attack` order lifecycle unchanged: consumed at end of turn (already done).
- Range check applies only at landing time (stage 1). Once forces are on the ground, surface combat proceeds regardless of the launching fleet's position or continued existence.

## Reinforcement

- Defender's `ground_force_replacement` in the economy phase already tops up `current_ground_defenses` each turn — that behavior remains, so a defender can keep replenishing between rounds.
- Additional landings from the same or new attackers just add to existing buckets on subsequent turns.

## Files touched

- `src/lib/mapTypes.ts` — add `landed_forces?: Array<{ owner_classification: string; quantity: number }>` to `SystemData`.
- `src/lib/turnProcessor/phases/groundCombat.ts` — split into `landingStage` + `surfaceCombatStage`; run landings from `fleet_attack` orders, then iterate over every system with `landed_forces` for surface combat.
- Minor UI: surface `landed_forces` in the admin planet inspector / player system panel so contested planets are visible (out of scope for behavior, add only a read-only display line).

## Migration/back-compat

- No SQL migration. Systems without `landed_forces` are treated as empty.
- Existing in-flight stalemate games: on the next turn, if attackers/defenders both still exist as before, the mechanic simply doesn't retroactively convert them — the attacker must issue one more `fleet_attack` to land forces, after which the persistent loop takes over.

## Non-goals

- No changes to fleet combat, movement, economy, or intel scoring.
- No new player orders — the persistent combat is a world-state consequence of a prior landing.
- No changes to strikecraft/orbital layers.
