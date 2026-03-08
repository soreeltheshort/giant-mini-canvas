import { HexData, HexClassification, SystemData, MapState, hexKey } from "./mapTypes";
import { offsetToCube, cubeDistance } from "./hexUtils";

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

  // Process each selected province
  for (const province of provinces) {
    // Get eligible hexes (in province, no system)
    const eligible = Array.from(state.hexes.values()).filter(
      (h) => h.classification === province && !h.has_system
    );

    if (eligible.length === 0) continue;

    // How many systems to place
    const totalHexes = Array.from(state.hexes.values()).filter(
      (h) => h.classification === province
    ).length;
    const targetCount = Math.max(1, Math.floor(totalHexes / hexesPerSystem));

    if (forceEvenDistribution) {
      placeEven(eligible, targetCount, minDistance, placedCubes, newHexes, newSystems, province);
    } else {
      placeRandom(eligible, targetCount, minDistance, placedCubes, newHexes, newSystems, province);
    }
  }

  return { ...state, hexes: newHexes, systems: newSystems };
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
    facilities: [],
  });
}

function placeRandom(
  eligible: HexData[],
  targetCount: number,
  minDistance: number,
  placedCubes: [number, number, number][],
  newHexes: Map<string, HexData>,
  newSystems: Map<number, SystemData>,
  province: HexClassification
) {
  // Shuffle eligible
  const shuffled = [...eligible].sort(() => Math.random() - 0.5);
  let placed = 0;

  for (const hex of shuffled) {
    if (placed >= targetCount) break;
    if (!isFarEnough(hex, placedCubes, minDistance)) continue;
    placeSystem(hex, province, placedCubes, newHexes, newSystems);
    placed++;
  }
}

function placeEven(
  eligible: HexData[],
  targetCount: number,
  minDistance: number,
  placedCubes: [number, number, number][],
  newHexes: Map<string, HexData>,
  newSystems: Map<number, SystemData>,
  province: HexClassification
) {
  // Use a greedy approach: pick the hex farthest from all placed systems
  const remaining = [...eligible];
  let placed = 0;

  while (placed < targetCount && remaining.length > 0) {
    let bestIdx = -1;
    let bestMinDist = -1;

    for (let i = 0; i < remaining.length; i++) {
      const hex = remaining[i];
      const [cx, cy, cz] = offsetToCube(hex.x, hex.y);

      // Find minimum distance to any placed system
      let minD = Infinity;
      for (const [px, py, pz] of placedCubes) {
        const d = cubeDistance(cx, cy, cz, px, py, pz);
        if (d < minD) minD = d;
      }

      // If no placed systems yet, use distance from center
      if (placedCubes.length === 0) {
        minD = cubeDistance(cx, cy, cz, 0, 0, 0);
      }

      if (minD >= minDistance && minD > bestMinDist) {
        bestMinDist = minD;
        bestIdx = i;
      }
    }

    if (bestIdx === -1) break; // Can't place any more with min distance constraint
    placeSystem(remaining[bestIdx], province, placedCubes, newHexes, newSystems);
    remaining.splice(bestIdx, 1);
    placed++;
  }
}
