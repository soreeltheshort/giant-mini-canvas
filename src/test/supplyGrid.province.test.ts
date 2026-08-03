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

describe("supply grid — province coverage", () => {
  // A 3x3 patch: 4 hexes belong to province 4 (Dravian), the rest are neutral.
  const hexes = new Map<string, HexData>();
  const provinceCoords = [[0, 0], [1, 0], [0, 1], [2, 2]];
  for (let y = 0; y < 3; y++) {
    for (let x = 0; x < 3; x++) {
      const isProv = provinceCoords.some(([px, py]) => px === x && py === y);
      hexes.set(hexKey(x, y), makeHex(x, y, isProv ? "PROVINCE_4" : "UNCLAIMED"));
    }
  }
  const systems = new Map<number, SystemData>();

  const aliases = ["PROVINCE_4", "Dravian", "dravian", "Dravian_int1", " PROVINCE_4 "];

  for (const alias of aliases) {
    it(`covers every province hex when the player identity is "${alias}"`, () => {
      const grid = computeSupplyGrid(alias, systems, hexes, []);
      for (const [x, y] of provinceCoords) {
        expect(grid.has(hexKey(x, y))).toBe(true);
      }
      // Non-province hexes stay out of supply with no emitters present.
      expect(grid.size).toBe(provinceCoords.length);
    });
  }

  it("does not include another faction's province", () => {
    const grid = computeSupplyGrid("PROVINCE_2", systems, hexes, []);
    expect(grid.size).toBe(0);
  });

  it("treats CORE hexes as in supply for a Core-classified player", () => {
    const coreHexes = new Map<string, HexData>([
      [hexKey(0, 0), makeHex(0, 0, "CORE")],
      [hexKey(1, 0), makeHex(1, 0, "PROVINCE_1")],
    ]);
    const grid = computeSupplyGrid("Core", systems, coreHexes, []);
    expect(grid.has(hexKey(0, 0))).toBe(true);
    expect(grid.has(hexKey(1, 0))).toBe(false);
  });
});
