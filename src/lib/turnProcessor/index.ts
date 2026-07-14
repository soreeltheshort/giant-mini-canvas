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
import { PerfTimer, type PerfEntry } from "./perf";

import { economyPhase } from "./phases/economy";
import { movementPhase } from "./phases/movement";
import { scuttlePhase } from "./phases/scuttle";
import { visibilityPhase } from "./phases/visibility";
import { combatPhase } from "./phases/combat";
import { groundCombatPhase } from "./phases/groundCombat";
import { shipProductionPhase } from "./phases/shipProduction";
import { transferShipsPhase } from "./phases/transferShips";
import { infectIntelLeechPhase } from "./phases/infectIntelLeech";
import { threatAssessmentPhase } from "./phases/threatAssessment";
import { seedFactionPlayers } from "@/lib/gameLifecycle";

// Order matters:
//   - economy: tribute, upkeep, repairs, builds.
//   - ship_production: advance per-system ship build queues + virtual transit.
//   - combat: fleet-vs-fleet engagements.
//   - movement: fleets advance toward destinations.
//   - transfer_ships: redistribute ships between co-located friendly fleets.
//   - ground_combat: any fleet that ended movement on an enemy/unowned planet
//     with current_ground_invasion > 0 invades. Must run AFTER movement (so
//     positions are final) and BEFORE visibility (so new ownership propagates).
//   - infect_intel_leech: INFECT factions that survived combat absorb the
//     loser's full intel. Must run AFTER combat and BEFORE visibility (so
//     newly granted systems get fresh snapshots).
//   - visibility: scout/intel updates pick up the new owner.
export const PHASE_ORDER: Phase[] = [
  economyPhase,
  shipProductionPhase,
  combatPhase,
  scuttlePhase,
  movementPhase,
  transferShipsPhase,
  groundCombatPhase,
  infectIntelLeechPhase,
  visibilityPhase,
  threatAssessmentPhase,
];


export interface RunTurnArgs {
  supabase: SupabaseClient;
  gameId: string;
  currentTurn: number;
  mapState: MapState;
  facilityTypes: DbFacilityType[];
  shipTypes: ShipTypeForUpkeep[];
  /** Admin-only perf instrumentation. Default false — regular players pay no overhead. */
  enablePerf?: boolean;
}

export interface RunTurnResult {
  mapState: MapState;
  /**
   * Per-faction econ deltas.
   * Keys: `slot:N` for province players, `faction:<UUID>` for AI/neutral.
   * Use rowEconKey from ./ownerKey to look up a game_factions row.
   */
  playerEcon: Map<string, { tribute: number; maintenance: number }>;
  logsInserted: number;
  /** Perf report entries (only populated when enablePerf=true). */
  perf?: Array<PerfEntry & { pct: number }>;
  perfTotalMs?: number;
}

export async function runTurnProcessor(args: RunTurnArgs): Promise<RunTurnResult> {
  const { supabase, gameId, currentTurn, mapState, facilityTypes, shipTypes, enablePerf } = args;
  const perf = new PerfTimer(!!enablePerf);

  // Self-heal: ensure every AI faction (and every map-owning faction) has a
  // game_players row before we load players. Idempotent.
  await perf.time("seedFactionPlayers", async () => {
    try { await seedFactionPlayers(supabase, gameId, mapState); } catch (e) { console.warn("[turnProcessor] seedFactionPlayers failed", e); }
  });

  // Load orders, players, and faction catalog (for owner→faction id mapping).
  const [{ data: ordersRaw }, { data: playersRaw }, { data: factionsRaw }] = await perf.time("load.orders+players+factions", () => Promise.all([
    (supabase as any).from("player_orders").select("*").eq("game_id", gameId).eq("turn_number", currentTurn),
    (supabase as any).from("game_factions")
      .select("id, user_id, player_slot, faction_id, treasury, admin_capability, combat_capability, visible_system_ids, scouted_hex_ids")
      .eq("game_id", gameId),
    (supabase as any).from("factions").select("id, name, code_name, infect"),
  ]));

  const orders: ConditionalOrder[] = ordersRaw || [];
  const players: PlayerCtx[] = (playersRaw || []).map((p: any) => ({
    id: p.id,
    user_id: p.user_id,
    player_slot: p.player_slot,
    faction_id: p.faction_id,
    treasury: p.treasury || 0,
    admin_capability: p.admin_capability || 3,
    combat_capability: p.combat_capability || 3,
    visible_system_ids: Array.isArray(p.visible_system_ids) ? p.visible_system_ids : [],
    scouted_hex_ids: Array.isArray(p.scouted_hex_ids) ? p.scouted_hex_ids : [],
  }));
  const factions = (factionsRaw || []) as Array<{ id: string; name: string; code_name: string | null; infect?: boolean }>;

  const ctx: TurnContext = {
    supabase,
    gameId,
    currentTurn,
    nextTurn: currentTurn + 1,
    mapState,
    facilityTypes,
    shipTypes,
    players,
    factions,
    orders,
    playerEcon: new Map(),
    logs: [],
    perf,
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
    await perf.time(`phase.${phase.name}`, async () => {
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
    });
  }

  // Bulk insert all logs (single round trip)
  await perf.time("logs.bulkInsert", async () => {
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
  });

  const perfReport = enablePerf ? perf.report() : undefined;
  const perfTotalMs = enablePerf ? Math.round(perf.totalMs()) : undefined;
  if (enablePerf) perf.logTable(`runTurnProcessor · turn ${currentTurn}`);

  return {
    mapState: ctx.mapState,
    playerEcon: ctx.playerEcon,
    logsInserted: ctx.logs.length,
    perf: perfReport,
    perfTotalMs,
  };
}

export type { Phase, TurnContext, PlayerCtx, ConditionalOrder } from "./types";
