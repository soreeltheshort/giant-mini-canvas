import { describe, it, expect } from "vitest";
import { computeSupplyGrid } from "@/lib/supplyGrid";
import { hexKey, type HexData, type SystemData } from "@/lib/mapTypes";

function makeHex(x: number, y: number, classification: string): HexData {
  return {
    hex_id: y * 1000 + x,
    map_id: 1,
    x,
    y,
    q: x,
    r: y,
    cube_x: x,
    cube_y: y,
    cube_z: -x - y,
    classification: classification as any,
    region_id: 0,
    has_system: false,
  } as HexData;
}

function makeSystem(id: number, hex: HexData, owner: string): SystemData {
  return {
    system_id: id,
    map_id: 1,
    hex_id: hex.hex_id,
    system_name: `S${id}`,
    classification: "MARCHES",
    importance_rank: 1,
    owner,
    system_type: "system",
    current_population: 0,
    survey: 0,
    tribute: 0,
    upkeep: 0,
    resources: 0,
    facilities: [{ facility_type_id: "relay", quantity: 1 }],
    facilities_in_production: [],
    condition: 100,
    morale: 100,
    max_ground_defenses: 0,
    current_ground_defenses: 0,
    initial_condition: 100,
    planet_index: 0,
    stationed_fighters: [],
    stationed_gunships: [],
  } as SystemData;
}

const FACILITY_TYPES = [{ facility_type_id: "relay", supply_range: 2 }];

// One row of hexes: x = 0..20 at y = 0. x <= 2 is the player's province.
function buildHexes(): Map<string, HexData> {
  const hexes = new Map<string, HexData>();
  for (let x = 0; x <= 20; x++) {
    hexes.set(hexKey(x, 0), makeHex(x, 0, x <= 2 ? "PROVINCE_4" : "MARCHES"));
  }
  return hexes;
}

describe("supply grid — contiguity from the province", () => {
  const hexes = buildHexes();
  const at = (x: number) => hexes.get(hexKey(x, 0))!;

  it("extends the grid from an emitter sitting inside the province", () => {
    const systems = new Map<number, SystemData>([[1, makeSystem(1, at(2), "PROVINCE_4")]]);
    const grid = computeSupplyGrid("PROVINCE_4", systems, hexes, FACILITY_TYPES);
    expect(grid.has(hexKey(4, 0))).toBe(true);
    expect(grid.has(hexKey(5, 0))).toBe(false);
  });

  it("chains a second emitter off the first", () => {
    const systems = new Map<number, SystemData>([
      [1, makeSystem(1, at(2), "PROVINCE_4")],
      [2, makeSystem(2, at(4), "PROVINCE_4")],
    ]);
    const grid = computeSupplyGrid("PROVINCE_4", systems, hexes, FACILITY_TYPES);
    expect(grid.has(hexKey(6, 0))).toBe(true);
    expect(grid.has(hexKey(7, 0))).toBe(false);
  });

  it("orphans the far emitter when the middle link is lost", () => {
    const systems = new Map<number, SystemData>([
      // Middle relay captured by another faction.
      [1, makeSystem(1, at(4), "PROVINCE_2")],
      [2, makeSystem(2, at(6), "PROVINCE_4")],
    ]);
    const grid = computeSupplyGrid("PROVINCE_4", systems, hexes, FACILITY_TYPES);
    // Province only — the far relay is disconnected and projects nothing.
    expect(grid.has(hexKey(4, 0))).toBe(false);
    expect(grid.has(hexKey(6, 0))).toBe(false);
    expect(grid.size).toBe(3);
  });

  it("ignores an isolated owned emitter far from the province", () => {
    const systems = new Map<number, SystemData>([[1, makeSystem(1, at(15), "PROVINCE_4")]]);
    const grid = computeSupplyGrid("PROVINCE_4", systems, hexes, FACILITY_TYPES);
    expect(grid.has(hexKey(15, 0))).toBe(false);
    expect(grid.size).toBe(3);
  });

  it("re-establishes the chain once the middle link is retaken", () => {
    const systems = new Map<number, SystemData>([
      [1, makeSystem(1, at(2), "PROVINCE_4")],
      [2, makeSystem(2, at(4), "PROVINCE_4")],
      [3, makeSystem(3, at(6), "PROVINCE_4")],
    ]);
    const grid = computeSupplyGrid("PROVINCE_4", systems, hexes, FACILITY_TYPES);
    expect(grid.has(hexKey(8, 0))).toBe(true);
  });

});
