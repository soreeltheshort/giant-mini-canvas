/**
 * Ground Combat Phase
 *
 * Runs after Movement (so fleet positions are final) and before Visibility.
 *
 * Trigger (all three must be true for a fleet to launch a ground invasion):
 *   1. The fleet has a `fleet_attack` order this turn whose target is a
 *      planet/system — either via `target_system_id` directly, or via
 *      `target_fleet_id` whose target fleet sits on a system hex. The target
 *      hex must be within the attacker's ATTACK RANGE
 *      (= floor(attacker_map_speed / 2)) of the attacker's CURRENT position.
 *      Attacking does NOT move the fleet.
 *   2. At least one of the fleet's two strategy slots
 *      (`special1_role` / `special2_role`) is `Attack Planet`.
 *   3. The fleet's effective ground-invasion force is
 *      MAX(`fleets.current_ground_invasion`, sum of `ground_invasion`
 *      capacity across game-fleet-ships in the `Attack Planet` tactical
 *      group). The larger of the two values is what fights.
 *
 * Resolution per planet (single round, deterministic):
 *   1. Phase A — Inter-invader attrition.
 *      If 2+ invaders are present, shuffle them deterministically and pair
 *      them up. Each pair fights ONE simultaneous round of GI-vs-GI: every
 *      unit on each side has a `ground_combat_kill_chance` (default 0.8) of
 *      destroying one enemy unit. Both sides apply losses simultaneously.
 *      An odd unpaired invader sits Phase A out.
 *   2. Phase B — Planet assault.
 *      The surviving invader with the highest remaining effective GI (ties
 *      broken deterministically) makes ONE simultaneous round vs the
 *      planet's `current_ground_defenses` using the same kill chance.
 *      Other surviving invaders do not attack this turn.
 *   3. If `current_ground_defenses` reaches 0, the planet's owner changes
 *      to the attacking fleet's owner. If the planet had 0 population it's
 *      logged as "colonize"; otherwise "capture". Surviving GI stays in the
 *      fleet (write-back to `fleets.current_ground_invasion` only — ship
 *      ground-invasion capacity is a derived stat from the fleet's roster).
 */
import type { Phase, TurnContext } from "../types";
import { fetchFleetMapSpeed, attackRangeFromMapSpeed, hexDistance } from "@/lib/fleetRange";
import { applyPopulationStep } from "@/lib/turnEngine";
import { destroyFleet } from "../fleetCleanup";



// Inline mulberry32 RNG (kept in sync with battleEngine.ts so ground combat
// is fully deterministic per game/turn).
function createRNG(seed: number) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hashSeed(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return hash;
}

/** Fisher-Yates shuffle using a seeded RNG. Mutates `arr`. */
function shuffleInPlace<T>(arr: T[], rng: () => number): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
  }
  return arr;
}

/**
 * One simultaneous round of attrition.
 * Each unit on each side rolls independently against `killChance` to kill
 * one enemy unit. Both sides apply losses at the same time. Returns the
 * survivor counts after the round.
 */
function resolveRound(a: number, b: number, killChance: number, rng: () => number): { aLeft: number; bLeft: number; aKilled: number; bKilled: number } {
  let aKills = 0;
  for (let i = 0; i < a; i++) if (rng() < killChance) aKills++;
  let bKills = 0;
  for (let i = 0; i < b; i++) if (rng() < killChance) bKills++;
  // Cap kills at the opposing pool size.
  const aCasualties = Math.min(a, bKills);
  const bCasualties = Math.min(b, aKills);
  return { aLeft: a - aCasualties, bLeft: b - bCasualties, aKilled: bCasualties, bKilled: aCasualties };
}

interface InvaderEntry {
  game_fleet_id: string;
  source_fleet_id: string;
  fleet_name: string;
  owner_classification: string;
  /** Effective GI for this engagement = MAX(fleet GI, capacity in "Attack Planet" group). */
  gi: number;
  /** Original starting GI before any attrition this turn. */
  starting_gi: number;
}

export const groundCombatPhase: Phase = {
  name: "ground_combat",
  label: "Ground Combat",
  async run(ctx: TurnContext) {
    const { supabase, gameId, currentTurn, mapState, orders } = ctx;

    // 1. Load constants from combat_constants.
    //    - ground_combat_kill_chance (default 0.8)
    //    - infect_survivor_multiplier (default 5) — applied to an INFECT
    //      invader's surviving GI when both sides still have ground forces
    //      after a Phase B round.
    const { data: kcRows } = await (supabase as any)
      .from("combat_constants")
      .select("key, value")
      .in("key", ["ground_combat_kill_chance", "infect_survivor_multiplier"]);
    const constByKey = new Map<string, number>();
    for (const r of (kcRows || [])) constByKey.set(r.key, Number(r.value));
    const killChance = constByKey.has("ground_combat_kill_chance") ? constByKey.get("ground_combat_kill_chance")! : 0.8;
    const infectMultiplier = constByKey.has("infect_survivor_multiplier") ? constByKey.get("infect_survivor_multiplier")! : 5;


    // Load faction INFECT flags so we can route invasions through the
    // alternate (Synod-style) logic when the attacking faction has INFECT=true.
    // Build a lookup keyed by every owner-classification variant (name,
    // code_name, lower-cased) so the runtime string on a fleet matches.
    const infectByOwner = new Map<string, boolean>();
    {
      const { data: facRows } = await (supabase as any)
        .from("factions")
        .select("name, code_name, infect");
      for (const f of (facRows || [])) {
        const v = !!f.infect;
        if (f.name) infectByOwner.set(String(f.name).toLowerCase(), v);
        if (f.code_name) infectByOwner.set(String(f.code_name).toLowerCase(), v);
      }
    }
    const isInfectOwner = (owner: string | null | undefined) => {
      const k = (owner || "").trim().toLowerCase();
      if (!k) return false;
      return infectByOwner.get(k) === true;
    };


    // 2. Map hex (x,y) -> system on that hex (only ones we can invade).
    const systemsByHex = new Map<string, any>();
    for (const sys of mapState.systems.values()) {
      const hex = Array.from(mapState.hexes.values()).find(h => h.hex_id === sys.hex_id);
      if (!hex) continue;
      systemsByHex.set(`${hex.x},${hex.y}`, sys);
    }

    // 3. Find all fleet_attack orders for this turn and resolve each into a
    //    candidate (attacker fleet, target system) pair.
    const attackOrders = orders.filter(
      (o) => o.order_type === "other" && (o.order_json as any)?.kind === "fleet_attack",
    );

    if (attackOrders.length === 0) {
      ctx.logs.push({
        game_id: gameId, turn_number: currentTurn, phase: "ground_combat",
        log_type: "noop", message: "No attack orders this turn — no ground invasions.",
      });
      return;
    }

    // Helper: find the system on a given hex coord (returns undefined if none).
    const sysOnHex = (x: number, y: number) => systemsByHex.get(`${x},${y}`);

    // Build (attackerGameFleetId -> targetSystem) candidates.
    interface Candidate { mf: any; sys: any; reason: "direct_planet" | "fleet_on_planet"; distance: number; range: number; }
    const candidates: Candidate[] = [];
    const outOfRangeLogs: string[] = [];
    // Cache attacker map-speed lookups so we hit the DB at most once per fleet.
    const speedCache = new Map<string, number>();
    const speedFor = async (gameFleetId: string) => {
      if (speedCache.has(gameFleetId)) return speedCache.get(gameFleetId)!;
      const sp = await fetchFleetMapSpeed(supabase as any, gameFleetId);
      speedCache.set(gameFleetId, sp);
      return sp;
    };

    for (const o of attackOrders) {
      const oj = o.order_json as any;
      const attackerGameFleetId: string = oj.fleet_id;
      const attacker = mapState.fleets.find(f => f.fleet_id === attackerGameFleetId);
      if (!attacker) continue;

      // Resolve target system (and the hex it sits on).
      let sys: any | undefined;
      let reason: "direct_planet" | "fleet_on_planet" | undefined;
      if (oj.target_system_id != null) {
        sys = mapState.systems.get(Number(oj.target_system_id));
        reason = "direct_planet";
      } else if (oj.target_fleet_id) {
        const tgtFleet = mapState.fleets.find(f => f.fleet_id === oj.target_fleet_id);
        if (tgtFleet) {
          sys = sysOnHex(tgtFleet.hex_x, tgtFleet.hex_y);
          reason = "fleet_on_planet";
        }
      }
      if (!sys || !reason) continue;

      const sysHex = Array.from(mapState.hexes.values()).find(h => h.hex_id === sys.hex_id);
      if (!sysHex) continue;

      // Range rule: target hex must be within floor(map_speed / 2) of the
      // attacker's CURRENT (post-movement) position. Attacking does not move.
      const speed = await speedFor(attackerGameFleetId);
      const range = attackRangeFromMapSpeed(speed);
      const distance = hexDistance(attacker.hex_x, attacker.hex_y, sysHex.x, sysHex.y);
      if (distance > range) {
        outOfRangeLogs.push(
          `${attacker.fleet_name}: planet ${sys.system_name} is ${distance} hex(es) away — exceeds attack range ${range} (map speed ${speed}).`,
        );
        continue;
      }

      candidates.push({ mf: attacker, sys, reason, distance, range });
    }

    for (const m of outOfRangeLogs) {
      ctx.logs.push({
        game_id: gameId, turn_number: currentTurn, phase: "ground_combat",
        log_type: "ground_invasion_out_of_range", message: m,
      });
    }


    if (candidates.length === 0) {
      ctx.logs.push({
        game_id: gameId, turn_number: currentTurn, phase: "ground_combat",
        log_type: "noop", message: "No fleet_attack orders resolved to a planetary invasion.",
      });
      return;
    }

    // 4. Filter candidates: skip same-owner (garrison), then enforce strategy + capacity rules.
    const sourceFleetIdByGameFleet = new Map<string, string>();
    {
      const gameFleetIds = Array.from(new Set(candidates.map(c => c.mf.fleet_id)));
      const { data: gfRows } = await (supabase as any)
        .from("game_fleets").select("id, fleet_id").in("id", gameFleetIds);
      for (const r of (gfRows || [])) sourceFleetIdByGameFleet.set(r.id, r.fleet_id);
    }
    const sourceIds = Array.from(new Set(Array.from(sourceFleetIdByGameFleet.values())));

    // Pull strategy roles + current GI for each source fleet.
    const fleetMetaBySource = new Map<string, { gi: number; special1: string; special2: string }>();
    if (sourceIds.length > 0) {
      const { data: flRows } = await (supabase as any)
        .from("fleets")
        .select("id, current_ground_invasion, special1_role, special2_role")
        .in("id", sourceIds);
      for (const r of (flRows || [])) {
        fleetMetaBySource.set(r.id, {
          gi: Number(r.current_ground_invasion) || 0,
          special1: r.special1_role || "",
          special2: r.special2_role || "",
        });
      }
    }

    // Compute "Attack Planet" tactical-group ground-invasion capacity per
    // game-fleet from the per-game roster (`game_fleet_ships`).
    const capacityByGameFleet = new Map<string, number>();
    {
      const gameFleetIds = Array.from(new Set(candidates.map(c => c.mf.fleet_id)));
      if (gameFleetIds.length > 0) {
        const { data: rows } = await (supabase as any)
          .from("game_fleet_ships")
          .select("game_fleet_id, quantity, tactical_group, ship_types(ground_invasion)")
          .in("game_fleet_id", gameFleetIds);
        for (const r of (rows || [])) {
          if ((r.tactical_group || "") !== "Attack Planet") continue;
          const cap = Number(r.ship_types?.ground_invasion) || 0;
          const qty = Number(r.quantity) || 0;
          capacityByGameFleet.set(
            r.game_fleet_id,
            (capacityByGameFleet.get(r.game_fleet_id) || 0) + cap * qty,
          );
        }
      }
    }

    const skipLogs: string[] = [];

    // 5. Group qualified invaders by target system.
    const bySystem = new Map<number, { sys: any; invaders: InvaderEntry[] }>();
    for (const c of candidates) {
      const sourceId = sourceFleetIdByGameFleet.get(c.mf.fleet_id);
      if (!sourceId) continue;

      // Same-owner garrison movement isn't an invasion.
      const fleetOwner = (c.mf.owner_classification || "").trim();
      const planetOwner = (c.sys.owner || "").trim();
      if (fleetOwner && planetOwner && fleetOwner.toLowerCase() === planetOwner.toLowerCase()) {
        skipLogs.push(`${c.mf.fleet_name}: target planet ${c.sys.system_name} is already owned by attacker.`);
        continue;
      }

      const meta = fleetMetaBySource.get(sourceId);
      if (!meta) continue;

      // Rule (2): one of the two strategies must be "Attack Planet".
      const hasAttackPlanetStrategy =
        meta.special1 === "Attack Planet" || meta.special2 === "Attack Planet";
      if (!hasAttackPlanetStrategy) {
        skipLogs.push(`${c.mf.fleet_name}: cannot invade ${c.sys.system_name} — no "Attack Planet" strategy assigned.`);
        continue;
      }

      // Rule (3): effective GI = MAX(fleet GI, ship "Attack Planet" capacity).
      const fleetGi = meta.gi;
      const capGi = capacityByGameFleet.get(c.mf.fleet_id) || 0;
      const effectiveGi = Math.max(fleetGi, capGi);
      if (effectiveGi <= 0) {
        skipLogs.push(`${c.mf.fleet_name}: zero ground-invasion force — invasion of ${c.sys.system_name} aborted.`);
        continue;
      }

      const bucket = bySystem.get(c.sys.system_id) || { sys: c.sys, invaders: [] };
      bucket.invaders.push({
        game_fleet_id: c.mf.fleet_id,
        source_fleet_id: sourceId,
        fleet_name: c.mf.fleet_name || `Fleet ${String(c.mf.fleet_id).slice(0, 8)}`,
        owner_classification: c.mf.owner_classification || "",
        gi: effectiveGi,
        starting_gi: effectiveGi,
      });
      bySystem.set(c.sys.system_id, bucket);
    }

    for (const m of skipLogs) {
      ctx.logs.push({
        game_id: gameId, turn_number: currentTurn, phase: "ground_combat",
        log_type: "ground_invasion_skipped", message: m,
      });
    }

    if (bySystem.size === 0) {
      ctx.logs.push({
        game_id: gameId, turn_number: currentTurn, phase: "ground_combat",
        log_type: "noop", message: "No qualifying ground invasions this turn.",
      });
      return;
    }

    // Track GI changes to write back at the end (source_fleet_id -> new GI).
    const giDelta = new Map<string, number>();

    let resolved = 0;
    // Process systems in deterministic order (by system_id).
    const systemEntries = Array.from(bySystem.entries()).sort((a, b) => a[0] - b[0]);

    for (const [systemId, bucket] of systemEntries) {
      const sys = bucket.sys;
      const invaders = bucket.invaders;
      const seed = `${gameId}-t${currentTurn}-gc-sys${systemId}`;
      const rng = createRNG(hashSeed(seed));

      // ── Phase A: pair-fight inter-invader attrition ──
      const phaseAEvents: any[] = [];
      if (invaders.length >= 2) {
        const order = shuffleInPlace([...invaders], rng);
        const sittingOut = order.length % 2 === 1 ? order.pop()! : null;
        for (let i = 0; i < order.length; i += 2) {
          const A = order[i];
          const B = order[i + 1];
          const round = resolveRound(A.gi, B.gi, killChance, rng);
          A.gi = round.aLeft;
          B.gi = round.bLeft;
          phaseAEvents.push({
            attacker: A.fleet_name, attacker_owner: A.owner_classification,
            defender: B.fleet_name, defender_owner: B.owner_classification,
            attacker_losses: round.bKilled, defender_losses: round.aKilled,
            attacker_left: A.gi, defender_left: B.gi,
          });
        }
        if (sittingOut) {
          phaseAEvents.push({ sitting_out: sittingOut.fleet_name, owner: sittingOut.owner_classification, gi: sittingOut.gi });
        }
      }

      // Drop any invaders that were wiped out in Phase A.
      const survivors = invaders.filter(inv => inv.gi > 0);

      // Apply effective-GI losses back to the fleet's stored current_ground_invasion.
      // Each invader's stored GI is reduced by the same number of casualties
      // taken in this engagement (capped at 0).
      const writeBackGi = (inv: InvaderEntry) => {
        const casualties = inv.starting_gi - inv.gi;
        // Use the stored fleet GI as the basis (not effective GI), so capacity
        // never inflates the stored value above what was there before combat.
        const meta = fleetMetaBySource.get(inv.source_fleet_id);
        const baseStored = meta ? meta.gi : inv.starting_gi;
        const next = Math.max(0, baseStored - casualties);
        giDelta.set(inv.source_fleet_id, next);
      };

      if (survivors.length === 0) {
        for (const inv of invaders) writeBackGi(inv);
        ctx.logs.push({
          game_id: gameId, turn_number: currentTurn, phase: "ground_combat",
          log_type: "ground_combat_resolved",
          message: `Ground combat at ${sys.system_name}: all invaders destroyed each other in inter-fleet skirmishes.`,
          details_json: {
            system_id: systemId, system_name: sys.system_name, planet_owner: sys.owner,
            kill_chance: killChance, phase_a: phaseAEvents,
            phase_b: null, outcome: "mutual_annihilation",
          },
        });
        resolved++;
        continue;
      }

      // ── Phase B: champion attacks the planet ──
      survivors.sort((a, b) => {
        if (b.gi !== a.gi) return b.gi - a.gi;
        return rng() < 0.5 ? -1 : 1;
      });
      const champion = survivors[0];
      const startingDefenses = Number(sys.current_ground_defenses) || 0;
      const planetWasUnpopulated = (Number(sys.current_population) || 0) <= 0;
      const previousOwner = sys.owner || "";
      const championInfects = isInfectOwner(champion.owner_classification);

      // Notify the defender that the planet is under attack THIS turn.
      // INFECT factions show "planet_infected"; everyone else "planet_invaded".
      ctx.logs.push({
        game_id: gameId, turn_number: currentTurn, phase: "ground_combat",
        log_type: championInfects ? "planet_infected" : "planet_invaded",
        message: championInfects
          ? `${sys.system_name} is being infected by ${champion.owner_classification || "an INFECT force"}.`
          : `${sys.system_name} is being invaded by ${champion.owner_classification || "an enemy force"}.`,
        details_json: {
          system_id: systemId,
          system_name: sys.system_name,
          defender_owner: previousOwner,
          attacker_owner: champion.owner_classification,
          attacker_fleet: champion.fleet_name,
          invader_infect: championInfects,
        },
      });

      // Run the regular ground combat round (same engine for both routes).
      const round = resolveRound(champion.gi, startingDefenses, killChance, rng);
      champion.gi = round.aLeft;
      const newDefenses = round.bLeft;

      // ── INFECT route ──
      // If the INFECT invader and the defender both have surviving ground
      // forces after the round, the INFECT side's survivors multiply by
      // `infect_survivor_multiplier` (configurable in Map Config). This
      // represents the infection spreading from each survivor.
      let infectMultiplied = false;
      let preMultiplyGi = champion.gi;
      if (championInfects && champion.gi > 0 && newDefenses > 0 && infectMultiplier > 1) {
        champion.gi = Math.floor(champion.gi * infectMultiplier);
        // Treat the multiplied force as the new "starting" pool for write-back
        // accounting so we don't record negative casualties.
        champion.starting_gi = Math.max(champion.starting_gi, champion.gi);
        infectMultiplied = true;
      }
      sys.current_ground_defenses = newDefenses;

      let outcome: "capture" | "colonize" | "repulsed" | "stalemate" = "stalemate";
      let synodPurge: { removed_facility_ids: string[]; removed_population: number } | null = null;
      if (newDefenses <= 0) {
        sys.owner = champion.owner_classification;
        outcome = planetWasUnpopulated ? "colonize" : "capture";

        // If the planet was Synod-owned, strip all Synod facilities and wipe population on conquest.
        if ((previousOwner || "").toLowerCase() === "synod") {
          const synodIds = new Set(
            (ctx.facilityTypes || [])
              .filter((ft: any) => ft.synod === true)
              .map((ft: any) => String(ft.id))
          );
          const before = sys.facilities || [];
          const removed = before.filter(f => synodIds.has(String(f.facility_type_id)));
          sys.facilities = before.filter(f => !synodIds.has(String(f.facility_type_id)));
          sys.facilities_in_production = (sys.facilities_in_production || [])
            .filter(p => !synodIds.has(String(p.facility_type_id)));
          const removedPop = Number(sys.current_population) || 0;
          sys.current_population = 0;
          synodPurge = {
            removed_facility_ids: removed.map(r => String(r.facility_type_id)),
            removed_population: removedPop,
          };
        }

        if (outcome === "colonize") {
          // Seed baseline values, then immediately run one population-change
          // tick so the colony shows growth on the same turn it falls.
          if (!Number(sys.condition) || sys.condition <= 0) sys.condition = 5;
          if (!Number(sys.morale) || sys.morale <= 0) sys.morale = 5;
          sys.current_population = 1;
          const step = applyPopulationStep({
            condition: sys.condition,
            morale: sys.morale,
            current_population: sys.current_population,
          });
          sys.morale = step.morale;
          sys.current_population = Math.max(1, step.current_population);
        }
      } else if (champion.gi <= 0) {
        outcome = "repulsed";
      }

      // Ground troops landed — INFECT only: destroy the champion's
      // ground-transport ships (every Attack-Planet group ship with
      // ground_invasion > 0). Each such ship is consumed in the drop.
      // Non-INFECT invasions leave their transports intact.
      let transportsDestroyed = 0;
      if (championInfects) {

        const { data: shipRows } = await (supabase as any)
          .from("game_fleet_ships")
          .select("id, ship_types(ground_invasion)")
          .eq("game_fleet_id", champion.game_fleet_id)
          .eq("tactical_group", "Attack Planet");
        const toDelete = (shipRows || [])
          .filter((r: any) => (Number(r.ship_types?.ground_invasion) || 0) > 0)
          .map((r: any) => r.id);
        if (toDelete.length > 0) {
          await (supabase as any).from("game_fleet_ships").delete().in("id", toDelete);
          transportsDestroyed = toDelete.length;
          // If the fleet now has zero ships, remove it from the map.
          const { count } = await (supabase as any)
            .from("game_fleet_ships")
            .select("id", { count: "exact", head: true })
            .eq("game_fleet_id", champion.game_fleet_id);
          if ((count || 0) <= 0) {
            await destroyFleet({
              ctx,
              gameFleetId: champion.game_fleet_id,
              sourceFleetId: champion.source_fleet_id,
              fleetName: champion.fleet_name,
              reason: "ground_transports_expended",
              phase: "ground_combat",
            });
          }
        }
      }


      // Write back surviving GI for every invader involved at this system.
      for (const inv of invaders) writeBackGi(inv);

      // Persist the system update via mapState.
      mapState.systems.set(sys.system_id, sys);

      const msg =
        outcome === "colonize" ? `${champion.owner_classification || "Invader"} colonizes ${sys.system_name}.`
        : outcome === "capture"  ? `${champion.owner_classification || "Invader"} captures ${sys.system_name} from ${previousOwner || "no one"}.`
        : outcome === "repulsed" ? `Invasion of ${sys.system_name} repulsed — attackers wiped, defenses ${newDefenses} remain.`
        : `Inconclusive ground combat at ${sys.system_name} — defenses ${newDefenses} vs invaders ${champion.gi}.`;

      ctx.logs.push({
        game_id: gameId, turn_number: currentTurn, phase: "ground_combat",
        log_type: outcome === "colonize" ? "planet_colonized"
                 : outcome === "capture" ? "planet_captured"
                 : outcome === "repulsed" ? "ground_invasion_repulsed"
                 : "ground_combat_resolved",
        message: msg,
        details_json: {
          system_id: systemId,
          system_name: sys.system_name,
          previous_owner: previousOwner,
          new_owner: sys.owner,
          kill_chance: killChance,
          starting_defenses: startingDefenses,
          ending_defenses: newDefenses,
          champion_fleet: champion.fleet_name,
          champion_owner: champion.owner_classification,
          champion_starting_gi: champion.starting_gi,
          champion_ending_gi: champion.gi,
          population_at_start: Number(sys.current_population) || 0,
          phase_a: phaseAEvents,
          phase_b: {
            champion: champion.fleet_name,
            champion_owner: champion.owner_classification,
            kills_against_defenses: round.bKilled,
            losses_to_defenses: round.aKilled,
            ending_invader_gi: champion.gi,
            ending_defenses: newDefenses,
            infect_multiplied: infectMultiplied,
            infect_multiplier: infectMultiplied ? infectMultiplier : null,
            invader_gi_before_multiplier: infectMultiplied ? preMultiplyGi : null,
            transports_destroyed: transportsDestroyed,
          },
          outcome,
          invader_infect: championInfects,
          rule_path: championInfects ? "infect" : "standard",

        },
      });

      if (synodPurge) {
        ctx.logs.push({
          game_id: gameId, turn_number: currentTurn, phase: "ground_combat",
          log_type: "synod_planet_purged",
          message: `Synod facilities and population purged from ${sys.system_name} upon conquest by ${sys.owner || "invader"}.`,
          details_json: {
            system_id: systemId,
            system_name: sys.system_name,
            previous_owner: previousOwner,
            new_owner: sys.owner,
            removed_facility_ids: synodPurge.removed_facility_ids,
            removed_population: synodPurge.removed_population,
          },
        });
      }
      resolved++;
    }

    // 6. Persist GI changes for all touched fleets.
    for (const [sourceId, newGi] of giDelta) {
      await (supabase as any)
        .from("fleets")
        .update({ current_ground_invasion: Math.max(0, newGi) })
        .eq("id", sourceId);
    }

    ctx.logs.push({
      game_id: gameId, turn_number: currentTurn, phase: "ground_combat",
      log_type: "ground_combat_summary",
      message: `Ground combat phase complete — resolved ${resolved} planetary engagement(s).`,
    });
  },
};
