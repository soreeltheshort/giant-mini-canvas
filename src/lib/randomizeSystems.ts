import { HexData, HexClassification, SystemData, MapState, hexKey } from "./mapTypes";
import { offsetToCube, cubeDistance } from "./hexUtils";
import { DbPlanetType } from "@/hooks/usePlanetTypes";

export interface RandomizeParams {
  provinces: HexClassification[];
  hexesPerSystem: number;
  minDistance: number;
  forceEvenDistribution: boolean;
}

export const DEFAULT_RANDOMIZE_PARAMS: RandomizeParams = {
  provinces: ["UNEXPLORED_MARCHES"],
  hexesPerSystem: 50,
  minDistance: 3,
  forceEvenDistribution: false,
};

export function loadRandomizeParams(): RandomizeParams {
  try {
    const raw = localStorage.getItem("randomize-params");
    if (raw) return { ...DEFAULT_RANDOMIZE_PARAMS, ...JSON.parse(raw) };
  } catch {}
  return DEFAULT_RANDOMIZE_PARAMS;
}

export function saveRandomizeParams(params: RandomizeParams) {
  localStorage.setItem("randomize-params", JSON.stringify(params));
}

/**
 * Generate random systems on a map without removing existing ones.
 * Returns a new MapState with the added systems.
 */
export function randomizeSystems(state: MapState, params: RandomizeParams): MapState {
  const { provinces, hexesPerSystem, minDistance, forceEvenDistribution } = params;

  // Collect existing system cube coords for distance checks
  const existingCubes: [number, number, number][] = [];
  for (const hex of state.hexes.values()) {
    if (hex.has_system) {
      existingCubes.push(offsetToCube(hex.x, hex.y));
    }
  }

  const newHexes = new Map(state.hexes);
  const newSystems = new Map(state.systems);
  const placedCubes = [...existingCubes];

  const QUADRANT_SIZE = 10;

  for (const province of provinces) {
    const allInProvince = Array.from(state.hexes.values()).filter(
      (h) => h.classification === province
    );
    const eligibleInProvince = allInProvince.filter((h) => !h.has_system);
    if (eligibleInProvince.length === 0) continue;

    const totalTarget = Math.max(1, Math.floor(allInProvince.length / hexesPerSystem));

    // Bucket eligible hexes into 10x10 quadrants
    const quadrants = new Map<string, HexData[]>();
    const allQuadrants = new Map<string, number>(); // track total hexes per quadrant

    for (const h of allInProvince) {
      const qx = Math.floor((h.x + 70) / QUADRANT_SIZE);
      const qy = Math.floor((h.y + 70) / QUADRANT_SIZE);
      const qk = `${qx},${qy}`;
      allQuadrants.set(qk, (allQuadrants.get(qk) || 0) + 1);
    }

    for (const h of eligibleInProvince) {
      const qx = Math.floor((h.x + 70) / QUADRANT_SIZE);
      const qy = Math.floor((h.y + 70) / QUADRANT_SIZE);
      const qk = `${qx},${qy}`;
      if (!quadrants.has(qk)) quadrants.set(qk, []);
      quadrants.get(qk)!.push(h);
    }

    // Distribute target count proportionally across quadrants
    const quadrantKeys = Array.from(quadrants.keys());
    const totalQuadrantHexes = Array.from(allQuadrants.values()).reduce((a, b) => a + b, 0);

    // Calculate per-quadrant targets
    const quadrantTargets = new Map<string, number>();
    let assigned = 0;
    for (const qk of quadrantKeys) {
      const proportion = (allQuadrants.get(qk) || 0) / totalQuadrantHexes;
      const target = Math.round(totalTarget * proportion);
      quadrantTargets.set(qk, target);
      assigned += target;
    }

    // Distribute remainder randomly
    let remainder = totalTarget - assigned;
    const shuffledKeys = fisherYatesShuffle([...quadrantKeys]);
    let ki = 0;
    while (remainder > 0 && shuffledKeys.length > 0) {
      quadrantTargets.set(shuffledKeys[ki % shuffledKeys.length], (quadrantTargets.get(shuffledKeys[ki % shuffledKeys.length]) || 0) + 1);
      remainder--;
      ki++;
    }

    // Place systems within each quadrant
    for (const qk of quadrantKeys) {
      const qTarget = quadrantTargets.get(qk) || 0;
      if (qTarget === 0) continue;
      const qEligible = quadrants.get(qk)!;

      if (forceEvenDistribution) {
        placeEvenInQuadrant(qEligible, qTarget, minDistance, placedCubes, newHexes, newSystems, province);
      } else {
        placeRandomInQuadrant(qEligible, qTarget, minDistance, placedCubes, newHexes, newSystems, province);
      }
    }
  }

  return { ...state, hexes: newHexes, systems: newSystems };
}

/** Fisher-Yates shuffle */
function fisherYatesShuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function isFarEnough(
  hex: HexData,
  placedCubes: [number, number, number][],
  minDist: number
): boolean {
  const [cx, cy, cz] = offsetToCube(hex.x, hex.y);
  for (const [px, py, pz] of placedCubes) {
    if (cubeDistance(cx, cy, cz, px, py, pz) < minDist) return false;
  }
  return true;
}

function placeSystem(
  hex: HexData,
  province: HexClassification,
  placedCubes: [number, number, number][],
  newHexes: Map<string, HexData>,
  newSystems: Map<number, SystemData>
) {
  const key = hexKey(hex.x, hex.y);
  newHexes.set(key, { ...hex, has_system: true });
  placedCubes.push(offsetToCube(hex.x, hex.y));

  const systemId = Date.now() + Math.floor(Math.random() * 100000);
  newSystems.set(hex.hex_id, {
    system_id: systemId,
    map_id: 1,
    hex_id: hex.hex_id,
    system_name: `System ${hex.x},${hex.y}`,
    classification: province,
    importance_rank: 0,
    owner: "",
    system_type: "system",
    max_population: 0,
    current_population: 0,
    survey: 0,
    tribute: 0,
    upkeep: 0,
    resources: 0,
    facilities: [],
    facilities_in_production: [],
    condition: 0,
    morale: 0,
    max_ground_defenses: 0,
    current_ground_defenses: 0,
    initial_condition: 40,
    planet_index: 0,
    stationed_fighters: [],
    stationed_gunships: [],
  });
}

function placeRandomInQuadrant(
  eligible: HexData[],
  targetCount: number,
  minDistance: number,
  placedCubes: [number, number, number][],
  newHexes: Map<string, HexData>,
  newSystems: Map<number, SystemData>,
  province: HexClassification
) {
  const shuffled = fisherYatesShuffle([...eligible]);
  let placed = 0;
  for (const hex of shuffled) {
    if (placed >= targetCount) break;
    if (!isFarEnough(hex, placedCubes, minDistance)) continue;
    placeSystem(hex, province, placedCubes, newHexes, newSystems);
    placed++;
  }
}

function placeEvenInQuadrant(
  eligible: HexData[],
  targetCount: number,
  minDistance: number,
  placedCubes: [number, number, number][],
  newHexes: Map<string, HexData>,
  newSystems: Map<number, SystemData>,
  province: HexClassification
) {
  const remaining = [...eligible];
  let placed = 0;

  while (placed < targetCount && remaining.length > 0) {
    let bestIdx = -1;
    let bestMinDist = -1;

    for (let i = 0; i < remaining.length; i++) {
      const hex = remaining[i];
      const [cx, cy, cz] = offsetToCube(hex.x, hex.y);

      let minD = Infinity;
      for (const [px, py, pz] of placedCubes) {
        const d = cubeDistance(cx, cy, cz, px, py, pz);
        if (d < minD) minD = d;
      }

      if (placedCubes.length === 0) {
        minD = cubeDistance(cx, cy, cz, 0, 0, 0);
      }

      if (minD >= minDistance && minD > bestMinDist) {
        bestMinDist = minD;
        bestIdx = i;
      }
    }

    if (bestIdx === -1) break;
    placeSystem(remaining[bestIdx], province, placedCubes, newHexes, newSystems);
    remaining.splice(bestIdx, 1);
    placed++;
  }
}
