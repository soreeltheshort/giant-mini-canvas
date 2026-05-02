/**
 * Fleet attack-range helpers.
 *
 * Game rule: a fleet may attack a target (enemy fleet OR planet) that is
 * currently visible AND within its attack range. Attack range is half the
 * fleet's map speed (rounded down). Attacking does NOT move the fleet.
 *
 *   attack_range = floor(fleet_map_speed / 2)
 *
 * Fleet map speed is the SLOWEST `ship_types.map_speed` across the fleet's
 * non-strikecraft hosts, with crippled ships moving at half speed
 * (rounded up, min 1) — same rule used in FleetDetailContent.
 */
import { offsetToCube, cubeDistance } from "@/lib/hexUtils";

/** Hex distance between two odd-r offset coords. */
export function hexDistance(ax: number, ay: number, bx: number, by: number): number {
  const [acx, acy, acz] = offsetToCube(ax, ay);
  const [bcx, bcy, bcz] = offsetToCube(bx, by);
  return cubeDistance(acx, acy, acz, bcx, bcy, bcz);
}

/** floor(map_speed / 2), never negative. */
export function attackRangeFromMapSpeed(mapSpeed: number): number {
  return Math.max(0, Math.floor((Number(mapSpeed) || 0) / 2));
}

/**
 * Fetch a fleet's effective map speed from its per-game roster.
 * Returns 0 if the fleet has no movement-capable ships.
 */
export async function fetchFleetMapSpeed(
  supabase: any,
  gameFleetId: string,
): Promise<number> {
  const { data: rows } = await supabase
    .from("game_fleet_ships")
    .select("quantity, crippled, ship_types(map_speed)")
    .eq("game_fleet_id", gameFleetId);
  let minSpeed = Infinity;
  for (const r of (rows || []) as any[]) {
    const raw = Number(r.ship_types?.map_speed) || 0;
    if (raw <= 0) continue;
    const eff = r.crippled ? Math.max(1, Math.ceil(raw / 2)) : raw;
    if (eff < minSpeed) minSpeed = eff;
  }
  return minSpeed === Infinity ? 0 : minSpeed;
}

/**
 * Same calculation, but driven by an in-memory ship list (used by client
 * code that already has the roster loaded — e.g. PlayerGame).
 */
export function computeFleetMapSpeedFromShips(
  ships: Array<{ ship_type_id: string; quantity: number; crippled?: boolean }>,
  shipTypes: Array<{ id: string; map_speed?: number }>,
): number {
  let minSpeed = Infinity;
  for (const s of ships) {
    const st = shipTypes.find(t => t.id === s.ship_type_id);
    if (!st) continue;
    const raw = Number(st.map_speed) || 0;
    if (raw <= 0) continue;
    const eff = s.crippled ? Math.max(1, Math.ceil(raw / 2)) : raw;
    if (eff < minSpeed) minSpeed = eff;
  }
  return minSpeed === Infinity ? 0 : minSpeed;
}
