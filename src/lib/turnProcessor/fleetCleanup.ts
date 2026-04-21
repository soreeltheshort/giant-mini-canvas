/**
 * Fleet Cleanup
 *
 * Centralized helper for fully removing a fleet from a running game when it
 * has been destroyed (e.g. wiped in combat, scuttled, etc.).
 *
 * Currently this:
 *   1. Deletes the game_fleets row that places the fleet on the map.
 *   2. Removes the matching entry from ctx.mapState.fleets so subsequent
 *      phases in the same turn (visibility, further combat, etc.) do not
 *      see the dead fleet.
 *
 * STUB — future cleanup work that should live here (do NOT implement until
 * the corresponding feature is wired up):
 *   - Cancel/expire any outstanding player_orders that reference the fleet
 *     (fleet_move, fleet_attack, fleet_composition_change, etc.) for the
 *     current turn so the order processor does not retry them.
 *   - Prune player_fleet_intel rows for the destroyed fleet so observers no
 *     longer see ghost sightings of a fleet that no longer exists. (May
 *     instead want to mark intel as "last_seen" — TBD by design.)
 *   - Clear any standing orders / readiness state on the underlying
 *     fleets row, OR delete the source fleet entirely if game design says
 *     destroyed fleets are gone for good (vs. returning to the player's
 *     fleet roster for rebuilding).
 *   - Emit a dedicated "fleet_destroyed" game_log entry separate from the
 *     battle_resolved log, so non-combat destruction paths share format.
 *   - Notify any AI/automation hooks that the fleet no longer exists.
 *
 * Keep this function the single entry point for fleet removal so future
 * cleanup steps only need to be added in one place.
 */
import type { TurnContext, PhaseName } from "./types";

export interface DestroyFleetArgs {
  ctx: TurnContext;
  /** game_fleets.id (the map placement row id) — used only for logging. */
  gameFleetId: string;
  /** fleets.id (the underlying source fleet) — used for the DB delete. */
  sourceFleetId: string;
  /** Human-readable name for logs. */
  fleetName: string;
  /** Why the fleet is being removed (e.g. "combat_wiped"). */
  reason: string;
  /** Phase that triggered the destruction (used for log attribution). */
  phase?: PhaseName;
}

export async function destroyFleet(args: DestroyFleetArgs): Promise<void> {
  const { ctx, gameFleetId, sourceFleetId, fleetName, reason } = args;
  const { supabase, gameId, currentTurn } = ctx;

  // 1. Remove the fleet's placement on the map.
  const { error: delErr } = await (supabase as any)
    .from("game_fleets")
    .delete()
    .eq("game_id", gameId)
    .eq("fleet_id", sourceFleetId);

  if (delErr) {
    ctx.logs.push({
      game_id: gameId,
      turn_number: currentTurn,
      phase,
      log_type: "fleet_destroy_failed",
      message: `Failed to remove destroyed fleet ${fleetName}: ${delErr.message || delErr}`,
      details_json: { game_fleet_id: gameFleetId, source_fleet_id: sourceFleetId, reason },
    });
    return;
  }

  // 2. Prune from in-memory map state so later phases ignore it.
  const idx = ctx.mapState.fleets.findIndex(
    (f) => f.fleet_id === gameFleetId || f.source_fleet_id === sourceFleetId,
  );
  if (idx >= 0) ctx.mapState.fleets.splice(idx, 1);

  // 3. STUB: future cleanup steps go here. See file header for the list.
  //    Intentionally left as a no-op for now.

  ctx.logs.push({
    game_id: gameId,
    turn_number: currentTurn,
    phase,
    log_type: "fleet_destroyed",
    message: `Fleet ${fleetName} removed from the map (${reason}).`,
    details_json: { game_fleet_id: gameFleetId, source_fleet_id: sourceFleetId, reason },
  });
}
