/**
 * Threat Assessment Phase
 *
 * For every AI-controlled faction, computes two beliefs and stores them in
 * ai_world_beliefs (one row per belief per turn):
 *
 *   1. enemy_strength_total  — sum of believed point values of every enemy
 *      fleet ever observed. Reads from player_fleet_intel (quantity_seen ×
 *      ship_types.point_cost). Because the visibility/combat phases overwrite
 *      intel rows when a fleet is re-spotted, simply summing across all of
 *      this observer's intel naturally implements "remember + refresh on
 *      re-sighting" fog memory.
 *
 *   2. enemy_strength_nearby — sum of point values of enemy fleets visible
 *      THIS turn (last_seen_turn = currentTurn) whose hex is within 8 hexes
 *      of any planet the faction owns.
 *
 * Each belief is compared against a stored baseline. If the relative change
 * exceeds the persona's tolerance, a goal-recompute trigger log is emitted
 * and the baseline is bumped to the new value.
 */
import type { Phase, TurnContext } from "../types";
import { offsetToCube, cubeDistance } from "@/lib/hexUtils";

const HEX_RANGE = 8;

export const threatAssessmentPhase: Phase = {
  name: "threat_assessment",
  label: "Threat Assessment",
  async run(ctx: TurnContext) {
    const { supabase, gameId, currentTurn, mapState } = ctx;

    // Pull AI factions + persona tolerances + faction code_name (sys.owner uses code_name)
    const { data: gfRows } = await (supabase as any)
      .from("game_factions")
      .select(
        "id, faction_id, is_ai, ai_persona_id, factions:faction_id(code_name, ai_persona_id), persona:ai_persona_id(enemy_strength_total_tolerance_pct, enemy_strength_nearby_tolerance_pct)"
      )
      .eq("game_id", gameId);

    const aiFactions = (gfRows || []).filter((r: any) => r.is_ai && r.factions?.code_name);
    if (aiFactions.length === 0) return;

    // Resolve effective persona tolerances (gf.persona overrides faction default; fall back to persona on factions)
    const personaIds = new Set<string>();
    for (const r of aiFactions) {
      const pid = r.ai_persona_id || r.factions?.ai_persona_id;
      if (pid) personaIds.add(pid);
    }
    const personaToleranceByPid = new Map<string, { total: number; nearby: number }>();
    if (personaIds.size > 0) {
      const { data: personas } = await (supabase as any)
        .from("ai_personas")
        .select("id, enemy_strength_total_tolerance_pct, enemy_strength_nearby_tolerance_pct")
        .in("id", Array.from(personaIds));
      for (const p of personas || []) {
        personaToleranceByPid.set(p.id, {
          total: Number(p.enemy_strength_total_tolerance_pct) || 0.15,
          nearby: Number(p.enemy_strength_nearby_tolerance_pct) || 0.25,
        });
      }
    }

    // Ship type → point_cost
    const { data: stRows } = await (supabase as any)
      .from("ship_types")
      .select("id, point_cost");
    const pointsByShipType = new Map<string, number>();
    for (const s of stRows || []) pointsByShipType.set(s.id, Number(s.point_cost) || 0);

    // All intel rows for the relevant observers
    const observerIds = aiFactions.map((r: any) => r.id);
    const { data: intelRows } = await (supabase as any)
      .from("player_fleet_intel")
      .select("observer_player_id, enemy_fleet_id, ship_type_id, quantity_seen, last_seen_turn")
      .in("observer_player_id", observerIds);

    // Game fleets (for hex coords of currently-visible enemy fleets)
    const { data: gameFleets } = await (supabase as any)
      .from("game_fleets")
      .select("id, hex_x, hex_y, owner_classification")
      .eq("game_id", gameId);
    const fleetById = new Map<string, { hex_x: number; hex_y: number; owner: string }>();
    for (const f of gameFleets || []) {
      fleetById.set(f.id, { hex_x: f.hex_x, hex_y: f.hex_y, owner: (f.owner_classification || "").trim() });
    }

    // Pull prior baselines in one shot
    const { data: baselineRows } = await (supabase as any)
      .from("ai_world_beliefs")
      .select("player_id, belief_key, value_json, turn_number")
      .eq("game_id", gameId)
      .in("player_id", observerIds)
      .in("belief_key", ["enemy_strength_total_baseline", "enemy_strength_nearby_baseline"]);
    const baselineMap = new Map<string, number>(); // key: `${player_id}|${belief_key}` → value
    const baselineIdsToUpdate = new Map<string, string>(); // not strictly needed; we'll upsert

    for (const b of baselineRows || []) {
      const v = Number((b.value_json as any)?.points) || 0;
      baselineMap.set(`${b.player_id}|${b.belief_key}`, v);
    }

    const beliefInserts: any[] = [];
    const baselineUpserts: any[] = [];

    for (const gf of aiFactions) {
      const observerId = gf.id;
      const factionCode = (gf.factions?.code_name || "").trim();
      const pid = gf.ai_persona_id || gf.factions?.ai_persona_id;
      const tol = (pid && personaToleranceByPid.get(pid)) || { total: 0.15, nearby: 0.25 };

      // Aggregate intel per enemy fleet
      const intelForObserver = (intelRows || []).filter((r: any) => r.observer_player_id === observerId);

      let totalPoints = 0;
      let totalFleetCount = 0;
      const fleetPointsMap = new Map<string, { points: number; last_seen_turn: number }>();
      for (const row of intelForObserver) {
        const pts = (pointsByShipType.get(row.ship_type_id) || 0) * (row.quantity_seen || 0);
        const cur = fleetPointsMap.get(row.enemy_fleet_id) || { points: 0, last_seen_turn: 0 };
        cur.points += pts;
        cur.last_seen_turn = Math.max(cur.last_seen_turn, row.last_seen_turn || 0);
        fleetPointsMap.set(row.enemy_fleet_id, cur);
      }
      for (const v of fleetPointsMap.values()) {
        totalPoints += v.points;
        if (v.points > 0) totalFleetCount += 1;
      }

      // Owned planet hexes
      const hexByHexId = new Map<number, { x: number; y: number }>();
      for (const h of mapState.hexes.values()) hexByHexId.set(h.hex_id, { x: h.x, y: h.y });
      const ownedHexes: Array<[number, number]> = [];
      for (const sys of mapState.systems.values()) {
        if ((sys.owner || "").trim() === factionCode) {
          const hex = hexByHexId.get(sys.hex_id);
          if (hex) ownedHexes.push([hex.x, hex.y]);
        }
      }
      const ownedCubes = ownedHexes.map(([x, y]) => offsetToCube(x, y));

      // Nearby enemy fleets visible this turn
      let nearbyPoints = 0;
      let nearbyFleetCount = 0;
      for (const [fid, agg] of fleetPointsMap) {
        if (agg.last_seen_turn !== currentTurn) continue;
        const fleet = fleetById.get(fid);
        if (!fleet) continue;
        if (fleet.owner === factionCode) continue; // own fleet, skip
        const [cx, cy, cz] = offsetToCube(fleet.hex_x, fleet.hex_y);
        let minDist = Infinity;
        for (const [ox, oy, oz] of ownedCubes) {
          const d = cubeDistance(cx, cy, cz, ox, oy, oz);
          if (d < minDist) minDist = d;
        }
        if (minDist <= HEX_RANGE) {
          nearbyPoints += agg.points;
          nearbyFleetCount += 1;
        }
      }

      // Persist beliefs
      beliefInserts.push({
        game_id: gameId,
        player_id: observerId,
        turn_number: currentTurn,
        belief_key: "enemy_strength_total",
        confidence: 0.7,
        value_json: { points: totalPoints, fleet_count: totalFleetCount, range_hexes: null },
      });
      beliefInserts.push({
        game_id: gameId,
        player_id: observerId,
        turn_number: currentTurn,
        belief_key: "enemy_strength_nearby",
        confidence: 1.0,
        value_json: { points: nearbyPoints, fleet_count: nearbyFleetCount, range_hexes: HEX_RANGE },
      });

      // Compare against baseline → maybe trigger recompute
      const prevTotal = baselineMap.get(`${observerId}|enemy_strength_total_baseline`) ?? 0;
      const prevNearby = baselineMap.get(`${observerId}|enemy_strength_nearby_baseline`) ?? 0;
      const totalDelta = Math.abs(totalPoints - prevTotal) / Math.max(prevTotal, 1);
      const nearbyDelta = Math.abs(nearbyPoints - prevNearby) / Math.max(prevNearby, 1);

      const totalTriggered = prevTotal === 0 ? totalPoints > 0 : totalDelta >= tol.total;
      const nearbyTriggered = prevNearby === 0 ? nearbyPoints > 0 : nearbyDelta >= tol.nearby;

      if (totalTriggered) {
        baselineUpserts.push({
          game_id: gameId,
          player_id: observerId,
          turn_number: currentTurn,
          belief_key: "enemy_strength_total_baseline",
          confidence: 1.0,
          value_json: { points: totalPoints, baseline_turn: currentTurn },
        });
      }
      if (nearbyTriggered) {
        baselineUpserts.push({
          game_id: gameId,
          player_id: observerId,
          turn_number: currentTurn,
          belief_key: "enemy_strength_nearby_baseline",
          confidence: 1.0,
          value_json: { points: nearbyPoints, baseline_turn: currentTurn },
        });
      }

      ctx.logs.push({
        game_id: gameId,
        turn_number: currentTurn,
        phase: "threat_assessment",
        log_type: "threat_assessment",
        message:
          `${factionCode}: known enemy strength ${totalPoints} pts (${totalFleetCount} fleet${totalFleetCount === 1 ? "" : "s"}), ` +
          `nearby (≤${HEX_RANGE}hx) ${nearbyPoints} pts (${nearbyFleetCount}).` +
          (totalTriggered || nearbyTriggered
            ? ` Goal recompute triggered [${[totalTriggered ? "total" : null, nearbyTriggered ? "nearby" : null].filter(Boolean).join(", ")}].`
            : ""),
        details_json: {
          faction: factionCode,
          observer_player_id: observerId,
          enemy_strength_total: totalPoints,
          enemy_strength_total_baseline: prevTotal,
          enemy_strength_total_delta_pct: Number(totalDelta.toFixed(4)),
          enemy_strength_total_tolerance_pct: tol.total,
          enemy_strength_total_triggered: totalTriggered,
          enemy_strength_nearby: nearbyPoints,
          enemy_strength_nearby_baseline: prevNearby,
          enemy_strength_nearby_delta_pct: Number(nearbyDelta.toFixed(4)),
          enemy_strength_nearby_tolerance_pct: tol.nearby,
          enemy_strength_nearby_triggered: nearbyTriggered,
          owned_planet_count: ownedHexes.length,
          known_enemy_fleet_count: totalFleetCount,
        },
      });
    }

    if (beliefInserts.length > 0) {
      await (supabase as any).from("ai_world_beliefs").insert(beliefInserts);
    }
    if (baselineUpserts.length > 0) {
      await (supabase as any).from("ai_world_beliefs").insert(baselineUpserts);
    }
  },
};
