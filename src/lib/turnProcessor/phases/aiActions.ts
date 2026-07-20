/**
 * AI Actions — enhance_offense vertical slice (v2).
 *
 * When an AI faction has an active `enhance_offense` plan (feasibility
 * >= 0.5), we:
 *
 *   1. Pick a **production hub** = highest-capacity owned shipyard system.
 *   2. Pick a **spawn hex** = closest empty hex to the hub.
 *   3. Pick a **fleet template** tagged for this faction closest in
 *      point-cost to a per-persona budget.
 *   4. Instantiate a new EMPTY game_fleets row at the spawn hex
 *      (composition will be built up over turns from production).
 *   5. Queue production for each ship in the template across all owned
 *      shipyards within 8 hexes of the hub, biggest ships first at the
 *      most powerful starports, subject to treasury and per-yard hull
 *      class limits. Completed ships route to the new fleet via
 *      destination_fleet_id (ShipProduction phase handles delivery).
 *
 * Dedupe: a plan is skipped this turn if a fleet already exists whose
 * fleet_name ends with `[plan:XXXXXXXX]` (short plan id). This means one
 * "raise a fleet" action per plan lifetime — subsequent turns keep
 * queueing more ships INTO that same fleet only if the plan is
 * re-selected AFTER the previous fleet was completed and removed / the
 * plan is rebound; ship-fill is otherwise driven by the production
 * queue advancing each turn.
 */
import type { Phase, TurnContext } from "../types";
import { ownerMatchesFaction } from "@/lib/factionUtils";
import { selectProductionHub, selectSpawnHex, shipyardsWithinRange } from "@/lib/ai/productionHub";
import { composeFleetFromTemplates } from "@/lib/ai/fleetComposer";

const HUB_RADIUS = 8;
const DEFAULT_BUDGET = 300;

export const aiActionsPhase: Phase = {
  name: "ai_plans" as any,
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

    // 2. Active enhance_offense plans
    const { data: planRows } = await (supabase as any)
      .from("ai_plans")
      .select("id, player_id, goal_id, slate_slot, target_kind, target_id, target_label, feasibility, ai_goals:goal_id(goal_type)")
      .eq("game_id", gameId)
      .eq("status", "active")
      .gte("feasibility", 0.5)
      .in("player_id", aiFactions.map((f) => f.id));
    const plans = (planRows || []).filter(
      (p: any) => p.ai_goals?.goal_type === "enhance_offense",
    );
    if (plans.length === 0) return;

    // 3. Hull class sort order
    const { data: hullRows } = await (supabase as any)
      .from("ship_hull_classes")
      .select("code, sort_order");
    const hullSortByCode = new Map<string, number>();
    for (const r of (hullRows as any[]) || []) hullSortByCode.set(r.code, Number(r.sort_order) || 0);

    // Cache existing fleets by name-suffix for dedupe.
    const { data: fleetRows } = await (supabase as any)
      .from("game_fleets")
      .select("id, fleet_name, owner_classification")
      .eq("game_id", gameId);
    const existingFleetNames = new Set<string>(
      ((fleetRows as any[]) || []).map((f) => f.fleet_name || ""),
    );

    for (const plan of plans) {
      const faction = aiFactions.find((f) => f.id === plan.player_id);
      if (!faction) continue;
      const factionCode = faction.factions?.code_name || "";
      const planTag = `[plan:${String(plan.id).slice(0, 8)}]`;

      // Dedupe: skip if we already raised this fleet.
      const already = Array.from(existingFleetNames).some((n) => n.endsWith(planTag));
      if (already) continue;

      // 3a. Hub
      const hub = selectProductionHub(mapState, factionCode, facilityTypes, hullSortByCode);
      if (!hub) {
        ctx.logs.push({
          game_id: gameId, turn_number: currentTurn, phase: "ai_plans" as any,
          log_type: "ai_action_skip",
          message: `[${factionCode}] enhance_offense: no production hub (no owned shipyard)`,
          details_json: { plan_id: plan.id },
        });
        continue;
      }

      // 3b. Spawn hex
      const spawn = selectSpawnHex(mapState, hub, 3) ?? { x: hub.hex.x, y: hub.hex.y };

      // 3c. Composer — budget scales with faction treasury but capped.
      const treasury0 = Number(faction.treasury) || 0;
      const budget = Math.min(DEFAULT_BUDGET, Math.max(50, Math.floor(treasury0 * 0.6)));
      const composition = await composeFleetFromTemplates(
        supabase, faction.faction_id, budget, hullSortByCode,
      );
      if (!composition) {
        ctx.logs.push({
          game_id: gameId, turn_number: currentTurn, phase: "ai_plans" as any,
          log_type: "ai_action_skip",
          message: `[${factionCode}] enhance_offense: no eligible fleet templates (budget ${budget})`,
          details_json: { plan_id: plan.id, budget },
        });
        continue;
      }

      // 3d. Instantiate empty new fleet
      const fleetName = `${composition.template_name} ${planTag}`;
      const { data: newFleet, error: nfErr } = await (supabase as any)
        .from("game_fleets")
        .insert({
          game_id: gameId,
          owner_classification: factionCode,
          fleet_name: fleetName,
          hex_x: spawn.x,
          hex_y: spawn.y,
          system_id: null,
          is_garrison: false,
        })
        .select("id")
        .single();
      if (nfErr || !newFleet?.id) {
        ctx.logs.push({
          game_id: gameId, turn_number: currentTurn, phase: "ai_plans" as any,
          log_type: "ai_action_error",
          message: `[${factionCode}] enhance_offense: fleet create failed: ${nfErr?.message || "unknown"}`,
          details_json: { plan_id: plan.id, error: nfErr?.message },
        });
        continue;
      }
      // The AFTER INSERT trigger snapshots ships when source fleet_id is a
      // template UUID. We inserted WITHOUT fleet_id (no source) → new fleet
      // starts empty; production will fill it. Clean up any accidental
      // rows just in case.
      await (supabase as any).from("game_fleet_ships").delete().eq("game_fleet_id", newFleet.id);
      existingFleetNames.add(fleetName);

      // 3e. Shipyards within HUB_RADIUS
      const yards = shipyardsWithinRange(
        mapState, factionCode, facilityTypes, hullSortByCode, hub, HUB_RADIUS,
      );
      if (yards.length === 0) continue;

      // Per-yard remaining position tail lookup (queued after existing).
      const nextPosByYard = new Map<number, number>();
      for (const y of yards) {
        const { data: maxRow } = await (supabase as any)
          .from("system_ship_production")
          .select("position")
          .eq("game_id", gameId)
          .eq("system_id", y.system.system_id)
          .order("position", { ascending: false })
          .limit(1)
          .maybeSingle();
        nextPosByYard.set(y.system.system_id, (maxRow?.position ?? 0) + 1);
      }

      // 3f. Assign ships big-first across yards.
      let treasury = treasury0;
      const queued: Array<{ ship: string; system: string; cost: number }> = [];
      const skipped: Array<{ ship: string; reason: string }> = [];
      let yardCursor = 0;
      for (const ship of composition.ships) {
        // Find first yard (starting at cursor, round-robin) that can build
        // this hull_class and has hull sort >= ship.hull_sort. Yards are
        // pre-sorted by capacity+max-hull desc, so this naturally prefers
        // the most powerful starport.
        let placed = false;
        for (let i = 0; i < yards.length; i++) {
          const y = yards[(yardCursor + i) % yards.length];
          const canBuild =
            y.maxHullSort < 0 || y.maxHullSort >= ship.hull_sort;
          if (!canBuild) continue;
          if (treasury < ship.point_cost) {
            skipped.push({ ship: ship.ship_name, reason: `treasury ${treasury} < cost ${ship.point_cost}` });
            placed = true; // stop trying — no yard will help
            break;
          }
          const pos = nextPosByYard.get(y.system.system_id) || 1;
          const { error: qErr } = await (supabase as any)
            .from("system_ship_production")
            .insert({
              game_id: gameId,
              system_id: y.system.system_id,
              position: pos,
              ship_type_id: ship.ship_type_id,
              quantity: 1,
              destination_fleet_id: newFleet.id,
              destination_hex_x: spawn.x,
              destination_hex_y: spawn.y,
              points_remaining: ship.point_cost,
              cost_paid: ship.point_cost,
              owner_classification: factionCode,
            });
          if (qErr) {
            skipped.push({ ship: ship.ship_name, reason: `insert err: ${qErr.message}` });
            break;
          }
          nextPosByYard.set(y.system.system_id, pos + 1);
          treasury -= ship.point_cost;
          queued.push({ ship: ship.ship_name, system: y.system.system_name, cost: ship.point_cost });
          yardCursor = (yardCursor + i + 1) % yards.length;
          placed = true;
          break;
        }
        if (!placed) {
          skipped.push({ ship: ship.ship_name, reason: "no yard can build this hull class" });
        }
        if (treasury <= 0) break;
      }

      // 3g. Debit treasury.
      if (treasury !== treasury0) {
        await (supabase as any)
          .from("game_factions")
          .update({ treasury })
          .eq("id", faction.id);
        faction.treasury = treasury;
      }

      // 3h. Audit logs
      ctx.logs.push({
        game_id: gameId, turn_number: currentTurn, phase: "ai_plans" as any,
        log_type: "ai_action",
        message: `[${factionCode}] enhance_offense: raised fleet "${composition.template_name}" at (${spawn.x},${spawn.y}); queued ${queued.length} ship(s) across ${yards.length} shipyard(s); treasury ${treasury0} → ${treasury}`,
        details_json: {
          plan_id: plan.id,
          faction: factionCode,
          goal: "enhance_offense",
          hub_system_id: hub.system.system_id,
          hub_system_name: hub.system.system_name,
          spawn_hex: spawn,
          template_id: composition.template_id,
          template_name: composition.template_name,
          template_points: composition.template_points,
          budget,
          new_fleet_id: newFleet.id,
          new_fleet_name: fleetName,
          queued, skipped,
          treasury_before: treasury0, treasury_after: treasury,
        },
      });

      await (supabase as any).from("ai_decision_log").insert({
        game_id: gameId,
        player_id: faction.id,
        turn_number: currentTurn,
        phase: "actions",
        summary: `enhance_offense → raised "${composition.template_name}" at hub ${hub.system.system_name}; queued ${queued.length} ship(s) (₡${treasury0 - treasury})`,
        details_json: {
          plan_id: plan.id, slot: plan.slate_slot,
          hub_system_id: hub.system.system_id,
          new_fleet_id: newFleet.id,
          template_id: composition.template_id,
          queued_count: queued.length,
          skipped_count: skipped.length,
          treasury_before: treasury0, treasury_after: treasury,
        },
      });
    }
  },
};
