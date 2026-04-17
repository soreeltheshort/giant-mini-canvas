/**
 * Visibility Phase
 *
 * Recomputes which systems each player can see. Currently uses the same baseline
 * rule used at game start: every Core system + every system in the player's own
 * province is visible. Per-player sensor-based visibility is layered on top by
 * the live PlayerGame view (useComputedVisibility) so we keep this phase
 * intentionally simple here.
 */
import type { Phase, TurnContext } from "../types";

export const visibilityPhase: Phase = {
  name: "visibility",
  label: "Visibility",
  async run(ctx: TurnContext) {
    const { supabase, gameId, mapState, currentTurn, players } = ctx;

    // hex_id → classification
    const hexClassById = new Map<number, string>();
    for (const h of mapState.hexes.values()) hexClassById.set(h.hex_id, h.classification);

    const baselineIds: number[] = [];
    for (const sys of mapState.systems.values()) {
      const cls = (hexClassById.get(sys.hex_id) || sys.classification || "").toUpperCase();
      if (cls === "CORE" || cls.startsWith("PROVINCE_")) baselineIds.push(sys.system_id);
    }

    for (const gp of players) {
      await (supabase as any).from("game_players")
        .update({ visible_system_ids: baselineIds }).eq("id", gp.id);
    }

    ctx.logs.push({
      game_id: gameId,
      turn_number: currentTurn,
      phase: "visibility",
      log_type: "visibility_synced",
      message: `Visibility refreshed: ${baselineIds.length} systems visible to ${players.length} player(s).`,
      details_json: { count: baselineIds.length, players: players.length },
    });
  },
};
