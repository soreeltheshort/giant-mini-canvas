/**
 * Movement Phase
 *
 * Applies fleet_move and set_strategy orders.
 *
 * For fleet_move: orders carry { fleet_id, dest_x, dest_y } as written by the
 * player UI in PlayerGame.tsx. The destination is clamped to the fleet's
 * effective map_speed (slowest ship in the composition; defaults to 1 hex
 * per turn if no speed data is available). The fleet's position is updated
 * both in the persisted game_fleets row and in ctx.mapState so downstream
 * phases (visibility, combat) operate on post-movement state.
 *
 * For set_strategy: special1/special2 role changes are mirrored to fleets
 * for the audit log; the player UI already wrote them.
 */
import type { Phase, TurnContext } from "../types";
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
  // Convert cube → odd-r offset
  const col = nx + (nz - (nz & 1)) / 2;
  const row = nz;
  return { x: col, y: row };
}

export const movementPhase: Phase = {
  name: "movement",
  label: "Movement",
  async run(ctx: TurnContext) {
    const { supabase, gameId, currentTurn } = ctx;

    const moveOrders = ctx.orders.filter(o => o.order_type === "fleet_move");
    const strategyOrders = ctx.orders.filter(o => o.order_type === "set_strategy");

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

      // Determine effective map_speed: slowest non-zero map_speed in the fleet.
      // map_speed isn't on ShipTypeForUpkeep, so look it up directly from ship_types.
      let effectiveSpeed = 1;
      try {
        const { data: composition } = await (supabase as any)
          .from("fleet_ships")
          .select("ship_type_id, quantity")
          .eq("fleet_id", fleet.source_fleet_id);
        const typeIds = (composition || []).map((c: any) => c.ship_type_id).filter(Boolean);
        if (typeIds.length > 0) {
          const { data: typeRows } = await (supabase as any)
            .from("ship_types")
            .select("id, map_speed")
            .in("id", typeIds);
          const speeds = (typeRows || [])
            .map((t: any) => Number(t.map_speed) || 0)
            .filter((s: number) => s > 0);
          if (speeds.length > 0) effectiveSpeed = Math.min(...speeds);
        }
      } catch {
        // fall through with default speed
      }

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

      // Persist + mutate in-memory state
      if (curX !== fleet.hex_x || curY !== fleet.hex_y) {
        await (supabase as any)
          .from("game_fleets")
          .update({ hex_x: curX, hex_y: curY })
          .eq("fleet_id", fleet.source_fleet_id)
          .eq("game_id", gameId);
        fleet.hex_x = curX;
        fleet.hex_y = curY;
      }

      ctx.logs.push({
        game_id: gameId,
        turn_number: currentTurn,
        phase: "movement",
        log_type: "fleet_move",
        message: reachedDestination
          ? `Fleet ${fleet.fleet_name || String(fleetId).slice(0, 8)} arrived at (${destX}, ${destY}).`
          : `Fleet ${fleet.fleet_name || String(fleetId).slice(0, 8)} moved ${stepsToTake} hex(es) toward (${destX}, ${destY}); now at (${curX}, ${curY}).`,
        details_json: {
          fleet_id: fleetId,
          from: { x: fleet.hex_x, y: fleet.hex_y },
          dest: { x: destX, y: destY },
          steps: stepsToTake,
          map_speed: effectiveSpeed,
          reached: reachedDestination,
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

    if (moveOrders.length === 0 && strategyOrders.length === 0) {
      ctx.logs.push({
        game_id: gameId, turn_number: currentTurn, phase: "movement",
        log_type: "noop", message: "No movement or strategy orders this turn.",
      });
    }
  },
};
