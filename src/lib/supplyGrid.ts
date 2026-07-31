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

  // 1. Province hexes are always in supply. Compare via ownerMatchesFaction
  //    so callers can pass any owner alias (PROVINCE_N, display name, code_name).
  for (const hex of hexes.values()) {
    if (ownerMatchesFaction(hex.classification, ownClassification)) {
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
    // A starbase only projects supply once construction is finished.
    if (((sys as any).build_turns_remaining || 0) > 0) continue;

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

/**
 * All hex coordinates of planets (systems) owned by a faction.
 * Used for the "within half map-speed of an owned planet" resupply reach.
 */
export function collectOwnedPlanetHexes(
  ownClassification: string | undefined | null,
  systems: Map<number, SystemData>,
  hexes: Map<string, HexData>,
): Array<{ x: number; y: number }> {
  const out: Array<{ x: number; y: number }> = [];
  if (!ownClassification) return out;
  const hexById = new Map<number, HexData>();
  for (const h of hexes.values()) hexById.set(h.hex_id, h);
  for (const sys of systems.values()) {
    if (!ownerMatchesFaction(sys.owner, ownClassification)) continue;
    const hex = hexById.get(sys.hex_id);
    if (hex) out.push({ x: hex.x, y: hex.y });
  }
  return out;
}

export interface ResupplyEligibility {
  ok: boolean;
  /** "in_grid" | "near_owned_planet" | "out_of_supply_and_out_of_planet_range" */
  reason: string;
  /** Hex range derived from the fleet's map speed (floor(speed / 2)). */
  reach: number;
}

/**
 * A fleet may replenish supply when EITHER:
 *   1. its hex is inside the faction's supply grid, OR
 *   2. it sits within floor(mapSpeed / 2) hexes of any planet the faction owns.
 *
 * Evaluated with the fleet's START-OF-TURN hex — moving out of supply later in
 * the same turn does not revoke supply.
 */
export function canFleetResupply(
  fleetHex: { x: number; y: number },
  fleetMapSpeed: number,
  ownedPlanetHexes: Array<{ x: number; y: number }>,
  grid: Set<string> | undefined | null,
): ResupplyEligibility {
  const reach = Math.max(0, Math.floor((Number(fleetMapSpeed) || 0) / 2));
  if (grid?.has(hexKey(fleetHex.x, fleetHex.y))) {
    return { ok: true, reason: "in_grid", reach };
  }
  const [fx, fy, fz] = offsetToCube(fleetHex.x, fleetHex.y);
  for (const p of ownedPlanetHexes) {
    const [px, py, pz] = offsetToCube(p.x, p.y);
    if (cubeDistance(fx, fy, fz, px, py, pz) <= reach) {
      return { ok: true, reason: "near_owned_planet", reach };
    }
  }
  return { ok: false, reason: "out_of_supply_and_out_of_planet_range", reach };
}

