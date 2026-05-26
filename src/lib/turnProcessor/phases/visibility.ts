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

    // hex_id → classification (used as a fallback only)
    const hexClassById = new Map<number, string>();
    for (const h of mapState.hexes.values()) hexClassById.set(h.hex_id, h.classification);

    // A system is "ever-seen" baseline if EITHER the system's own classification
    // OR the hex it sits on is Core, an Explored March, or a Province.
    // Some maps tag the system with `classification: "MARCHES"` even though the
    // underlying hex is still `UNEXPLORED_MARCHES`, so we accept either source.
    const baselineIds: number[] = [];
    const baselineSystems = [];
    for (const sys of mapState.systems.values()) {
      const sysCls = (sys.classification || "").toUpperCase();
      const hexCls = (hexClassById.get(sys.hex_id) || "").toUpperCase();
      const isBaseline = (cls: string) =>
        cls === "CORE" || cls === "MARCHES" || cls.startsWith("PROVINCE_");
      if (isBaseline(sysCls) || isBaseline(hexCls)) {
        baselineIds.push(sys.system_id);
        baselineSystems.push(sys);
      }
    }

    // Merge baseline with each player's existing "ever seen" memory rather than
    // overwriting it. Otherwise systems discovered via sensor scan (e.g. a fleet
    // moving into the marches) get forgotten on turn rollover.
    for (const gp of players) {
      const prior = Array.isArray(gp.visible_system_ids) ? gp.visible_system_ids as number[] : [];
      const merged = Array.from(new Set<number>([...prior, ...baselineIds]));
      await (supabase as any).from("game_factions")
        .update({ visible_system_ids: merged }).eq("id", gp.id);
    }

    // Refresh fog-of-war memory: upsert intel for every system the player can
    // currently see. This includes baseline systems (Core/Provinces/Marches) AND
    // any extra systems they have ever scanned (stored in visible_system_ids
    // after the merge above — e.g. fleets that pushed sensors into the marches).
    // Without this, a system seen via a sensor sweep gets forgotten the moment
    // the fleet moves away because no snapshot was ever written.
    const systemById = new Map<number, typeof baselineSystems[number]>();
    for (const sys of mapState.systems.values()) systemById.set(sys.system_id, sys);

    const intelRows: any[] = [];
    for (const gp of players) {
      const prior = Array.isArray(gp.visible_system_ids) ? gp.visible_system_ids as number[] : [];
      const fullVisible = new Set<number>([...prior, ...baselineIds]);
      for (const sid of fullVisible) {
        const sys = systemById.get(sid);
        if (!sys) continue;
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
