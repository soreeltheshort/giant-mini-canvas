/**
 * Ground Combat Phase
 *
 * Runs after Movement (so fleet positions are final) and before Visibility.
 *
 * Trigger:
 *   Any fleet with current_ground_invasion > 0 ending the turn on a hex
 *   containing a system whose owner != the fleet's owner is treated as an
 *   automatic ground invasion. No explicit order is required.
 *
 * Resolution per planet (single round, deterministic):
 *   1. Phase A — Inter-invader attrition.
 *      If 2+ invaders are present, shuffle them deterministically and pair
 *      them up. Each pair fights ONE simultaneous round of GI-vs-GI: every
 *      unit on each side has a `ground_combat_kill_chance` (default 0.8) of
 *      destroying one enemy unit. Both sides apply losses simultaneously.
 *      An odd unpaired invader sits Phase A out.
 *   2. Phase B — Planet assault.
 *      The surviving invader with the highest remaining
 *      current_ground_invasion (ties broken deterministically) makes ONE
 *      simultaneous round vs the planet's current_ground_defenses using the
 *      same kill chance. Other surviving invaders do not attack this turn.
 *   3. If current_ground_defenses reaches 0, the planet's owner changes to
 *      the attacking fleet's owner. If the planet had 0 population it's
 *      logged as "colonize"; otherwise "capture". Surviving GI stays in the
 *      fleet, defenses remain at 0 — population/condition recover via the
 *      normal economy phase next turn.
 */
import type { Phase, TurnContext } from "../types";

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
  gi: number;
}

export const groundCombatPhase: Phase = {
  name: "ground_combat" as any,
  label: "Ground Combat",
  async run(ctx: TurnContext) {
    const { supabase, gameId, currentTurn, mapState } = ctx;

    // 1. Load the kill chance from combat_constants (fallback 0.8).
    const { data: kcRow } = await (supabase as any)
      .from("combat_constants")
      .select("value")
      .eq("key", "ground_combat_kill_chance")
      .maybeSingle();
    const killChance = kcRow ? Number(kcRow.value) : 0.8;

    // 2. Build a map of hex (x,y) -> system at that hex (only ones we can invade).
    const systemsByHex = new Map<string, any>();
    for (const sys of mapState.systems.values()) {
      // Look up the hex this system sits on via hex_id.
      const hex = Array.from(mapState.hexes.values()).find(h => h.hex_id === sys.hex_id);
      if (!hex) continue;
      systemsByHex.set(`${hex.x},${hex.y}`, sys);
    }

    // 3. Find candidate invading fleets — those with current_ground_invasion > 0
    //    sitting on a hex with a system whose owner differs from the fleet owner.
    const fleetsOnTargets: Array<{ mf: any; sys: any }> = [];
    for (const mf of mapState.fleets) {
      const sys = systemsByHex.get(`${mf.hex_x},${mf.hex_y}`);
      if (!sys) continue;
      const fleetOwner = (mf.owner_classification || "").trim();
      const planetOwner = (sys.owner || "").trim();
      // Same-owner garrison movement isn't an invasion.
      if (fleetOwner && planetOwner && fleetOwner.toLowerCase() === planetOwner.toLowerCase()) continue;
      fleetsOnTargets.push({ mf, sys });
    }

    if (fleetsOnTargets.length === 0) {
      ctx.logs.push({
        game_id: gameId, turn_number: currentTurn, phase: "ground_combat" as any,
        log_type: "noop", message: "No ground invasions this turn.",
      });
      return;
    }

    // 4. Fetch current_ground_invasion for those fleets.
    const fleetIds = Array.from(new Set(fleetsOnTargets.map(f => f.mf.fleet_id)));
    const { data: gfRows } = await (supabase as any)
      .from("game_fleets").select("id, fleet_id").in("id", fleetIds);
    const sourceFleetIdByGameFleet = new Map<string, string>();
    for (const r of (gfRows || [])) sourceFleetIdByGameFleet.set(r.id, r.fleet_id);

    const sourceIds = Array.from(new Set(Array.from(sourceFleetIdByGameFleet.values())));
    const { data: flRows } = await (supabase as any)
      .from("fleets").select("id, current_ground_invasion").in("id", sourceIds);
    const giBySource = new Map<string, number>();
    for (const r of (flRows || [])) giBySource.set(r.id, Number(r.current_ground_invasion) || 0);

    // 5. Group invaders by target system.
    const bySystem = new Map<number, { sys: any; invaders: InvaderEntry[] }>();
    for (const { mf, sys } of fleetsOnTargets) {
      const sourceId = sourceFleetIdByGameFleet.get(mf.fleet_id);
      if (!sourceId) continue;
      const gi = giBySource.get(sourceId) || 0;
      if (gi <= 0) continue;
      const bucket = bySystem.get(sys.system_id) || { sys, invaders: [] };
      bucket.invaders.push({
        game_fleet_id: mf.fleet_id,
        source_fleet_id: sourceId,
        fleet_name: mf.fleet_name || `Fleet ${String(mf.fleet_id).slice(0,8)}`,
        owner_classification: mf.owner_classification || "",
        gi,
      });
      bySystem.set(sys.system_id, bucket);
    }

    if (bySystem.size === 0) {
      ctx.logs.push({
        game_id: gameId, turn_number: currentTurn, phase: "ground_combat" as any,
        log_type: "noop", message: "No fleets with ground forces are positioned to invade.",
      });
      return;
    }

    // Track GI changes to write back at the end.
    const giDelta = new Map<string, number>(); // source_fleet_id -> new GI value

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

      if (survivors.length === 0) {
        // All invaders annihilated each other — no planet assault.
        for (const inv of invaders) giDelta.set(inv.source_fleet_id, 0);
        ctx.logs.push({
          game_id: gameId, turn_number: currentTurn, phase: "ground_combat" as any,
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
      // Highest remaining GI; ties broken deterministically via the RNG.
      survivors.sort((a, b) => {
        if (b.gi !== a.gi) return b.gi - a.gi;
        return rng() < 0.5 ? -1 : 1;
      });
      const champion = survivors[0];
      const startingDefenses = Number(sys.current_ground_defenses) || 0;
      const planetWasUnpopulated = (Number(sys.current_population) || 0) <= 0;
      const previousOwner = sys.owner || "";

      const round = resolveRound(champion.gi, startingDefenses, killChance, rng);
      champion.gi = round.aLeft;
      const newDefenses = round.bLeft;
      sys.current_ground_defenses = newDefenses;

      let outcome: "capture" | "colonize" | "repulsed" | "stalemate" = "stalemate";
      if (newDefenses <= 0) {
        // Planet falls — change owner to the attacker's classification.
        sys.owner = champion.owner_classification;
        outcome = planetWasUnpopulated ? "colonize" : "capture";
      } else if (champion.gi <= 0) {
        outcome = "repulsed";
      }

      // Write back surviving GI for every invader involved at this system.
      for (const inv of invaders) giDelta.set(inv.source_fleet_id, inv.gi);

      // Persist the system update via mapState (will be serialized by AdminGames runTurn).
      mapState.systems.set(sys.system_id, sys);

      const msg =
        outcome === "colonize" ? `${champion.owner_classification || "Invader"} colonizes ${sys.system_name}.`
        : outcome === "capture"  ? `${champion.owner_classification || "Invader"} captures ${sys.system_name} from ${previousOwner || "no one"}.`
        : outcome === "repulsed" ? `Invasion of ${sys.system_name} repulsed — attackers wiped, defenses ${newDefenses} remain.`
        : `Inconclusive ground combat at ${sys.system_name} — defenses ${newDefenses} vs invaders ${champion.gi}.`;

      ctx.logs.push({
        game_id: gameId, turn_number: currentTurn, phase: "ground_combat" as any,
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
          champion_starting_gi: invaders.find(i => i.game_fleet_id === champion.game_fleet_id)?.gi !== champion.gi
            ? undefined : champion.gi, // reference only
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
          },
          outcome,
        },
      });
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
      game_id: gameId, turn_number: currentTurn, phase: "ground_combat" as any,
      log_type: "ground_combat_summary",
      message: `Ground combat phase complete — resolved ${resolved} planetary engagement(s).`,
    });
  },
};
