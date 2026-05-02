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
    /**
     * Auto-derived "intercept" moves: a fleet_attack order targeting a planet
     * (or a fleet whose current hex we know) implicitly moves the attacker
     * toward that hex, capped at floor(map_speed/2). Players can issue an
     * attack on any visible hex within half-speed range; the engine closes
     * the distance here so ground combat can resolve at the target hex.
     * Skipped when the same fleet already has an explicit fleet_move order
     * (explicit movement always wins).
     */
    const explicitMoveFleetIds = new Set<string>(
      moveOrders.map(o => (o.order_json as any)?.fleet_id).filter(Boolean),
    );
    const autoMoveOrders: Array<{ order_json: any; auto: true }> = [];
    for (const o of ctx.orders) {
      if (o.order_type !== "other") continue;
      const oj = (o.order_json || {}) as any;
      if (oj.kind !== "fleet_attack") continue;
      const fleetId: string | undefined = oj.fleet_id;
      if (!fleetId || explicitMoveFleetIds.has(fleetId)) continue;
      const attacker = ctx.mapState.fleets.find(f => f.fleet_id === fleetId);
      if (!attacker) continue;

      let destHex: { x: number; y: number } | null = null;
      if (oj.target_system_id != null) {
        const sys = ctx.mapState.systems.get(Number(oj.target_system_id));
        if (sys) {
          const h = Array.from(ctx.mapState.hexes.values()).find(hh => hh.hex_id === sys.hex_id);
          if (h) destHex = { x: h.x, y: h.y };
        }
      } else if (oj.target_fleet_id) {
        const tgt = ctx.mapState.fleets.find(f => f.fleet_id === oj.target_fleet_id);
        if (tgt) destHex = { x: tgt.hex_x, y: tgt.hex_y };
      }
      if (!destHex) continue;
      if (destHex.x === attacker.hex_x && destHex.y === attacker.hex_y) continue;
      autoMoveOrders.push({
        order_json: { fleet_id: fleetId, dest_x: destHex.x, dest_y: destHex.y, auto_intercept: true },
        auto: true,
      });
    }

    for (const order of [...moveOrders, ...autoMoveOrders] as any[]) {
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
      // Read from per-game roster (`game_fleet_ships`) so we account for ships
      // already lost in combat — not the player's pristine saved fleet.
      // Crippled ships move at HALF map_speed (round up, min 1).
      let effectiveSpeed = 1;
      try {
        const { data: composition } = await (supabase as any)
          .from("game_fleet_ships")
          .select("ship_type_id, quantity, crippled")
          .eq("game_fleet_id", fleet.fleet_id);
        const typeIds = (composition || []).map((c: any) => c.ship_type_id).filter(Boolean);
        if (typeIds.length > 0) {
          const { data: typeRows } = await (supabase as any)
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
          if (speeds.length > 0) effectiveSpeed = Math.min(...speeds);
        }
      } catch {
        // fall through with default speed
      }

      // Auto-intercept moves (derived from fleet_attack orders) are capped at
      // floor(map_speed / 2) — players can only attack hexes within half their
      // movement range.
      const isAutoIntercept = !!oj.auto_intercept;
      const movementBudget = isAutoIntercept
        ? Math.floor(effectiveSpeed / 2)
        : effectiveSpeed;

      const [ax, ay, az] = offsetToCube(fleet.hex_x, fleet.hex_y);
      const [bx, by, bz] = offsetToCube(destX, destY);
      const totalDistance = cubeDistance(ax, ay, az, bx, by, bz);
      const stepsToTake = Math.min(movementBudget, totalDistance);

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

      const fname = fleet.fleet_name || String(fleetId).slice(0, 8);
      const messageBase = isAutoIntercept
        ? (reachedDestination
            ? `Fleet ${fname} closed on attack target at (${destX}, ${destY}).`
            : `Fleet ${fname} advanced ${stepsToTake} hex(es) toward attack target (${destX}, ${destY}); now at (${curX}, ${curY}).`)
        : (reachedDestination
            ? `Fleet ${fname} arrived at (${destX}, ${destY}).`
            : `Fleet ${fname} moved ${stepsToTake} hex(es) toward (${destX}, ${destY}); now at (${curX}, ${curY}).`);

      ctx.logs.push({
        game_id: gameId,
        turn_number: currentTurn,
        phase: "movement",
        log_type: isAutoIntercept ? "fleet_intercept_move" : "fleet_move",
        message: messageBase,
        details_json: {
          fleet_id: fleetId,
          from: { x: fleet.hex_x, y: fleet.hex_y },
          dest: { x: destX, y: destY },
          steps: stepsToTake,
          map_speed: effectiveSpeed,
          movement_budget: movementBudget,
          auto_intercept: isAutoIntercept,
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

    if (moveOrders.length === 0 && strategyOrders.length === 0 && autoMoveOrders.length === 0) {
      ctx.logs.push({
        game_id: gameId, turn_number: currentTurn, phase: "movement",
        log_type: "noop", message: "No movement or strategy orders this turn.",
      });
    }
  },
};
