/**
 * Movement Phase
 *
 * Applies fleet_move and set_strategy orders. Movement itself is a stub for
 * now (the codebase does not yet have a fleet pathfinder); this phase records
 * the intent for the log so admins can see what was queued.
 *
 * set_strategy orders (special1/special2 role changes) are mirrored from the
 * fleets table — the player UI already wrote them — and logged here for audit.
 */
import type { Phase, TurnContext } from "../types";

export const movementPhase: Phase = {
  name: "movement",
  label: "Movement",
  async run(ctx: TurnContext) {
    const { supabase, gameId, currentTurn } = ctx;

    const moveOrders = ctx.orders.filter(o => o.order_type === "fleet_move");
    const strategyOrders = ctx.orders.filter(o => o.order_type === "set_strategy");

    for (const order of moveOrders) {
      const { fleet_id, from, to } = order.order_json || {};
      ctx.logs.push({
        game_id: gameId,
        turn_number: currentTurn,
        phase: "movement",
        log_type: "fleet_move",
        message: `Fleet ${String(fleet_id).slice(0, 8)} queued move ${JSON.stringify(from)} → ${JSON.stringify(to)} (not yet executed)`,
        details_json: order.order_json,
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
