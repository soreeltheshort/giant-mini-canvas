/**
 * Turn Processor — phase registry and runner.
 *
 * Public API:
 *   PHASE_ORDER       — array of phases in execution order (configurable here)
 *   runTurnProcessor  — loads orders + players, runs every phase, flushes logs
 *
 * Each phase is a self-contained module. To reorder phases, edit PHASE_ORDER.
 * To add a phase, create src/lib/turnProcessor/phases/<name>.ts and add it
 * here. Phases never write logs directly — they push into ctx.logs and the
 * runner does a single bulk insert at the end.
 */
import { SupabaseClient } from "@supabase/supabase-js";
import type { MapState } from "@/lib/mapTypes";
import type { DbFacilityType } from "@/hooks/useFacilityTypes";
import type { ShipTypeForUpkeep } from "@/lib/turnEngine";
import type { Phase, TurnContext, PlayerCtx, ConditionalOrder } from "./types";

import { economyPhase } from "./phases/economy";
import { movementPhase } from "./phases/movement";
import { visibilityPhase } from "./phases/visibility";
import { combatPhase } from "./phases/combat";
import { groundCombatPhase } from "./phases/groundCombat";
import { shipProductionPhase } from "./phases/shipProduction";

// Order matters:
//   - economy: tribute, upkeep, repairs, builds.
//   - ship_production: advance per-system ship build queues + virtual transit.
//   - combat: fleet-vs-fleet engagements.
//   - movement: fleets advance toward destinations.
//   - ground_combat: any fleet that ended movement on an enemy/unowned planet
//     with current_ground_invasion > 0 invades. Must run AFTER movement (so
//     positions are final) and BEFORE visibility (so new ownership propagates).
//   - visibility: scout/intel updates pick up the new owner.
export const PHASE_ORDER: Phase[] = [
  economyPhase,
  shipProductionPhase,
  combatPhase,
  movementPhase,
  groundCombatPhase,
  visibilityPhase,
];

export interface RunTurnArgs {
  supabase: SupabaseClient;
  gameId: string;
  currentTurn: number;
  mapState: MapState;
  facilityTypes: DbFacilityType[];
  shipTypes: ShipTypeForUpkeep[];
}

export interface RunTurnResult {
  mapState: MapState;
  playerEcon: Map<number, { tribute: number; maintenance: number }>;
  logsInserted: number;
}

export async function runTurnProcessor(args: RunTurnArgs): Promise<RunTurnResult> {
  const { supabase, gameId, currentTurn, mapState, facilityTypes, shipTypes } = args;

  // Load all conditional orders for this turn + players for the game
  const [{ data: ordersRaw }, { data: playersRaw }] = await Promise.all([
    (supabase as any).from("player_orders").select("*").eq("game_id", gameId).eq("turn_number", currentTurn),
    (supabase as any).from("game_players")
      .select("id, user_id, player_slot, treasury, admin_capability, combat_capability, visible_system_ids")
      .eq("game_id", gameId),
  ]);

  const orders: ConditionalOrder[] = ordersRaw || [];
  const players: PlayerCtx[] = (playersRaw || []).map((p: any) => ({
    id: p.id,
    user_id: p.user_id,
    player_slot: p.player_slot,
    treasury: p.treasury || 0,
    admin_capability: p.admin_capability || 3,
    combat_capability: p.combat_capability || 3,
    visible_system_ids: Array.isArray(p.visible_system_ids) ? p.visible_system_ids : [],
  }));

  const ctx: TurnContext = {
    supabase,
    gameId,
    currentTurn,
    nextTurn: currentTurn + 1,
    mapState,
    facilityTypes,
    shipTypes,
    players,
    orders,
    playerEcon: new Map(),
    logs: [],
  };

  // Phase header log (per turn)
  ctx.logs.push({
    game_id: gameId,
    turn_number: currentTurn,
    phase: "summary",
    log_type: "turn_started",
    message: `Processing turn ${currentTurn} — ${orders.length} order(s), ${players.length} player(s).`,
  });

  for (const phase of PHASE_ORDER) {
    try {
      await phase.run(ctx);
    } catch (err: any) {
      ctx.logs.push({
        game_id: gameId,
        turn_number: currentTurn,
        phase: phase.name,
        log_type: "phase_error",
        message: `Phase ${phase.label} failed: ${err.message || err}`,
        details_json: { error: String(err) },
      });
    }
  }

  // Bulk insert all logs (single round trip)
  if (ctx.logs.length > 0) {
    await (supabase as any).from("game_logs").insert(
      ctx.logs.map(l => ({
        game_id: l.game_id,
        turn_number: l.turn_number,
        phase: l.phase,
        log_type: l.log_type,
        message: l.message,
        details_json: l.details_json || {},
      }))
    );
  }

  return { mapState: ctx.mapState, playerEcon: ctx.playerEcon, logsInserted: ctx.logs.length };
}

export type { Phase, TurnContext, PlayerCtx, ConditionalOrder } from "./types";
