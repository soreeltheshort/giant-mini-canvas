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
import { selectProductionHub, selectSpawnHex, shipyardsWithinRange } from "@/lib/ai/productionHub";
import { composeFleetFromTemplates } from "@/lib/ai/fleetComposer";
import { decideBolsterDefense } from "@/lib/ai/bolsterDefense";
import { ownerMatchesFaction } from "@/lib/factionUtils";


const HUB_RADIUS = 8;
// Aspirational target size for a raised fleet. Independent of current
// treasury — the per-ship queueing loop below only spends what the
// faction can actually afford this turn, and #5 (resume-fill) picks up
// the shortfall on subsequent turns. Making this treasury-scaled would
// force poor factions to keep re-picking tiny templates instead of
// working toward a real fleet.
const DEFAULT_BUDGET = 300;


export const aiActionsPhase: Phase = {
  name: "ai_actions",
  label: "AI Actions",
  async run(ctx: TurnContext) {
    if (!ctx.enableAiSlates) {
      ctx.logs.push({
        game_id: ctx.gameId,
        turn_number: ctx.currentTurn,
        phase: "ai_actions",
        log_type: "ai_skip",
        message: "Skipped — enable_ai_slates is false",
      });
      return;
    }
    const { supabase, gameId, currentTurn, mapState, facilityTypes } = ctx;

    // 1. AI factions
    const { data: gfRows } = await (supabase as any)
      .from("game_factions")
      .select("id, treasury, is_ai, faction_id, visible_system_ids, factions:faction_id(code_name)")
      .eq("game_id", gameId)
      .eq("is_ai", true);
    const aiFactions = (gfRows || []) as Array<{
      id: string; treasury: number | null; faction_id: string;
      visible_system_ids: any;
      factions: { code_name: string } | null;
    }>;
    if (aiFactions.length === 0) return;

    // 2. Active plans we can execute
    const { data: planRows } = await (supabase as any)
      .from("ai_plans")
      .select("id, player_id, goal_id, slate_slot, target_kind, target_id, target_label, feasibility, ai_goals:goal_id(goal_type)")
      .eq("game_id", gameId)
      .eq("status", "active")
      .gte("feasibility", 0.5)
      .in("player_id", aiFactions.map((f) => f.id));
    const allPlans = (planRows || []) as any[];
    const defensePlans = allPlans.filter((p: any) => p.ai_goals?.goal_type === "bolster_defense");
    // enhance_offense and conquer share the "raise a fleet" pipeline; conquer
    // additionally sizes the force against the target's known defenses and
    // adds ground invasion troops.
    const buildPlans = allPlans
      .filter((p: any) => p.ai_goals?.goal_type === "enhance_offense" || p.ai_goals?.goal_type === "conquer")
      .map((p: any) => ({ plan: p, goal: p.ai_goals.goal_type as "enhance_offense" | "conquer" }));
    if (buildPlans.length === 0 && defensePlans.length === 0) return;


    // 3. Hull class sort order
    const { data: hullRows } = await (supabase as any)
      .from("ship_hull_classes")
      .select("code, sort_order");
    const hullSortByCode = new Map<string, number>();
    for (const r of (hullRows as any[]) || []) hullSortByCode.set(r.code, Number(r.sort_order) || 0);

    // Ship catalogue (troop-capable hull selection for conquer).
    const { data: shipTypeRows } = await (supabase as any)
      .from("ship_types")
      .select("id, name, hull_class, point_cost, ground_invasion");
    const conquerShipTypes = ((shipTypeRows as any[]) || []).map((s) => ({
      id: String(s.id),
      name: s.name,
      hull_class: s.hull_class,
      point_cost: Number(s.point_cost) || 0,
      ground_invasion: Number(s.ground_invasion) || 0,
    }));

    // Cache existing fleets (used to find prior plan fleet for resume-fill).
    const { data: fleetRows } = await (supabase as any)
      .from("game_fleets")
      .select("id, fleet_id, fleet_name, owner_classification, hex_x, hex_y")
      .eq("game_id", gameId);
    const existingFleets = (fleetRows as any[]) || [];


    const { data: gameRow } = await (supabase as any)
      .from("games")
      .select("created_by")
      .eq("id", gameId)
      .maybeSingle();
    const gameOwnerId = gameRow?.created_by || null;

    for (const { plan, goal } of buildPlans) {
      const faction = aiFactions.find((f) => f.id === plan.player_id);
      if (!faction) continue;
      const factionCode = faction.factions?.code_name || "";
      const planTag = `[plan:${String(plan.id).slice(0, 8)}]`;

      // #5: resume-fill. Reuse the existing plan fleet if present instead of
      // permanently skipping the plan.
      const priorFleet = existingFleets.find(
        (f) => (f.fleet_name || "").endsWith(planTag),
      );

      // 3a. Hub
      const hub = selectProductionHub(mapState, factionCode, facilityTypes, hullSortByCode);
      if (!hub) {
        ctx.logs.push({
          game_id: gameId, turn_number: currentTurn, phase: "ai_actions",
          log_type: "ai_action_skip",
          message: `[${factionCode}] ${goal}: no production hub (no owned shipyard)`,
          details_json: { plan_id: plan.id },
        });
        continue;
      }

      // 3b. Spawn hex — for a new fleet only; existing fleets keep their hex.
      const spawn = priorFleet
        ? { x: priorFleet.hex_x, y: priorFleet.hex_y }
        : (selectSpawnHex(mapState, hub, 3) ?? { x: hub.hex.x, y: hub.hex.y });

      // 3b-bis. conquer — analyse the target's defences to size the force.
      let assessment: ConquerAssessment | null = null;
      let targetSystemName: string | null = null;
      if (goal === "conquer") {
        if (plan.target_kind !== "system" || !plan.target_id) {
          ctx.logs.push({
            game_id: gameId, turn_number: currentTurn, phase: "ai_actions",
            log_type: "ai_action_skip",
            message: `[${factionCode}] conquer: no system target bound`,
            details_json: { plan_id: plan.id },
          });
          continue;
        }
        const sysId = Number(plan.target_id);
        const targetSys = mapState.systems.get(sysId);
        if (!targetSys) {
          ctx.logs.push({
            game_id: gameId, turn_number: currentTurn, phase: "ai_actions",
            log_type: "ai_action_skip",
            message: `[${factionCode}] conquer: target system ${plan.target_id} not found`,
            details_json: { plan_id: plan.id },
          });
          continue;
        }
        targetSystemName = targetSys.system_name;
        const visibleRaw = faction.visible_system_ids;
        const visible: number[] = Array.isArray(visibleRaw)
          ? visibleRaw.map((v: any) => Number(v))
          : [];
        const garrisonKnown = visible.includes(sysId);
        assessment = assessConquerForce(targetSys, garrisonKnown, conquerShipTypes, hullSortByCode);
      }

      // 3c. Composer — aspirational target composition. Independent of
      // current treasury; per-ship affordability is checked in 3f.
      const treasury0 = Number(faction.treasury) || 0;
      const budget = assessment ? assessment.combat_budget : DEFAULT_BUDGET;

      const { result: composition, diagnostics: composerDiag } = await composeFleetFromTemplates(
        supabase, faction.faction_id, budget, hullSortByCode,
      );
      if (!composition) {
        ctx.logs.push({
          game_id: gameId, turn_number: currentTurn, phase: "ai_actions",
          log_type: "ai_action_skip",
          message: `[${factionCode}] ${goal}: composer returned no template (reason: ${composerDiag.reason}); budget ${budget}, eligible=${composerDiag.eligible_fleet_ids}/${composerDiag.total_fleets_scanned}, nonempty=${composerDiag.nonempty_templates}, ship_rows=${composerDiag.ship_rows_for_eligible}`,
          details_json: { plan_id: plan.id, budget, composer_diagnostics: composerDiag },
        });
        continue;
      }

      // 3c-bis. conquer — append troop hulls so the fleet lands 1.25x the
      // known (or assumed) garrison.
      const wantedShips = assessment
        ? [
            ...composition.ships,
            ...assessment.troop_ships.map((t) => ({
              ship_type_id: t.ship_type_id,
              hull_class: t.hull_class,
              point_cost: t.point_cost,
              ship_name: t.ship_name,
              hull_sort: t.hull_sort,
            })),
          ]
        : composition.ships;


      // 3d. Instantiate OR reuse target fleet.
      let targetFleetId: string;
      let targetSourceFleetId: string | null = priorFleet?.fleet_id || null;
      let fleetName: string;
      if (priorFleet) {
        targetFleetId = priorFleet.id;
        fleetName = priorFleet.fleet_name;
      } else {
        if (!gameOwnerId) {
          ctx.logs.push({
            game_id: gameId, turn_number: currentTurn, phase: "ai_actions",
            log_type: "ai_action_error",
            message: `[${factionCode}] enhance_offense: fleet create failed: game owner unavailable`,
            details_json: { plan_id: plan.id },
          });
          continue;
        }
        fleetName = `${composition.template_name} ${planTag}`;
        const { data: fleetTemplate, error: ftErr } = await (supabase as any)
          .from("fleets")
          .insert({
            owner_user_id: gameOwnerId,
            name: fleetName,
            points_budget: composition.template_points,
          })
          .select("id")
          .single();
        if (ftErr || !fleetTemplate?.id) {
          ctx.logs.push({
            game_id: gameId, turn_number: currentTurn, phase: "ai_actions",
            log_type: "ai_action_error",
            message: `[${factionCode}] enhance_offense: fleet template create failed: ${ftErr?.message || "unknown"}`,
            details_json: { plan_id: plan.id, error: ftErr?.message },
          });
          continue;
        }
        const sourceFleetId = String(fleetTemplate.id);
        targetSourceFleetId = sourceFleetId;
        const { data: newFleet, error: nfErr } = await (supabase as any)
          .from("game_fleets")
          .insert({
            game_id: gameId,
            fleet_id: sourceFleetId,
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
            game_id: gameId, turn_number: currentTurn, phase: "ai_actions",
            log_type: "ai_action_error",
            message: `[${factionCode}] enhance_offense: fleet create failed: ${nfErr?.message || "unknown"}`,
            details_json: { plan_id: plan.id, error: nfErr?.message },
          });
          continue;
        }
        // Clean up any accidental snapshot rows.
        await (supabase as any).from("game_fleet_ships").delete().eq("game_fleet_id", newFleet.id);
        targetFleetId = newFleet.id;
        existingFleets.push({ id: newFleet.id, fleet_id: sourceFleetId, fleet_name: fleetName, owner_classification: factionCode, hex_x: spawn.x, hex_y: spawn.y });
        mapState.fleets.push({
          fleet_id: targetFleetId,
          fleet_name: fleetName,
          owner_classification: factionCode,
          hex_x: spawn.x,
          hex_y: spawn.y,
          source_fleet_id: sourceFleetId,
        });
      }

      // 3d-bis. Compute what the fleet ALREADY has (delivered + queued) so
      // we only queue the remaining shortfall relative to `composition`.
      const covered = new Map<string, number>(); // ship_type_id -> count
      const [{ data: haveRows }, { data: queuedRows }] = await Promise.all([
        (supabase as any)
          .from("game_fleet_ships")
          .select("ship_type_id, quantity")
          .eq("game_fleet_id", targetFleetId),
        (supabase as any)
          .from("system_ship_production")
          .select("ship_type_id, quantity")
          .eq("game_id", gameId)
          .eq("destination_fleet_id", targetFleetId),
      ]);
      for (const r of ((haveRows as any[]) || []).concat((queuedRows as any[]) || [])) {
        covered.set(r.ship_type_id, (covered.get(r.ship_type_id) || 0) + (Number(r.quantity) || 0));
      }
      const shipsNeeded = composition.ships.filter((s) => {
        const rem = covered.get(s.ship_type_id) || 0;
        if (rem > 0) { covered.set(s.ship_type_id, rem - 1); return false; }
        return true;
      });

      // #4: nothing left to build → log completion and move on. The plan
      // will re-select next turn only if still active; that's expected.
      if (shipsNeeded.length === 0) {
        ctx.logs.push({
          game_id: gameId, turn_number: currentTurn, phase: "ai_actions",
          log_type: "ai_action_skip",
          message: `[${factionCode}] enhance_offense: plan fleet "${fleetName}" already at target composition — nothing to queue`,
          details_json: { plan_id: plan.id, fleet_id: targetFleetId, template_id: composition.template_id },
        });
        continue;
      }

      // 3e. Shipyards within HUB_RADIUS
      const yards = shipyardsWithinRange(
        mapState, factionCode, facilityTypes, hullSortByCode, hub, HUB_RADIUS,
      );
      if (yards.length === 0) {
        ctx.logs.push({
          game_id: gameId, turn_number: currentTurn, phase: "ai_actions",
          log_type: "ai_action_skip",
          message: `[${factionCode}] enhance_offense: no shipyards within ${HUB_RADIUS} of hub ${hub.system.system_name}`,
          details_json: { plan_id: plan.id, hub_system_id: hub.system.system_id },
        });
        continue;
      }

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
      let unaffordableCount = 0;
      let yardCursor = 0;
      for (const ship of shipsNeeded) {
        let placed = false;
        for (let i = 0; i < yards.length; i++) {
          const y = yards[(yardCursor + i) % yards.length];
          const canBuild = y.maxHullSort < 0 || y.maxHullSort >= ship.hull_sort;
          if (!canBuild) continue;
          if (treasury < ship.point_cost) {
            skipped.push({ ship: ship.ship_name, reason: `treasury ${treasury} < cost ${ship.point_cost}` });
            unaffordableCount += 1;
            placed = true;
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
              destination_fleet_id: targetFleetId,
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
      }

      // #4: distinct skip when treasury blocked EVERY ship this turn.
      if (queued.length === 0) {
        const reason = unaffordableCount === shipsNeeded.length
          ? "no_ships_affordable"
          : "plan_fleet_blocked";
        ctx.logs.push({
          game_id: gameId, turn_number: currentTurn, phase: "ai_actions",
          log_type: `ai_action_skip`,
          message: `[${factionCode}] enhance_offense: ${reason} for "${fleetName}" (treasury ${treasury0}, ${shipsNeeded.length} ship(s) needed)`,
          details_json: {
            plan_id: plan.id, fleet_id: targetFleetId, reason,
            treasury: treasury0, needed: shipsNeeded.length, skipped,
          },
        });
        continue;
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
      const verb = priorFleet ? "reinforced" : "raised";
      ctx.logs.push({
        game_id: gameId, turn_number: currentTurn, phase: "ai_actions",
        log_type: "ai_action",
        message: `[${factionCode}] enhance_offense: ${verb} fleet "${fleetName}" at (${spawn.x},${spawn.y}); queued ${queued.length} ship(s) across ${yards.length} shipyard(s); treasury ${treasury0} → ${treasury}`,
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
          fleet_id: targetFleetId,
          fleet_name: fleetName,
          reused_prior_fleet: !!priorFleet,
          queued, skipped,
          treasury_before: treasury0, treasury_after: treasury,
        },
      });

      await (supabase as any).from("ai_decision_log").insert({
        game_id: gameId,
        player_id: faction.id,
        turn_number: currentTurn,
        phase: "actions",
        summary: `enhance_offense → ${verb} "${fleetName}" at hub ${hub.system.system_name}; queued ${queued.length} ship(s) (₡${treasury0 - treasury})`,
        details_json: {
          plan_id: plan.id, slot: plan.slate_slot,
          hub_system_id: hub.system.system_id,
          fleet_id: targetFleetId,
          reused_prior_fleet: !!priorFleet,
          template_id: composition.template_id,
          queued_count: queued.length,
          skipped_count: skipped.length,
          treasury_before: treasury0, treasury_after: treasury,
        },
      });

    }

    // ---------------------------------------------------------------
    // 4. bolster_defense — draft garrison at the target system, or start
    //    one defense facility when the garrison is already at capacity.
    // ---------------------------------------------------------------
    for (const plan of defensePlans) {
      const faction = aiFactions.find((f) => f.id === plan.player_id);
      if (!faction) continue;
      const factionCode = faction.factions?.code_name || "";
      const skip = (reason: string, extra: any = {}) => {
        ctx.logs.push({
          game_id: gameId, turn_number: currentTurn, phase: "ai_actions",
          log_type: "ai_action_skip",
          message: `[${factionCode}] bolster_defense: ${reason}`,
          details_json: { plan_id: plan.id, ...extra },
        });
      };

      if (plan.target_kind !== "system" || !plan.target_id) {
        skip("no system target bound");
        continue;
      }
      const sysId = Number(plan.target_id);
      const sys = mapState.systems.get(sysId);
      if (!sys) { skip(`target system ${plan.target_id} not found`); continue; }
      if (!ownerMatchesFaction(sys.owner, factionCode)) {
        skip(`${sys.system_name} no longer owned`, { system_id: sysId, owner: sys.owner });
        continue;
      }

      const treasuryBefore = Number(faction.treasury) || 0;
      const decision = decideBolsterDefense(sys, facilityTypes, treasuryBefore);
      if (decision.total_cost <= 0) {
        skip(`${sys.system_name}: ${decision.reason}`, {
          system_id: sysId, treasury: treasuryBefore,
          cur: sys.current_ground_defenses, max: sys.max_ground_defenses,
        });
        continue;
      }

      let summary = "";
      if (decision.draft > 0) {
        mapState.systems.set(sysId, {
          ...sys,
          current_ground_defenses: (Number(sys.current_ground_defenses) || 0) + decision.draft,
        });
        summary = `drafted ${decision.draft} garrison at ${sys.system_name}`;
      } else if (decision.facility) {
        const turns = Math.max(1, Number(decision.facility.turns_to_build) || 1);
        mapState.systems.set(sysId, {
          ...sys,
          facilities_in_production: [
            ...((sys.facilities_in_production as any[]) || []),
            { facility_type_id: decision.facility.id, turns_remaining: turns },
          ],
        });
        summary = `started ${decision.facility.name} (${turns}T) at ${sys.system_name}`;
      }

      const treasuryAfter = treasuryBefore - decision.total_cost;
      await (supabase as any)
        .from("game_factions")
        .update({ treasury: treasuryAfter })
        .eq("id", faction.id);
      faction.treasury = treasuryAfter;

      ctx.logs.push({
        game_id: gameId, turn_number: currentTurn, phase: "ai_actions",
        log_type: "ai_action",
        message: `[${factionCode}] bolster_defense: ${summary}; treasury ${treasuryBefore} → ${treasuryAfter}`,
        details_json: {
          plan_id: plan.id, faction: factionCode, goal: "bolster_defense",
          system_id: sysId, system_name: sys.system_name,
          draft: decision.draft,
          facility_type_id: decision.facility?.id || null,
          facility_name: decision.facility?.name || null,
          cost: decision.total_cost,
          treasury_before: treasuryBefore, treasury_after: treasuryAfter,
        },
      });

      await (supabase as any).from("ai_decision_log").insert({
        game_id: gameId,
        player_id: faction.id,
        turn_number: currentTurn,
        phase: "actions",
        summary: `bolster_defense → ${summary} (₡${decision.total_cost})`,
        details_json: {
          plan_id: plan.id, slot: plan.slate_slot, system_id: sysId,
          draft: decision.draft,
          facility_type_id: decision.facility?.id || null,
          treasury_before: treasuryBefore, treasury_after: treasuryAfter,
        },
      });
    }
  },

};
