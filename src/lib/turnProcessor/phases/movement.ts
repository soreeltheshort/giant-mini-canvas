/**
 * Movement Phase
 *
 * Applies fleet_move and set_strategy orders, plus auto-continues any fleet
 * that has a standing destination (set on a previous turn whose move didn't
 * reach its target).
 *
 * Design rules (Active Order = player intent, dest_* = fleet state):
 *   - A `fleet_move` order is a SINGLE-TURN player intent issued via the
 *     player UI. It costs 1 combat point at issuance.
 *   - The fleet's `dest_x/dest_y` is fleet STATE — a persistent waypoint.
 *     The movement phase sets it whenever a move doesn't reach its target
 *     in one turn, and clears it on arrival or when the player cancels.
 *   - On every turn the movement phase first checks for a fresh
 *     `fleet_move` order for the fleet (which OVERRIDES any prior waypoint),
 *     and otherwise continues toward the stored waypoint.
 *   - A continuation step does NOT insert a new `player_orders` row and
 *     does NOT consume combat capability — it's the carry-out of an order
 *     the player already paid for.
 *
 * Crippled ships move at HALF map_speed (round up, min 1). Fleet effective
 * speed is the slowest non-zero ship speed in the post-combat composition.
 */
import type { Phase, TurnContext } from "../types";
import type { MapFleet } from "@/lib/mapTypes";
import { offsetToCube, cubeDistance } from "@/lib/hexUtils";

/** Step one hex toward the destination using cube coordinates. */
function stepToward(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
): { x: number; y: number } {
  const [ax, ay, az] = offsetToCube(fromX, fromY);
  const [bx, by, bz] = offsetToCube(toX, toY);
  const dx = bx - ax;
  const dy = by - ay;
  const dz = bz - az;
  const adx = Math.abs(dx);
  const ady = Math.abs(dy);
  const adz = Math.abs(dz);
  let nx = ax, ny = ay, nz = az;
  if (adx >= ady && adx >= adz) {
    nx += Math.sign(dx);
    if (ady >= adz) ny += Math.sign(dy); else nz += Math.sign(dz);
  } else if (ady >= adx && ady >= adz) {
    ny += Math.sign(dy);
    if (adx >= adz) nx += Math.sign(dx); else nz += Math.sign(dz);
  } else {
    nz += Math.sign(dz);
    if (adx >= ady) nx += Math.sign(dx); else ny += Math.sign(dy);
  }
  const col = nx + (nz - (nz & 1)) / 2;
  const row = nz;
  return { x: col, y: row };
}

/** Compute a fleet's effective map speed from its current per-game roster. */
async function fleetEffectiveSpeed(ctx: TurnContext, fleet: MapFleet): Promise<number> {
  try {
    const { data: composition } = await (ctx.supabase as any)
      .from("game_fleet_ships")
      .select("ship_type_id, quantity, crippled")
      .eq("game_fleet_id", fleet.fleet_id);
    const typeIds = (composition || []).map((c: any) => c.ship_type_id).filter(Boolean);
    if (typeIds.length === 0) return 1;
    const { data: typeRows } = await (ctx.supabase as any)
      .from("ship_types")
      .select("id, map_speed")
      .in("id", typeIds);
    const speedById = new Map<string, number>();
    for (const t of (typeRows || [])) speedById.set(t.id, Number(t.map_speed) || 0);
    const speeds: number[] = [];
    for (const c of (composition || [])) {
      const raw = speedById.get(c.ship_type_id) || 0;
      if (raw <= 0) continue;
      const eff = c.crippled ? Math.max(1, Math.ceil(raw / 2)) : raw;
      speeds.push(eff);
    }
    return speeds.length > 0 ? Math.min(...speeds) : 1;
  } catch {
    return 1;
  }
}

interface MoveTask {
  fleet: MapFleet;
  destX: number;
  destY: number;
  /** "order" = fresh player intent this turn, "waypoint" = standing dest carried from a prior turn. */
  source: "order" | "waypoint";
}

export const movementPhase: Phase = {
  name: "movement",
  label: "Movement",
  async run(ctx: TurnContext) {
    const { supabase, gameId, currentTurn } = ctx;

    const moveOrders = ctx.orders.filter(o => o.order_type === "fleet_move");
    const strategyOrders = ctx.orders.filter(o => o.order_type === "set_strategy");

    // Build a queue of fleets to move. A fresh order overrides any stored
    // waypoint on the same fleet.
    const tasks: MoveTask[] = [];
    const orderedFleetIds = new Set<string>();

    for (const order of moveOrders) {
      const oj = order.order_json || {};
      const fleetId: string | undefined = oj.fleet_id;
      const destX: number | undefined =
        typeof oj.dest_x === "number" ? oj.dest_x : (typeof oj.to?.x === "number" ? oj.to.x : undefined);
      const destY: number | undefined =
        typeof oj.dest_y === "number" ? oj.dest_y : (typeof oj.to?.y === "number" ? oj.to.y : undefined);

      if (!fleetId || destX === undefined || destY === undefined) {
        ctx.logs.push({
          game_id: gameId, turn_number: currentTurn, phase: "movement",
          log_type: "fleet_move_invalid",
          message: `Invalid move order (missing fleet_id or destination): ${JSON.stringify(oj)}`,
          details_json: oj,
        });
        continue;
      }

      const fleet = ctx.mapState.fleets.find(f => f.fleet_id === fleetId);
      if (!fleet) {
        ctx.logs.push({
          game_id: gameId, turn_number: currentTurn, phase: "movement",
          log_type: "fleet_move_missing",
          message: `Move order references unknown fleet ${fleetId}`,
          details_json: oj,
        });
        continue;
      }

      tasks.push({ fleet, destX, destY, source: "order" });
      orderedFleetIds.add(fleetId);
    }

    // Standing waypoints — only when there's no fresh order for this fleet.
    for (const fleet of ctx.mapState.fleets) {
      if (orderedFleetIds.has(fleet.fleet_id)) continue;
      const dx = (fleet as any).dest_x;
      const dy = (fleet as any).dest_y;
      if (typeof dx !== "number" || typeof dy !== "number") continue;
      if (dx === fleet.hex_x && dy === fleet.hex_y) {
        // Already there — clean up stale waypoint.
        fleet.dest_x = null;
        fleet.dest_y = null;
        fleet.dest_set_turn = null;
        continue;
      }
      tasks.push({ fleet, destX: dx, destY: dy, source: "waypoint" });
    }

    for (const task of tasks) {
      const { fleet, destX, destY, source } = task;
      const effectiveSpeed = await fleetEffectiveSpeed(ctx, fleet);

      const [ax, ay, az] = offsetToCube(fleet.hex_x, fleet.hex_y);
      const [bx, by, bz] = offsetToCube(destX, destY);
      const totalDistance = cubeDistance(ax, ay, az, bx, by, bz);
      const stepsToTake = Math.min(effectiveSpeed, totalDistance);

      let curX = fleet.hex_x;
      let curY = fleet.hex_y;
      for (let i = 0; i < stepsToTake; i++) {
        const next = stepToward(curX, curY, destX, destY);
        curX = next.x;
        curY = next.y;
      }

      const reachedDestination = curX === destX && curY === destY;
      const fromX = fleet.hex_x;
      const fromY = fleet.hex_y;

      // Persist position + waypoint atomically to game_fleets and to the
      // in-memory MapFleet (which is what gets serialized into map_data_json).
      const update: Record<string, any> = {};
      if (curX !== fleet.hex_x) update.hex_x = curX;
      if (curY !== fleet.hex_y) update.hex_y = curY;
      if (reachedDestination) {
        update.dest_x = null;
        update.dest_y = null;
        update.dest_set_turn = null;
      } else {
        update.dest_x = destX;
        update.dest_y = destY;
        if (source === "order") update.dest_set_turn = currentTurn;
      }
      await (supabase as any)
        .from("game_fleets")
        .update(update)
        .eq("fleet_id", fleet.source_fleet_id)
        .eq("game_id", gameId);
      fleet.hex_x = curX;
      fleet.hex_y = curY;

      if (reachedDestination) {
        fleet.dest_x = null;
        fleet.dest_y = null;
        fleet.dest_set_turn = null;
      } else {
        fleet.dest_x = destX;
        fleet.dest_y = destY;
        if (source === "order") fleet.dest_set_turn = currentTurn;
      }

      ctx.logs.push({
        game_id: gameId,
        turn_number: currentTurn,
        phase: "movement",
        log_type: source === "order" ? "fleet_move" : "fleet_move_continued",
        message: reachedDestination
          ? `Fleet ${fleet.fleet_name || String(fleet.fleet_id).slice(0, 8)} arrived at (${destX}, ${destY}).`
          : `Fleet ${fleet.fleet_name || String(fleet.fleet_id).slice(0, 8)} ${source === "waypoint" ? "continued" : "moved"} ${stepsToTake} hex(es) toward (${destX}, ${destY}); now at (${curX}, ${curY}). Waypoint persists.`,
        details_json: {
          fleet_id: fleet.fleet_id,
          from: { x: fromX, y: fromY },
          dest: { x: destX, y: destY },
          steps: stepsToTake,
          map_speed: effectiveSpeed,
          reached: reachedDestination,
          source,
        },
      });
    }

    for (const order of strategyOrders) {
      const { fleet_id, special1_role, special2_role } = order.order_json || {};
      if (!fleet_id) continue;
      const update: any = {};
      if (special1_role) update.special1_role = special1_role;
      if (special2_role) update.special2_role = special2_role;
      if (Object.keys(update).length > 0) {
        await (supabase as any).from("fleets").update(update).eq("id", fleet_id);
      }
      ctx.logs.push({
        game_id: gameId,
        turn_number: currentTurn,
        phase: "movement",
        log_type: "strategy_set",
        message: `Fleet ${String(fleet_id).slice(0, 8)} strategies: ${special1_role || "—"} / ${special2_role || "—"}`,
        details_json: order.order_json,
      });
    }

    if (tasks.length === 0 && strategyOrders.length === 0) {
      ctx.logs.push({
        game_id: gameId, turn_number: currentTurn, phase: "movement",
        log_type: "noop", message: "No movement or strategy orders this turn.",
      });
    }
  },
};
