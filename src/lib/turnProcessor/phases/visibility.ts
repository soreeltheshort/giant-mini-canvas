/**
 * Visibility Phase
 *
 * Recomputes which systems each player can see. Currently uses the same baseline
 * rule used at game start: every Core system + every system in the player's own
 * province is visible. Per-player sensor-based visibility is layered on top by
 * the live PlayerGame view (useComputedVisibility) so we keep this phase
 * intentionally simple here.
 *
 * Also writes/refreshes player_system_intel rows for every currently-visible
 * system, so the player UI can render "last known state" for systems they no
 * longer see (classic 4X fog-of-war memory). Rows for systems that drop out
 * of visibility are intentionally LEFT IN PLACE — that is the memory.
 */
import type { Phase, TurnContext } from "../types";
import { buildSystemSnapshot } from "@/lib/systemIntel";

export const visibilityPhase: Phase = {
  name: "visibility",
  label: "Visibility",
  async run(ctx: TurnContext) {
    const { supabase, gameId, mapState, currentTurn, players } = ctx;

    // hex_id → classification
    const hexClassById = new Map<number, string>();
    for (const h of mapState.hexes.values()) hexClassById.set(h.hex_id, h.classification);

    const baselineIds: number[] = [];
    const baselineSystems = [];
    for (const sys of mapState.systems.values()) {
      const cls = (hexClassById.get(sys.hex_id) || sys.classification || "").toUpperCase();
      if (cls === "CORE" || cls === "MARCHES" || cls.startsWith("PROVINCE_")) {
        baselineIds.push(sys.system_id);
        baselineSystems.push(sys);
      }
    }

    for (const gp of players) {
      await (supabase as any).from("game_players")
        .update({ visible_system_ids: baselineIds }).eq("id", gp.id);
    }

    // Refresh fog-of-war memory: upsert intel for every currently-visible system.
    // upsert on (observer_player_id, system_id) updates last_seen_turn + snapshot.
    const intelRows: any[] = [];
    for (const gp of players) {
      for (const sys of baselineSystems) {
        intelRows.push({
          game_id: gameId,
          observer_player_id: gp.id,
          system_id: sys.system_id,
          last_seen_turn: currentTurn,
          snapshot_json: buildSystemSnapshot(sys),
        });
      }
    }
    if (intelRows.length > 0) {
      // Chunk to keep payloads reasonable.
      const CHUNK = 500;
      for (let i = 0; i < intelRows.length; i += CHUNK) {
        await (supabase as any)
          .from("player_system_intel")
          .upsert(intelRows.slice(i, i + CHUNK), { onConflict: "observer_player_id,system_id" });
      }
    }

    ctx.logs.push({
      game_id: gameId,
      turn_number: currentTurn,
      phase: "visibility",
      log_type: "visibility_synced",
      message: `Visibility refreshed: ${baselineIds.length} systems visible to ${players.length} player(s); intel snapshots updated.`,
      details_json: { count: baselineIds.length, players: players.length, intel_rows: intelRows.length },
    });
  },
};
