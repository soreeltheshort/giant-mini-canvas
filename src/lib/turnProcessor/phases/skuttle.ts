/**
 * Skuttle Phase
 *
 * Any ships assigned to the "Skuttle" tactical_group are permanently removed
 * from the game before the movement phase runs. This lets a player pre-flag
 * ships they want to decommission (e.g. obsolete hulls draining maintenance)
 * without needing an explicit order per ship.
 *
 * Combat parity: if a battle occurred earlier in the same turn, Skuttle ships
 * were treated as Rear via a normalization in `battleSetup.ts`. That happens
 * BEFORE this phase, so survivors of that Rear treatment are the rows removed
 * here.
 *
 * Runs AFTER combat (so ships still participate in the current turn's fight
 * as Rear) and BEFORE movement (so they never advance).
 */
import type { Phase, TurnContext } from "../types";

export const skuttlePhase: Phase = {
  name: "movement",
  label: "Skuttle",
  async run(ctx: TurnContext) {
    const { supabase, gameId, currentTurn } = ctx;

    // Find every Skuttle-group ship in this game (joined via game_fleets).
    const { data: fleets } = await (supabase as any)
      .from("game_fleets")
      .select("id, fleet_name")
      .eq("game_id", gameId);
    const fleetById = new Map<string, string>(
      (fleets || []).map((f: any) => [f.id, f.fleet_name as string]),
    );
    if (fleetById.size === 0) return;

    const { data: rows } = await (supabase as any)
      .from("game_fleet_ships")
      .select("id, game_fleet_id, ship_type_id, quantity")
      .in("game_fleet_id", Array.from(fleetById.keys()))
      .eq("tactical_group", "Skuttle");

    const skuttled: any[] = rows || [];
    if (skuttled.length === 0) return;

    // Group deletions by fleet for a clean log entry per fleet.
    const perFleet = new Map<string, { count: number; rowIds: string[] }>();
    for (const r of skuttled) {
      const entry = perFleet.get(r.game_fleet_id) ?? { count: 0, rowIds: [] };
      entry.count += Number(r.quantity) || 1;
      entry.rowIds.push(r.id);
      perFleet.set(r.game_fleet_id, entry);
    }

    // Delete all Skuttle rows in one batch.
    const allIds = skuttled.map((r: any) => r.id);
    const { error } = await (supabase as any)
      .from("game_fleet_ships")
      .delete()
      .in("id", allIds);
    if (error) {
      ctx.logs.push({
        game_id: gameId, turn_number: currentTurn, phase: "movement",
        log_type: "skuttle_error",
        message: `Skuttle removal failed: ${error.message}`,
        details_json: { fleet_row_ids: allIds },
      });
      return;
    }

    for (const [fleetId, info] of perFleet) {
      ctx.logs.push({
        game_id: gameId, turn_number: currentTurn, phase: "movement",
        log_type: "skuttle_removed",
        message: `${fleetById.get(fleetId) || "Fleet"}: scuttled ${info.count} ship${info.count === 1 ? "" : "s"}.`,
        details_json: { fleet_id: fleetId, ships_removed: info.count },
      });
    }
  },
};
