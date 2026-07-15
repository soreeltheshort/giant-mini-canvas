/**
 * Ground Combat Phase — persistent surface war.
 *
 * Runs after Movement (so fleet positions are final) and before Visibility.
 *
 * TWO STAGES per turn:
 *
 * ─── Stage 1 — LANDING ────────────────────────────────────────────────────
 * For every `fleet_attack` order this turn that resolves to a planet AND
 * meets the invasion eligibility rules (Attack Planet strategy + effective
 * ground-invasion force + attack range), the attacker's effective GI is
 * deposited onto the target system as a `landed_forces` bucket keyed by
 * owner_classification. Landing does NOT resolve combat — troops simply
 * disembark. The fleet's `current_ground_invasion` is zeroed and, for INFECT
 * attackers, the Attack-Planet ground-transport ships are consumed as today.
 *
 * ─── Stage 2 — SURFACE COMBAT ────────────────────────────────────────────
 * For EVERY system with a non-empty `landed_forces`, run one deterministic
 * round per turn (independent of any orders, so combat persists across
 * turns until one side is gone):
 *
 *   Phase A — Hostile-vs-hostile attrition among landed_forces owner buckets
 *   (shuffle, pair, simultaneous kill rolls, odd bucket sits out).
 *
 *   Phase B — Champion attacks garrison. The surviving landed bucket with
 *   the largest force (deterministic tiebreak) fights ONE simultaneous round
 *   vs `current_ground_defenses`.
 *
 * Ownership resolution:
 *   - If defenses hit 0 and exactly one non-owner bucket remains, that
 *     faction captures the planet. Its remaining troops become the new
 *     `current_ground_defenses`, that bucket is cleared. Synod purge and
 *     colonize logic apply exactly as today.
 *   - If defenses hit 0 and >1 hostile buckets remain, the planet stays
 *     unowned this turn — combat continues next round.
 *   - If defenses > 0 and any hostile force remains, combat continues.
 *
 * INFECT rules (unchanged in intent, applied inside Stage 2):
 *   - `infect_survivor_multiplier` applies when an INFECT champion survives
 *     Phase B with the defender also surviving.
 *   - Transport destruction happens on landing (Stage 1), not per round.
 */
import type { Phase, TurnContext } from "../types";
import { fetchFleetMapSpeed, attackRangeFromMapSpeed, hexDistance } from "@/lib/fleetRange";
import { applyPopulationStep } from "@/lib/turnEngine";
import { destroyFleet } from "../fleetCleanup";

// Inline mulberry32 RNG (kept in sync with battleEngine.ts).
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

function shuffleInPlace<T>(arr: T[], rng: () => number): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
  }
  return arr;
}

export interface RollRecord { i: number; roll: number; hit: boolean; }
export interface RoundResult {
  aLeft: number; bLeft: number; aKilled: number; bKilled: number;
  aRolls: RollRecord[]; bRolls: RollRecord[];
}

function resolveRound(a: number, b: number, killChance: number, rng: () => number): RoundResult {
  const aRolls: RollRecord[] = [];
  let aKills = 0;
  for (let i = 0; i < a; i++) {
    const roll = rng();
    const hit = roll < killChance;
    if (hit) aKills++;
    aRolls.push({ i: i + 1, roll, hit });
  }
  const bRolls: RollRecord[] = [];
  let bKills = 0;
  for (let i = 0; i < b; i++) {
    const roll = rng();
    const hit = roll < killChance;
    if (hit) bKills++;
    bRolls.push({ i: i + 1, roll, hit });
  }
  const aCasualties = Math.min(a, bKills);
  const bCasualties = Math.min(b, aKills);
  return {
    aLeft: a - aCasualties, bLeft: b - bCasualties,
    aKilled: bCasualties, bKilled: aCasualties,
    aRolls, bRolls,
  };
}

function formatRollLine(rolls: RollRecord[]): string {
  if (rolls.length === 0) return "(no units)";
  const MAX = 40, HEAD = 20, TAIL = 20;
  let render = rolls;
  let elided = 0;
  if (rolls.length > MAX) {
    elided = rolls.length - HEAD - TAIL;
    render = [...rolls.slice(0, HEAD), ...rolls.slice(-TAIL)];
  }
  const parts: string[] = [];
  render.forEach((r, idx) => {
    if (elided > 0 && idx === HEAD) parts.push(`… ${elided} more …`);
    parts.push(`${r.roll.toFixed(3)} ${r.hit ? "HIT " : "miss"}`);
  });
  const hits = rolls.filter(r => r.hit).length;
  return `${parts.join("  ")}   → ${hits}/${rolls.length} hits`;
}

/** Runtime bucket for one owner's landed forces on a planet. */
interface SurfaceBucket {
  owner_classification: string;
  gi: number;
  starting_gi: number;
}

export const groundCombatPhase: Phase = {
  name: "ground_combat",
  label: "Ground Combat",
  async run(ctx: TurnContext) {
    const { supabase, gameId, currentTurn, mapState, orders } = ctx;

    // ── Load constants ──
    const { data: kcRows } = await (supabase as any)
      .from("combat_constants")
      .select("key, value")
      .in("key", ["ground_combat_kill_chance", "infect_survivor_multiplier"]);
    const constByKey = new Map<string, number>();
    for (const r of (kcRows || [])) constByKey.set(r.key, Number(r.value));
    const killChance = constByKey.has("ground_combat_kill_chance") ? constByKey.get("ground_combat_kill_chance")! : 0.8;
    const infectMultiplier = constByKey.has("infect_survivor_multiplier") ? constByKey.get("infect_survivor_multiplier")! : 5;

    // ── Faction INFECT lookup ──
    const infectByOwner = new Map<string, boolean>();
    {
      const { data: facRows } = await (supabase as any)
        .from("factions").select("name, code_name, infect");
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

    // Faction alias → id + display lookups (used by dispatches).
    const factionIdByAlias = new Map<string, string>();
    const factionMetaById = new Map<string, { display: string; is_infect: boolean }>();
    for (const f of ctx.factions as any[]) {
      const display = f.name || f.code_name || "Unknown";
      factionMetaById.set(f.id, { display, is_infect: !!f.infect });
      if (f.name) factionIdByAlias.set(String(f.name).toLowerCase(), f.id);
      if (f.code_name) factionIdByAlias.set(String(f.code_name).toLowerCase(), f.id);
    }
    const resolveFactionId = (owner: string | null | undefined): string | null => {
      const k = (owner || "").trim().toLowerCase();
      if (!k) return null;
      return factionIdByAlias.get(k) || null;
    };
    const displayForOwner = (owner: string | null | undefined): string => {
      const fid = resolveFactionId(owner);
      const meta = fid ? factionMetaById.get(fid) : null;
      return meta?.display || owner || "Unknown";
    };

    // ── Helper: hex-to-system lookup ──
    const systemsByHex = new Map<string, any>();
    for (const sys of mapState.systems.values()) {
      const hex = Array.from(mapState.hexes.values()).find(h => h.hex_id === sys.hex_id);
      if (!hex) continue;
      systemsByHex.set(`${hex.x},${hex.y}`, sys);
    }
    const sysOnHex = (x: number, y: number) => systemsByHex.get(`${x},${y}`);

    // Ensure landed_forces bucket for owner exists on sys; returns the array.
    interface StoredBucket { owner_classification: string; quantity: number }
    const ensureLanded = (sys: any): StoredBucket[] => {
      if (!Array.isArray(sys.landed_forces)) sys.landed_forces = [];
      return sys.landed_forces as StoredBucket[];
    };
    const addLanded = (sys: any, owner: string, qty: number) => {
      const arr = ensureLanded(sys);
      const existing = arr.find(b => (b.owner_classification || "").toLowerCase() === (owner || "").toLowerCase());
      if (existing) existing.quantity = (existing.quantity || 0) + qty;
      else arr.push({ owner_classification: owner, quantity: qty });
    };


    // ═══════════════════════════════════════════════════════════════════════
    // STAGE 1 — LANDING (translate fleet_attack orders → landed_forces)
    // ═══════════════════════════════════════════════════════════════════════
    const attackOrders = orders.filter(
      (o) => o.order_type === "other" && (o.order_json as any)?.kind === "fleet_attack",
    );

    // (fleet_id → resolved landing candidate)
    interface LandingCandidate {
      mf: any;                // MapFleet
      sys: any;
      distance: number;
      range: number;
    }
    const landingCandidates: LandingCandidate[] = [];
    const outOfRangeLogs: string[] = [];
    const skipLogs: string[] = [];

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

      let sys: any | undefined;
      if (oj.target_system_id != null) {
        sys = mapState.systems.get(Number(oj.target_system_id));
      } else if (oj.target_fleet_id) {
        const tgtFleet = mapState.fleets.find(f => f.fleet_id === oj.target_fleet_id);
        if (tgtFleet) sys = sysOnHex(tgtFleet.hex_x, tgtFleet.hex_y);
      }
      if (!sys) continue;

      const sysHex = Array.from(mapState.hexes.values()).find(h => h.hex_id === sys.hex_id);
      if (!sysHex) continue;

      const speed = await speedFor(attackerGameFleetId);
      const range = attackRangeFromMapSpeed(speed);
      const distance = hexDistance(attacker.hex_x, attacker.hex_y, sysHex.x, sysHex.y);
      if (distance > range) {
        outOfRangeLogs.push(
          `${attacker.fleet_name}: planet ${sys.system_name} is ${distance} hex(es) away — exceeds attack range ${range} (map speed ${speed}).`,
        );
        continue;
      }
      landingCandidates.push({ mf: attacker, sys, distance, range });
    }

    for (const m of outOfRangeLogs) {
      ctx.logs.push({
        game_id: gameId, turn_number: currentTurn, phase: "ground_combat",
        log_type: "ground_invasion_out_of_range", message: m,
      });
    }

    // Resolve source_fleet_id + strategy + GI + Attack-Planet capacity per candidate.
    const sourceFleetIdByGameFleet = new Map<string, string>();
    if (landingCandidates.length > 0) {
      const gameFleetIds = Array.from(new Set(landingCandidates.map(c => c.mf.fleet_id)));
      const { data: gfRows } = await (supabase as any)
        .from("game_fleets").select("id, fleet_id").in("id", gameFleetIds);
      for (const r of (gfRows || [])) sourceFleetIdByGameFleet.set(r.id, r.fleet_id);
    }
    const sourceIds = Array.from(new Set(Array.from(sourceFleetIdByGameFleet.values())));
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
    const capacityByGameFleet = new Map<string, number>();
    if (landingCandidates.length > 0) {
      const gameFleetIds = Array.from(new Set(landingCandidates.map(c => c.mf.fleet_id)));
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

    // Track fleets whose GI must be zeroed post-landing.
    const fleetsThatLanded = new Set<string>();

    // Track systems newly touched by landings this turn — even if they were
    // already contested from a prior turn, we still emit the landing log.
    const landedThisTurn: Array<{
      sys: any; owner: string; qty: number; fleet_name: string;
      game_fleet_id: string; source_fleet_id: string; is_infect: boolean;
    }> = [];

    for (const c of landingCandidates) {
      const sourceId = sourceFleetIdByGameFleet.get(c.mf.fleet_id);
      if (!sourceId) continue;
      const fleetOwner = (c.mf.owner_classification || "").trim();
      const planetOwner = (c.sys.owner || "").trim();
      const meta = fleetMetaBySource.get(sourceId);
      if (!meta) continue;

      const hasAttackPlanetStrategy =
        meta.special1 === "Attack Planet" || meta.special2 === "Attack Planet";
      if (!hasAttackPlanetStrategy) {
        skipLogs.push(`${c.mf.fleet_name}: cannot invade ${c.sys.system_name} — no "Attack Planet" strategy assigned.`);
        continue;
      }
      const effectiveGi = Math.max(meta.gi, capacityByGameFleet.get(c.mf.fleet_id) || 0);
      if (effectiveGi <= 0) {
        skipLogs.push(`${c.mf.fleet_name}: zero ground-invasion force — landing on ${c.sys.system_name} aborted.`);
        continue;
      }

      // Same-owner: this is reinforcement — fold straight into garrison.
      if (fleetOwner && planetOwner && fleetOwner.toLowerCase() === planetOwner.toLowerCase()) {
        c.sys.current_ground_defenses = (Number(c.sys.current_ground_defenses) || 0) + effectiveGi;
        fleetsThatLanded.add(sourceId);
        ctx.logs.push({
          game_id: gameId, turn_number: currentTurn, phase: "ground_combat",
          log_type: "troops_reinforced",
          message: `${c.mf.fleet_name} reinforces ${c.sys.system_name} with ${effectiveGi} ground unit(s).`,
          details_json: {
            system_id: c.sys.system_id, system_name: c.sys.system_name,
            owner: fleetOwner, quantity: effectiveGi,
          },
        });
        mapState.systems.set(c.sys.system_id, c.sys);
        continue;
      }

      // Hostile landing → deposit into landed_forces bucket.
      addLanded(c.sys, fleetOwner, effectiveGi);
      mapState.systems.set(c.sys.system_id, c.sys);
      fleetsThatLanded.add(sourceId);
      landedThisTurn.push({
        sys: c.sys, owner: fleetOwner, qty: effectiveGi,
        fleet_name: c.mf.fleet_name || `Fleet ${String(c.mf.fleet_id).slice(0, 8)}`,
        game_fleet_id: c.mf.fleet_id, source_fleet_id: sourceId,
        is_infect: isInfectOwner(fleetOwner),
      });

      // INFECT: consume Attack-Planet transports on drop (existing rule).
      if (isInfectOwner(fleetOwner)) {
        const { data: shipRows } = await (supabase as any)
          .from("game_fleet_ships")
          .select("id, ship_types(ground_invasion)")
          .eq("game_fleet_id", c.mf.fleet_id)
          .eq("tactical_group", "Attack Planet");
        const toDelete = (shipRows || [])
          .filter((r: any) => (Number(r.ship_types?.ground_invasion) || 0) > 0)
          .map((r: any) => r.id);
        if (toDelete.length > 0) {
          await (supabase as any).from("game_fleet_ships").delete().in("id", toDelete);
          const { count } = await (supabase as any)
            .from("game_fleet_ships")
            .select("id", { count: "exact", head: true })
            .eq("game_fleet_id", c.mf.fleet_id);
          if ((count || 0) <= 0) {
            await destroyFleet({
              ctx,
              gameFleetId: c.mf.fleet_id,
              sourceFleetId: sourceId,
              fleetName: c.mf.fleet_name || "",
              reason: "ground_transports_expended",
              phase: "ground_combat",
            });
          }
        }
      }
    }

    for (const m of skipLogs) {
      ctx.logs.push({
        game_id: gameId, turn_number: currentTurn, phase: "ground_combat",
        log_type: "ground_invasion_skipped", message: m,
      });
    }

    // Emit troops_landed logs for hostile landings.
    for (const l of landedThisTurn) {
      ctx.logs.push({
        game_id: gameId, turn_number: currentTurn, phase: "ground_combat",
        log_type: l.is_infect ? "planet_infected" : "planet_invaded",
        message: l.is_infect
          ? `${l.sys.system_name} — ${l.owner || "an INFECT force"} lands ${l.qty} infestation unit(s).`
          : `${l.sys.system_name} — ${l.owner || "an enemy force"} lands ${l.qty} ground unit(s).`,
        details_json: {
          system_id: l.sys.system_id, system_name: l.sys.system_name,
          attacker_owner: l.owner, attacker_fleet: l.fleet_name,
          landed_quantity: l.qty, defender_owner: l.sys.owner || "",
          invader_infect: l.is_infect,
        },
      });
    }

    // Zero out GI for every fleet that landed (troops disembarked).
    for (const sourceId of fleetsThatLanded) {
      await (supabase as any).from("fleets").update({ current_ground_invasion: 0 }).eq("id", sourceId);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // STAGE 2 — SURFACE COMBAT (one round per contested planet, every turn)
    // ═══════════════════════════════════════════════════════════════════════

    // Pre-load intel observers for logging/dispatch fog.
    const contestedSystemIds: number[] = [];
    for (const sys of mapState.systems.values()) {
      if (Array.isArray(sys.landed_forces) && sys.landed_forces.length > 0) {
        contestedSystemIds.push(sys.system_id);
      }
    }

    if (contestedSystemIds.length === 0) {
      ctx.logs.push({
        game_id: gameId, turn_number: currentTurn, phase: "ground_combat",
        log_type: "noop", message: "No contested planets — no surface combat.",
      });
      return;
    }

    const observersBySystem = new Map<number, Set<string>>();
    {
      const { data: intelRows } = await (supabase as any)
        .from("player_system_intel")
        .select("observer_player_id, system_id, last_seen_turn")
        .eq("game_id", gameId)
        .in("system_id", contestedSystemIds);
      for (const r of (intelRows || [])) {
        if (Number(r.last_seen_turn) < currentTurn) continue;
        const sid = Number(r.system_id);
        if (!observersBySystem.has(sid)) observersBySystem.set(sid, new Set());
        observersBySystem.get(sid)!.add(String(r.observer_player_id));
      }
    }

    const emitDispatches = (args: {
      sys: any;
      basePayload: any;
      message: string;
      attackerOwner: string;
      previousOwner: string;
    }) => {
      const { sys, basePayload, message, attackerOwner, previousOwner } = args;
      const hexId = sys.hex_id;
      const clearObservers = observersBySystem.get(sys.system_id) || new Set<string>();
      const attackerFid = resolveFactionId(attackerOwner);
      const previousFid = resolveFactionId(previousOwner);

      const roleByPlayer = new Map<string, "attacker" | "previous_owner" | "defender" | "third_party">();
      const fogByPlayer = new Map<string, "clear" | "scouted" | "reported">();

      for (const p of ctx.players) {
        let role: "attacker" | "previous_owner" | "defender" | "third_party" | null = null;
        if (attackerFid && p.faction_id === attackerFid) role = "attacker";
        else if (previousFid && p.faction_id === previousFid) role = "previous_owner";

        let fog: "clear" | "scouted" | "reported" | null = null;
        if (clearObservers.has(p.id)) fog = "clear";
        else if (hexId != null && p.scouted_hex_ids.includes(hexId)) fog = "scouted";
        else if (Array.isArray(p.visible_system_ids) && p.visible_system_ids.includes(sys.system_id)) fog = "scouted";

        if (!role && !fog) continue;
        if (role && !fog) fog = "reported";
        roleByPlayer.set(p.id, role || "third_party");
        fogByPlayer.set(p.id, fog!);
      }

      for (const [playerId, role] of roleByPlayer) {
        const fog = fogByPlayer.get(playerId)!;
        const p = ctx.players.find(x => x.id === playerId);
        const observerFactionId = p?.faction_id || null;
        const observerFactionName = observerFactionId ? factionMetaById.get(observerFactionId)?.display || "" : "";

        const redact = fog === "scouted" && role === "third_party";
        const attackerBlock = redact
          ? { ...basePayload.attacker, fleet_name: "Unidentified force" }
          : basePayload.attacker;

        const payload = {
          ...basePayload,
          attacker: attackerBlock,
          observer: {
            player_id: playerId,
            faction_id: observerFactionId,
            faction: observerFactionName,
            role,
            fog_level: fog,
          },
        };

        ctx.logs.push({
          game_id: gameId, turn_number: currentTurn, phase: "ground_combat",
          log_type: "dispatch_ground_combat",
          message: observerFactionName ? `[${observerFactionName}] ${message}` : message,
          details_json: payload,
        });
      }
    };

    let resolved = 0;
    const contestedSystems = contestedSystemIds
      .map(id => mapState.systems.get(id))
      .filter(Boolean)
      .sort((a: any, b: any) => a.system_id - b.system_id);

    for (const sys of contestedSystems as any[]) {
      const systemId = sys.system_id;
      const seed = `${gameId}-t${currentTurn}-gc-sys${systemId}`;
      const rng = createRNG(hashSeed(seed));

      // Snapshot buckets for logging/starts.
      const bucketsRaw: SurfaceBucket[] = ((sys.landed_forces || []) as any[])
        .map(b => ({
          owner_classification: b.owner_classification || "",
          gi: Number(b.quantity) || 0,
          starting_gi: Number(b.quantity) || 0,
        }))
        .filter(b => b.gi > 0);

      if (bucketsRaw.length === 0) {
        sys.landed_forces = [];
        mapState.systems.set(systemId, sys);
        continue;
      }

      // ── Phase A ── pair hostile owner buckets and fight.
      const phaseAEvents: any[] = [];
      const phaseATranscript: any[] = [];
      const workBuckets = [...bucketsRaw];
      if (workBuckets.length >= 2) {
        const order = shuffleInPlace([...workBuckets], rng);
        const sittingOut = order.length % 2 === 1 ? order.pop()! : null;
        for (let i = 0; i < order.length; i += 2) {
          const A = order[i], B = order[i + 1];
          const aStart = A.gi, bStart = B.gi;
          const round = resolveRound(A.gi, B.gi, killChance, rng);
          A.gi = round.aLeft;
          B.gi = round.bLeft;
          phaseAEvents.push({
            attacker: A.owner_classification, defender: B.owner_classification,
            attacker_losses: round.bKilled, defender_losses: round.aKilled,
            attacker_left: A.gi, defender_left: B.gi,
          });
          phaseATranscript.push({
            attacker: A.owner_classification, defender: B.owner_classification,
            a_start: aStart, b_start: bStart,
            a_rolls: round.aRolls, b_rolls: round.bRolls,
            a_kills_on_b: round.bKilled, b_kills_on_a: round.aKilled,
            a_end: A.gi, b_end: B.gi,
          });
        }
        if (sittingOut) {
          phaseAEvents.push({ sitting_out: sittingOut.owner_classification, gi: sittingOut.gi });
          phaseATranscript.push({ sitting_out: sittingOut.owner_classification, gi: sittingOut.gi });
        }
      }

      const survivors = workBuckets.filter(b => b.gi > 0);

      // ── Phase B ── champion attacks garrison (if any hostile survives).
      const startingDefenses = Number(sys.current_ground_defenses) || 0;
      const previousOwner = sys.owner || "";
      const planetWasUnpopulated = (Number(sys.current_population) || 0) <= 0;

      let champion: SurfaceBucket | null = null;
      let round: RoundResult | null = null;
      let preMultiplyGi = 0;
      let newDefenses = startingDefenses;
      let infectMultiplied = false;
      let championInfects = false;

      if (survivors.length > 0 && startingDefenses > 0) {
        survivors.sort((a, b) => {
          if (b.gi !== a.gi) return b.gi - a.gi;
          return rng() < 0.5 ? -1 : 1;
        });
        champion = survivors[0];
        championInfects = isInfectOwner(champion.owner_classification);

        round = resolveRound(champion.gi, startingDefenses, killChance, rng);
        champion.gi = round.aLeft;
        newDefenses = round.bLeft;
        preMultiplyGi = champion.gi;

        if (championInfects && champion.gi > 0 && newDefenses > 0 && infectMultiplier > 1) {
          champion.gi = Math.floor(champion.gi * infectMultiplier);
          champion.starting_gi = Math.max(champion.starting_gi, champion.gi);
          infectMultiplied = true;
        }
      } else if (survivors.length > 0 && startingDefenses <= 0) {
        // No garrison — champion candidate exists but no Phase B combat needed.
        survivors.sort((a, b) => {
          if (b.gi !== a.gi) return b.gi - a.gi;
          return rng() < 0.5 ? -1 : 1;
        });
        champion = survivors[0];
        championInfects = isInfectOwner(champion.owner_classification);
      }

      sys.current_ground_defenses = newDefenses;

      // ── Ownership resolution ──
      let outcome: "capture" | "colonize" | "repulsed" | "stalemate" | "ongoing" | "mutual_annihilation" = "ongoing";
      let synodPurge: { removed_facility_ids: string[]; removed_population: number } | null = null;

      const remainingHostileOwners = survivors.filter(b => b.gi > 0);

      if (newDefenses <= 0 && remainingHostileOwners.length === 1 && champion && champion.gi > 0) {
        // Capture / colonize by sole surviving faction.
        sys.owner = champion.owner_classification;
        outcome = planetWasUnpopulated ? "colonize" : "capture";

        if ((previousOwner || "").toLowerCase() === "synod") {
          const synodIds = new Set(
            (ctx.facilityTypes || [])
              .filter((ft: any) => ft.synod === true)
              .map((ft: any) => String(ft.id))
          );
          const before = sys.facilities || [];
          const removed = before.filter((f: any) => synodIds.has(String(f.facility_type_id)));
          sys.facilities = before.filter((f: any) => !synodIds.has(String(f.facility_type_id)));
          sys.facilities_in_production = (sys.facilities_in_production || [])
            .filter((p: any) => !synodIds.has(String(p.facility_type_id)));
          const removedPop = Number(sys.current_population) || 0;
          sys.current_population = 0;
          synodPurge = {
            removed_facility_ids: removed.map((r: any) => String(r.facility_type_id)),
            removed_population: removedPop,
          };
        }

        if (outcome === "colonize") {
          if (!Number(sys.condition) || sys.condition <= 0) sys.condition = 5;
          if (!Number(sys.morale) || sys.morale <= 0) sys.morale = 5;
          sys.current_population = 1;
          const step = applyPopulationStep({
            condition: sys.condition, morale: sys.morale,
            current_population: sys.current_population,
          });
          sys.morale = step.morale;
          sys.current_population = Math.max(1, step.current_population);
        }

        // New garrison = champion's remaining troops. Clear their bucket.
        sys.current_ground_defenses = champion.gi;
        champion.gi = 0;
      } else if (newDefenses <= 0 && remainingHostileOwners.length === 0) {
        // Defender wiped, no invader survives — mutual annihilation.
        outcome = "mutual_annihilation";
      } else if (remainingHostileOwners.length === 0 && newDefenses > 0) {
        // All invaders wiped this round, defender held.
        outcome = "repulsed";
      } else {
        // Something remains on both sides — combat persists next turn.
        outcome = newDefenses > 0 && remainingHostileOwners.length > 0 ? "ongoing" : "ongoing";
      }

      // Write surviving buckets back to sys.landed_forces (drop zeros).
      sys.landed_forces = workBuckets
        .filter(b => b.gi > 0)
        .map(b => ({ owner_classification: b.owner_classification, quantity: b.gi }));

      mapState.systems.set(systemId, sys);

      // ── Logs ──
      const attackerOwnerForLog = champion?.owner_classification || bucketsRaw[0]?.owner_classification || "";
      const attackerDisplay = displayForOwner(attackerOwnerForLog);
      const defenderDisplay = displayForOwner(previousOwner);

      const msg =
        outcome === "colonize" ? `${attackerDisplay} colonizes ${sys.system_name}.`
        : outcome === "capture"  ? `${attackerDisplay} captures ${sys.system_name} from ${defenderDisplay}.`
        : outcome === "repulsed" ? `Ground invasion of ${sys.system_name} repulsed — defenses ${newDefenses} remain.`
        : outcome === "mutual_annihilation" ? `${sys.system_name}: mutual annihilation — no defender or invaders remain.`
        : `Surface combat on ${sys.system_name} continues — defenses ${newDefenses} vs invaders ${remainingHostileOwners.reduce((s, b) => s + b.gi, 0)}.`;

      ctx.logs.push({
        game_id: gameId, turn_number: currentTurn, phase: "ground_combat",
        log_type: outcome === "colonize" ? "planet_colonized"
                 : outcome === "capture" ? "planet_captured"
                 : outcome === "repulsed" ? "ground_invasion_repulsed"
                 : outcome === "mutual_annihilation" ? "ground_combat_resolved"
                 : "surface_combat_ongoing",
        message: msg,
        details_json: {
          system_id: systemId,
          system_name: sys.system_name,
          previous_owner: previousOwner,
          new_owner: sys.owner,
          kill_chance: killChance,
          starting_defenses: startingDefenses,
          ending_defenses: newDefenses,
          phase_a: phaseAEvents,
          phase_b: champion && round ? {
            champion: champion.owner_classification,
            kills_against_defenses: round.bKilled,
            losses_to_defenses: round.aKilled,
            ending_invader_gi: champion.gi,
            ending_defenses: newDefenses,
            infect_multiplied: infectMultiplied,
            infect_multiplier: infectMultiplied ? infectMultiplier : null,
            invader_gi_before_multiplier: infectMultiplied ? preMultiplyGi : null,
          } : null,
          landed_forces_after: sys.landed_forces,
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
            system_id: systemId, system_name: sys.system_name,
            previous_owner: previousOwner, new_owner: sys.owner,
            removed_facility_ids: synodPurge.removed_facility_ids,
            removed_population: synodPurge.removed_population,
          },
        });
      }

      // ── Dispatch (per-observer) ──
      {
        const debugLines: string[] = [
          `${sys.system_name} — turn ${currentTurn} — seed ${seed} — killChance ${killChance.toFixed(2)}`,
        ];
        if (phaseATranscript.length === 0) {
          debugLines.push(`PHASE A: (single or no hostile bucket)`);
        } else {
          debugLines.push(`PHASE A (${phaseATranscript.length} pairing${phaseATranscript.length === 1 ? "" : "s"}):`);
          for (const t of phaseATranscript) {
            if (t.sitting_out) {
              debugLines.push(`  ${t.sitting_out} sits out with ${t.gi} GI`);
              continue;
            }
            debugLines.push(`  ${t.attacker} (${t.a_start}) vs ${t.defender} (${t.b_start})`);
            debugLines.push(`    A rolls: ${formatRollLine(t.a_rolls)}`);
            debugLines.push(`    B rolls: ${formatRollLine(t.b_rolls)}`);
            debugLines.push(`    applied: A −${t.b_kills_on_a} → ${t.a_end}, B −${t.a_kills_on_b} → ${t.b_end}`);
          }
        }
        if (champion && round) {
          debugLines.push(`PHASE B: ${champion.owner_classification} (${round.aRolls.length}) vs defenses (${startingDefenses})`);
          debugLines.push(`  attacker rolls: ${formatRollLine(round.aRolls)}`);
          debugLines.push(`  defense  rolls: ${formatRollLine(round.bRolls)}`);
          debugLines.push(`  applied simultaneously — attacker −${round.aKilled} → ${preMultiplyGi}, defenses −${round.bKilled} → ${newDefenses}`);
          if (infectMultiplied) debugLines.push(`  INFECT multiplier ×${infectMultiplier}: ${preMultiplyGi} → ${champion.gi}`);
        } else {
          debugLines.push(`PHASE B: (skipped — no garrison or no hostile survivors)`);
        }
        debugLines.push(
          outcome === "capture" ? `  RESULT: CAPTURE by ${attackerDisplay}`
          : outcome === "colonize" ? `  RESULT: COLONIZE by ${attackerDisplay}`
          : outcome === "repulsed" ? `  RESULT: REPULSED — defenses ${newDefenses}`
          : outcome === "mutual_annihilation" ? `  RESULT: MUTUAL ANNIHILATION`
          : `  RESULT: ONGOING — combat continues next turn`,
        );

        const basePayload = {
          schema: "dispatch.ground_combat.v1",
          turn: currentTurn,
          system: {
            id: systemId, name: sys.system_name,
            hex: (() => { const h = Array.from(mapState.hexes.values()).find(hx => hx.hex_id === sys.hex_id); return h ? { x: h.x, y: h.y } : null; })(),
            planet_type: sys.planet_type_id || null,
            population_before: Number(sys.current_population) || 0,
            population_after: Number(sys.current_population) || 0,
          },
          attacker: {
            faction: attackerOwnerForLog || null,
            faction_display: attackerDisplay,
            is_infect: championInfects,
            fleet_name: "surface forces",
            ground_force_start: bucketsRaw.reduce((s, b) => s + b.starting_gi, 0),
            ground_force_end: (sys.landed_forces || []).reduce((s: number, b: any) => s + (b.quantity || 0), 0),
            transports_destroyed: 0,
          },
          defender: {
            faction: previousOwner || null,
            faction_display: defenderDisplay,
            ground_defenses_start: startingDefenses,
            ground_defenses_end: sys.current_ground_defenses,
          },
          outcome: {
            kind: outcome,
            rule_path: championInfects ? "infect" : "standard",
            new_owner: sys.owner || null,
            previous_owner: previousOwner || null,
            kill_chance: killChance,
            synod_purge: synodPurge,
          },
          combat_transcript: {
            seed, kill_chance: killChance,
            phase_a: phaseATranscript,
            phase_b: champion && round ? {
              champion: champion.owner_classification,
              defenses_start: startingDefenses,
              champion_rolls: round.aRolls,
              defense_rolls: round.bRolls,
              champion_kills_on_defenses: round.bKilled,
              defense_kills_on_champion: round.aKilled,
              champion_end: champion.gi,
              defenses_end: newDefenses,
              infect_multiplied: infectMultiplied,
              infect_multiplier: infectMultiplied ? infectMultiplier : null,
              invader_gi_before_multiplier: infectMultiplied ? preMultiplyGi : null,
            } : null,
          },
          debug_lines: debugLines,
          narration_hints: {
            tone: outcome === "repulsed" ? "heroic"
              : outcome === "colonize" ? "neutral"
              : outcome === "ongoing" ? "tense"
              : "grim",
            headline_seed:
              outcome === "capture" ? `${sys.system_name} falls to ${attackerDisplay}`
              : outcome === "colonize" ? `${attackerDisplay} colonizes ${sys.system_name}`
              : outcome === "repulsed" ? `${sys.system_name} repulses invasion`
              : outcome === "ongoing" ? `Ground war continues on ${sys.system_name}`
              : `Ground fighting on ${sys.system_name}`,
          },
        };

        const outcomeVerb =
          outcome === "colonize" ? "colonizes"
          : outcome === "capture" ? "captures"
          : outcome === "repulsed" ? "fails to take"
          : outcome === "ongoing" ? "continues attacking"
          : "engages";

        emitDispatches({
          sys, basePayload,
          message: `${attackerDisplay} ${outcomeVerb} ${sys.system_name}${previousOwner ? ` (defender: ${defenderDisplay})` : ""}.`,
          attackerOwner: attackerOwnerForLog,
          previousOwner,
        });
      }

      resolved++;
    }

    ctx.logs.push({
      game_id: gameId, turn_number: currentTurn, phase: "ground_combat",
      log_type: "ground_combat_summary",
      message: `Ground combat phase complete — ${landedThisTurn.length} landing(s), ${resolved} surface engagement(s).`,
    });
  },
};
