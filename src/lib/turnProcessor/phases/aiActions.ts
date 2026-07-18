/**
 * AI Actions — Vertical Slice.
 *
 * First real "AI acts on its plans" phase. Currently wires exactly one
 * goal end-to-end: `enhance_offense`. When an AI faction has an active
 * plan in that goal, is treasury-solvent, and the target hub system has
 * ship-build capacity, we queue the cheapest ship into
 * `system_ship_production` and debit the faction's treasury.
 *
 * Guardrails:
 *  - Only AI factions (game_factions.is_ai = true) are processed.
 *  - Plan must have feasibility >= 0.5 and status = 'active'.
 *  - Skips if this AI already has an active build queued at this system
 *    (prevents unbounded stacking each turn while the plan persists).
 *  - Every action writes an audit row to `game_logs` and a breadcrumb
 *    into `ai_decision_log` (phase = 'actions').
 *
 * Runs AFTER aiPlansPhase so it sees this turn's freshly bound plans.
 */
import type { Phase, TurnContext } from "../types";
import { ownerMatchesFaction } from "@/lib/factionUtils";

interface ShipTypeLite {
  id: string;
  point_cost: number;
  hull_class: string;
  ship_name: string;
}

export const aiActionsPhase: Phase = {
  name: "ai_plans" as any, // reuse phase name for now; log_type distinguishes
  label: "AI Actions",
  async run(ctx: TurnContext) {
    const { supabase, gameId, currentTurn, mapState, facilityTypes } = ctx;

    // 1. AI factions
    const { data: gfRows } = await (supabase as any)
      .from("game_factions")
      .select("id, treasury, is_ai, faction_id, factions:faction_id(code_name)")
      .eq("game_id", gameId)
      .eq("is_ai", true);
    const aiFactions = (gfRows || []) as Array<{
      id: string; treasury: number | null; faction_id: string;
      factions: { code_name: string } | null;
    }>;
    if (aiFactions.length === 0) return;

    // 2. Active enhance_offense plans for these factions
    const { data: planRows } = await (supabase as any)
      .from("ai_plans")
      .select("id, player_id, goal_id, slate_slot, target_kind, target_id, target_label, feasibility, ai_goals:goal_id(goal_type)")
      .eq("game_id", gameId)
      .eq("status", "active")
      .gte("feasibility", 0.5)
      .in("player_id", aiFactions.map(f => f.id));
    const plans = (planRows || []).filter((p: any) => p.ai_goals?.goal_type === "enhance_offense" && p.target_kind === "system" && p.target_id);
    if (plans.length === 0) return;

    // 3. Ship-type catalogue (cheapest combat-worthy build).
    const { data: shipTypeRows } = await (supabase as any)
      .from("ship_types")
      .select("id, point_cost, hull_class, ship_name")
      .gt("point_cost", 0)
      .order("point_cost", { ascending: true });
    const shipTypes = (shipTypeRows || []) as ShipTypeLite[];
    if (shipTypes.length === 0) return;
    const cheapest = shipTypes[0];

    for (const plan of plans) {
      const faction = aiFactions.find(f => f.id === plan.player_id);
      if (!faction) continue;
      const factionCode = faction.factions?.code_name || "";
      const targetSysId = Number(plan.target_id);
      const sys = mapState.systems.get(targetSysId);
      if (!sys) continue;

      // Ownership must still hold.
      if (!ownerMatchesFaction(sys.owner, factionCode)) continue;

      // Shipyard capacity check.
      let capacity = 0;
      for (const f of sys.facilities || []) {
        const ft = facilityTypes.find(t => String(t.id) === String(f.facility_type_id));
        const c = Number((ft as any)?.ship_build_capacity) || 0;
        if (c > 0) capacity += c * (f.quantity || 1);
      }
      if (capacity <= 0) {
        ctx.logs.push({
          game_id: gameId, turn_number: currentTurn, phase: "ai_plans" as any,
          log_type: "ai_action_skip",
          message: `[${factionCode}] enhance_offense skipped at ${sys.system_name}: no shipyard capacity`,
          details_json: { plan_id: plan.id, system_id: targetSysId },
        });
        continue;
      }

      const cost = cheapest.point_cost;
      const treasury = Number(faction.treasury) || 0;
      if (treasury < cost) {
        ctx.logs.push({
          game_id: gameId, turn_number: currentTurn, phase: "ai_plans" as any,
          log_type: "ai_action_skip",
          message: `[${factionCode}] enhance_offense skipped at ${sys.system_name}: treasury ${treasury} < cost ${cost}`,
          details_json: { plan_id: plan.id, treasury, cost },
        });
        continue;
      }

      // Already queued something here? One queued build per plan per system
      // keeps the vertical slice bounded.
      const { data: existing } = await (supabase as any)
        .from("system_ship_production")
        .select("id")
        .eq("game_id", gameId)
        .eq("system_id", targetSysId)
        .eq("owner_classification", factionCode)
        .limit(1);
      if ((existing || []).length > 0) continue;

      // Destination: nearest own fleet (prefer garrison at this system's hex).
      const sysHex = Array.from(mapState.hexes.values()).find(h => h.hex_id === sys.hex_id);
      let destFleetId: string | null = null;
      if (sysHex) {
        const ownFleets = mapState.fleets.filter(f => ownerMatchesFaction((f as any).owner_classification, factionCode));
        const atSystem = ownFleets.find(f => f.hex_x === sysHex.x && f.hex_y === sysHex.y);
        destFleetId = (atSystem?.fleet_id as any) || (ownFleets[0]?.fleet_id as any) || null;
      }

      // Position at tail
      const { data: maxRow } = await (supabase as any)
        .from("system_ship_production")
        .select("position")
        .eq("game_id", gameId)
        .eq("system_id", targetSysId)
        .order("position", { ascending: false })
        .limit(1)
        .maybeSingle();
      const nextPos = (maxRow?.position ?? 0) + 1;

      const { error: insErr } = await (supabase as any).from("system_ship_production").insert({
        game_id: gameId,
        system_id: targetSysId,
        position: nextPos,
        ship_type_id: cheapest.id,
        quantity: 1,
        destination_fleet_id: destFleetId,
        destination_hex_x: sysHex?.x ?? null,
        destination_hex_y: sysHex?.y ?? null,
        points_remaining: cost,
        cost_paid: cost,
        owner_classification: factionCode,
      });
      if (insErr) {
        ctx.logs.push({
          game_id: gameId, turn_number: currentTurn, phase: "ai_plans" as any,
          log_type: "ai_action_error",
          message: `[${factionCode}] enhance_offense insert failed at ${sys.system_name}: ${insErr.message}`,
          details_json: { plan_id: plan.id, error: insErr.message },
        });
        continue;
      }

      // Debit treasury.
      await (supabase as any)
        .from("game_factions")
        .update({ treasury: treasury - cost })
        .eq("id", faction.id);
      faction.treasury = treasury - cost;

      // Audit log (visible in Turn Logs).
      ctx.logs.push({
        game_id: gameId, turn_number: currentTurn, phase: "ai_plans" as any,
        log_type: "ai_action",
        message: `[${factionCode}] enhance_offense: queued ${cheapest.ship_name} at ${sys.system_name} (₡${cost}, treasury ${treasury} → ${treasury - cost})`,
        details_json: {
          plan_id: plan.id, faction: factionCode, goal: "enhance_offense",
          system_id: targetSysId, system_name: sys.system_name,
          ship_type_id: cheapest.id, ship_name: cheapest.ship_name,
          cost, treasury_before: treasury, treasury_after: treasury - cost,
          destination_fleet_id: destFleetId,
        },
      });

      // AI decision-log breadcrumb.
      await (supabase as any).from("ai_decision_log").insert({
        game_id: gameId,
        player_id: faction.id,
        turn_number: currentTurn,
        phase: "actions",
        summary: `enhance_offense → build ${cheapest.ship_name} at ${sys.system_name} (₡${cost})`,
        details_json: {
          plan_id: plan.id, slot: plan.slate_slot,
          system_id: targetSysId, ship_type_id: cheapest.id,
          cost, treasury_before: treasury, treasury_after: treasury - cost,
        },
      });
    }
  },
};
