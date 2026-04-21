/**
 * Materialize fleets from a game's map JSON into rows in the `game_fleets`
 * table. The `AFTER INSERT` trigger `trg_game_fleets_snapshot_ships` then
 * copies the source fleet's composition into `game_fleet_ships`, giving the
 * game its own per-game roster.
 *
 * The map JSON's `fleet_id` (originally a synthetic `mf-...` id from the map
 * editor) is rewritten to the new `game_fleets.id` UUID so that downstream
 * lookups (FleetDetailContent, composition editor) can query
 * `game_fleet_ships` by `game_fleet_id` directly.
 *
 * Idempotent: fleets that already have a UUID `fleet_id` AND a matching
 * `game_fleets` row are skipped.
 */
import { supabase } from "@/integrations/supabase/client";
import { MapState, MapFleet } from "@/lib/mapTypes";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function materializeGameFleets(
  gameId: string,
  mapState: MapState,
): Promise<{ updatedMap: MapState; created: number; reused: number }> {
  const fleets: MapFleet[] = mapState.fleets || [];
  if (fleets.length === 0) {
    return { updatedMap: mapState, created: 0, reused: 0 };
  }

  // Pull existing game_fleets rows for this game so we can detect what's
  // already materialized.
  const { data: existing } = await (supabase as any)
    .from("game_fleets")
    .select("id, fleet_id, hex_x, hex_y")
    .eq("game_id", gameId);
  const existingById = new Map<string, any>(
    ((existing as any[]) || []).map((r) => [r.id, r]),
  );

  let created = 0;
  let reused = 0;
  const updatedFleets: MapFleet[] = [];

  for (const fl of fleets) {
    // Already a real UUID and the row exists → reuse.
    if (UUID_RE.test(fl.fleet_id) && existingById.has(fl.fleet_id)) {
      reused += 1;
      updatedFleets.push(fl);
      continue;
    }

    // Insert a new game_fleets row. The trigger snapshots ships into
    // game_fleet_ships automatically.
    // We use fl.fleet_id as the source_fleet_id reference for the trigger
    const { data: inserted, error } = await (supabase as any)
      .from("game_fleets")
      .insert({
        game_id: gameId,
        fleet_id: fl.fleet_id,
        fleet_name: fl.fleet_name || "",
        owner_classification: fl.owner_classification || "",
        hex_x: fl.hex_x,
        hex_y: fl.hex_y,
      })
      .select("id")
      .single();

    if (error || !inserted?.id) {
      // Keep the original fleet entry on failure so the map still renders.
      console.error("[materializeGameFleets] insert failed", error);
      updatedFleets.push(fl);
      continue;
    }

    created += 1;
    updatedFleets.push({ ...fl, fleet_id: inserted.id });
  }

  const updatedMap: MapState = { ...mapState, fleets: updatedFleets };
  return { updatedMap, created, reused };
}
