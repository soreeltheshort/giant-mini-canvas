/**
 * useFleetSensorRanges
 *
 * Loads per-fleet sensor range for every fleet in a game, computed as the
 * maximum `ship_types.sensor_rating` across all ships in the fleet. Falls
 * back to BASE_SENSOR_RADIUS (1) for fleets with no scouting ships.
 *
 * Returned map is keyed by the `game_fleets.fleet_id` field, which is what
 * `MapFleet.fleet_id` carries on the client map state.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const BASE_SENSOR_RADIUS = 1;

export function useFleetSensorRanges(gameId: string | null | undefined): Map<string, number> {
  const [map, setMap] = useState<Map<string, number>>(new Map());
  useEffect(() => {
    if (!gameId) { setMap(new Map()); return; }
    let cancelled = false;
    (async () => {
      // game_fleet_ships rows for this game, joined to ship_types for sensor_rating,
      // joined to game_fleets for the fleet_id key.
      // NOTE: MapFleet.fleet_id carries `game_fleets.id` (the PK), NOT the
      // `game_fleets.fleet_id` source-fleet ref. Key the map by `gf.id`.
      const { data: gfs } = await (supabase as any)
        .from("game_fleets")
        .select("id, game_fleet_ships(ship_type_id, ship_types(sensor_rating))")
        .eq("game_id", gameId);
      if (cancelled) return;
      const out = new Map<string, number>();
      for (const gf of (gfs || []) as any[]) {
        let max = BASE_SENSOR_RADIUS;
        for (const s of gf.game_fleet_ships || []) {
          const r = Number(s.ship_types?.sensor_rating ?? 0);
          if (r > max) max = r;
        }
        if (gf.id) out.set(gf.id, max);
      }
      setMap(out);
    })();
    return () => { cancelled = true; };
  }, [gameId]);
  return map;
}
