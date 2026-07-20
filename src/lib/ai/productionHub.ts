/**
 * Production Hub / Spawn Hex helpers for AI action execution.
 *
 * Pure, deterministic, testable in isolation. No DB writes.
 *
 * Vocabulary:
 *   "Hub"        = an owned system with a shipyard, ranked by total
 *                  ship_build_capacity (facility.ship_build_capacity *
 *                  facility.quantity), tie-broken by max_ship_hull_class
 *                  sort order (bigger hulls first), then system_id asc.
 *   "Spawn hex"  = the closest empty hex (no fleet, no system) to the hub's
 *                  system hex. Falls back to the system hex itself if none
 *                  found within radius.
 */
import type { MapState, SystemData, HexData } from "@/lib/mapTypes";
import type { DbFacilityType } from "@/hooks/useFacilityTypes";
import { ownerMatchesFaction } from "@/lib/factionUtils";
import { offsetToCube, cubeDistance } from "@/lib/hexUtils";

function distHex(ax: number, ay: number, bx: number, by: number): number {
  const [acx, acy, acz] = offsetToCube(ax, ay);
  const [bcx, bcy, bcz] = offsetToCube(bx, by);
  return cubeDistance(acx, acy, acz, bcx, bcy, bcz);
}

export interface ShipyardInfo {
  system: SystemData;
  hex: HexData;
  capacity: number;
  /** hull_class code (T/BB/...) representing the largest ship this
   *  system's best shipyard can build. Null if unspecified. */
  maxHullClass: string | null;
  maxHullSort: number;
}

/** Aggregate a system's shipyard capacity + max hull. */
export function systemShipyardInfo(
  sys: SystemData,
  facilityTypes: DbFacilityType[],
  hullSortByCode: Map<string, number>,
): { capacity: number; maxHullClass: string | null; maxHullSort: number } {
  let capacity = 0;
  let bestHull: string | null = null;
  let bestSort = -1;
  for (const f of sys.facilities || []) {
    const ft = facilityTypes.find((t) => String(t.id) === String(f.facility_type_id));
    if (!ft) continue;
    const c = Number((ft as any).ship_build_capacity) || 0;
    if (c <= 0) continue;
    capacity += c * (f.quantity || 1);
    const hull = (ft as any).max_ship_hull_class as string | null;
    if (hull) {
      const s = hullSortByCode.get(hull) ?? 0;
      if (s > bestSort) {
        bestSort = s;
        bestHull = hull;
      }
    }
  }
  return { capacity, maxHullClass: bestHull, maxHullSort: bestSort };
}

/** All owned shipyard systems for a faction. */
export function ownedShipyards(
  mapState: MapState,
  factionCode: string,
  facilityTypes: DbFacilityType[],
  hullSortByCode: Map<string, number>,
): ShipyardInfo[] {
  const out: ShipyardInfo[] = [];
  const hexByHexId = new Map<number, HexData>();
  for (const h of mapState.hexes.values()) hexByHexId.set(h.hex_id, h);
  for (const sys of mapState.systems.values()) {
    if (!ownerMatchesFaction(sys.owner, factionCode)) continue;
    const info = systemShipyardInfo(sys, facilityTypes, hullSortByCode);
    if (info.capacity <= 0) continue;
    const hex = hexByHexId.get(sys.hex_id);
    if (!hex) continue;
    out.push({ system: sys, hex, ...info });
  }
  return out;
}

/**
 * Pick the "hub of production" — the highest-capacity owned shipyard.
 * Deterministic tie-break: higher max hull class first, then system_id asc.
 */
export function selectProductionHub(
  mapState: MapState,
  factionCode: string,
  facilityTypes: DbFacilityType[],
  hullSortByCode: Map<string, number>,
): ShipyardInfo | null {
  const yards = ownedShipyards(mapState, factionCode, facilityTypes, hullSortByCode);
  if (yards.length === 0) return null;
  yards.sort(
    (a, b) =>
      b.capacity - a.capacity ||
      b.maxHullSort - a.maxHullSort ||
      a.system.system_id - b.system.system_id,
  );
  return yards[0];
}

/**
 * Shipyards belonging to `factionCode` whose system hex is within
 * `radius` hexes of `hub.hex`. Ordered by capacity desc, then max hull
 * desc, then distance asc, then system_id asc.
 */
export function shipyardsWithinRange(
  mapState: MapState,
  factionCode: string,
  facilityTypes: DbFacilityType[],
  hullSortByCode: Map<string, number>,
  hub: ShipyardInfo,
  radius: number,
): Array<ShipyardInfo & { distance: number }> {
  const yards = ownedShipyards(mapState, factionCode, facilityTypes, hullSortByCode);
  const filtered = yards
    .map((y) => ({ ...y, distance: distHex(hub.hex.x, hub.hex.y, y.hex.x, y.hex.y) }))
    .filter((y) => y.distance <= radius);
  filtered.sort(
    (a, b) =>
      b.capacity - a.capacity ||
      b.maxHullSort - a.maxHullSort ||
      a.distance - b.distance ||
      a.system.system_id - b.system.system_id,
  );
  return filtered;
}

/**
 * Find the closest empty hex to the hub's system hex. "Empty" = no
 * fleet on it and no system on it. Spirals outward from radius 1 up to
 * `maxRadius`. Returns null if none found (caller may fall back to hub hex).
 */
export function selectSpawnHex(
  mapState: MapState,
  hub: ShipyardInfo,
  maxRadius = 3,
): { x: number; y: number } | null {
  const occupiedFleet = new Set<string>();
  for (const f of mapState.fleets) occupiedFleet.add(`${f.hex_x},${f.hex_y}`);
  const occupiedSystem = new Set<string>();
  for (const h of mapState.hexes.values()) if (h.has_system) occupiedSystem.add(`${h.x},${h.y}`);

  const candidates: Array<{ x: number; y: number; d: number }> = [];
  for (const h of mapState.hexes.values()) {
    const d = distHex(hub.hex.x, hub.hex.y, h.x, h.y);
    if (d === 0 || d > maxRadius) continue;
    const key = `${h.x},${h.y}`;
    if (occupiedFleet.has(key) || occupiedSystem.has(key)) continue;
    candidates.push({ x: h.x, y: h.y, d });
  }
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => a.d - b.d || a.x - b.x || a.y - b.y);
  return { x: candidates[0].x, y: candidates[0].y };
}
