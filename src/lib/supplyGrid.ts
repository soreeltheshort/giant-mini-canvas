/**
 * Supply Grid System
 *
 * A faction's supply grid is the set of hexes considered "in supply" for that
 * faction on the current turn. A hex is in supply if either:
 *   1. Its `classification` equals the player's own classification
 *      (their province — always in supply), OR
 *   2. It lies within `supply_range` of an owned planet that hosts a facility
 *      with `supply_range > 0`. Largest supply_range per planet wins;
 *      multiple planets each project their own radius (union).
 *
 * Used to gate fleet supply replenishment and facility construction.
 */
import type { SystemData, HexData } from "./mapTypes";
import { hexKey } from "./mapTypes";
import { offsetToCube, cubeDistance } from "./hexUtils";
import { ownerMatchesFaction } from "./factionUtils";

export interface SupplyFacilityLookup {
  facility_type_id: string;
  supply_range?: number | null;
}

export interface SupplyFacilityTypeInput {
  facility_type_id?: string;
  id?: string;
  supply_range?: number | null;
}

/**
 * Compute the supply grid for a single faction.
 *
 * @param ownClassification e.g. "PROVINCE_3" or "CORE" — hexes whose
 *        classification === ownClassification are always in supply.
 * @param systems Map of system_id → SystemData.
 * @param hexes Map of "x,y" → HexData.
 * @param facilityTypes Facility catalog rows (must expose supply_range).
 *        Rows can key by either `facility_type_id` or `id` (raw DB row).
 */
export function computeSupplyGrid(
  ownClassification: string | undefined | null,
  systems: Map<number, SystemData>,
  hexes: Map<string, HexData>,
  facilityTypes: SupplyFacilityTypeInput[],
): Set<string> {
  const grid = new Set<string>();
  if (!ownClassification) return grid;

  // 1. Province hexes are always in supply.
  for (const hex of hexes.values()) {
    if (hex.classification === ownClassification) {
      grid.add(hexKey(hex.x, hex.y));
    }
  }

  // Build a supply_range lookup keyed by facility type id.
  const supplyRangeById = new Map<string, number>();
  for (const ft of facilityTypes) {
    const id = String((ft.facility_type_id ?? ft.id) || "");
    if (!id) continue;
    const r = Math.max(0, Number(ft.supply_range) || 0);
    if (r > 0) supplyRangeById.set(id, r);
  }
  if (supplyRangeById.size === 0) return grid;

  // Build a hex_id -> hex lookup for system positions.
  const hexById = new Map<number, HexData>();
  for (const h of hexes.values()) hexById.set(h.hex_id, h);

  // 2. Union of radii from owned planets with supply-emitting facilities.
  for (const sys of systems.values()) {
    if (!ownerMatchesFaction(sys.owner, ownClassification)) continue;
    let maxRange = 0;
    for (const f of (sys.facilities || [])) {
      const r = supplyRangeById.get(String(f.facility_type_id)) || 0;
      if (r > maxRange) maxRange = r;
    }
    if (maxRange <= 0) continue;
    const hex = hexById.get(sys.hex_id);
    if (!hex) continue;
    const [cx, cy, cz] = offsetToCube(hex.x, hex.y);
    // Cheap: iterate all hexes and test cube distance. 141x141 is fine.
    for (const h of hexes.values()) {
      const [hx, hy, hz] = offsetToCube(h.x, h.y);
      if (cubeDistance(cx, cy, cz, hx, hy, hz) <= maxRange) {
        grid.add(hexKey(h.x, h.y));
      }
    }
  }

  return grid;
}

export function isHexInSupply(x: number, y: number, grid: Set<string>): boolean {
  return grid.has(hexKey(x, y));
}
