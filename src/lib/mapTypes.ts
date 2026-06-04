export type HexClassification =
  | "CORE"
  | "PROVINCE_1"
  | "PROVINCE_2"
  | "PROVINCE_3"
  | "PROVINCE_4"
  | "PROVINCE_5"
  | "PROVINCE_6"
  | "MARCHES"
  | "UNEXPLORED_MARCHES";

export const CLASSIFICATION_LABELS: Record<HexClassification, string> = {
  CORE: "Core",
  PROVINCE_1: "Valerian",
  PROVINCE_2: "Aurelian",
  PROVINCE_3: "Cassian",
  PROVINCE_4: "Dravian",
  PROVINCE_5: "Marcellan",
  PROVINCE_6: "Octavian",
  MARCHES: "Explored Marches",
  UNEXPLORED_MARCHES: "Marches",
};

export const CLASSIFICATION_COLORS: Record<HexClassification, string> = {
  CORE: "#3b82f6",
  PROVINCE_1: "#f97316",
  PROVINCE_2: "#06b6d4",
  PROVINCE_3: "#eab308",
  PROVINCE_4: "#a855f7",
  PROVINCE_5: "#f472b6",
  PROVINCE_6: "#14b8a6",
  MARCHES: "#374151",
  UNEXPLORED_MARCHES: "#1f2937",
};

export const ALL_CLASSIFICATIONS: HexClassification[] = [
  "CORE",
  "PROVINCE_1",
  "PROVINCE_2",
  "PROVINCE_3",
  "PROVINCE_4",
  "PROVINCE_5",
  "PROVINCE_6",
  "MARCHES",
  "UNEXPLORED_MARCHES",
];

export interface MapData {
  map_id: number;
  name: string;
  width_hexes: number;
  height_hexes: number;
  center_x: number;
  center_y: number;
}

export interface HexData {
  hex_id: number;
  map_id: number;
  x: number;
  y: number;
  q: number;
  r: number;
  cube_x: number;
  cube_y: number;
  cube_z: number;
  classification: HexClassification;
  region_id: number | null;
  has_system: boolean;
}

export interface FacilityType {
  facility_type_id: string;
  name: string;
  description: string;
  icon: string; // emoji or short code
}

export interface SystemFacility {
  facility_type_id: string;
  quantity: number;
}

export interface FacilityInProduction {
  facility_type_id: string;
  turns_remaining: number;
}

export interface StationedStrikecraft {
  ship_type_id: string;
  quantity: number;
}

export type SystemType = "system" | "station";

export interface SystemData {
  system_id: number;
  map_id: number;
  hex_id: number;
  system_name: string;
  classification: string;
  importance_rank: number;
  owner: string;
  system_type: SystemType;
  current_population: number;
  survey: number;
  tribute: number;
  upkeep: number;
  resources: number;
  facilities: SystemFacility[];
  facilities_in_production: FacilityInProduction[];
  condition: number;
  morale: number;
  max_ground_defenses: number;
  current_ground_defenses: number;
  initial_condition: number;
  planet_index: number;
  stationed_fighters: StationedStrikecraft[];
  stationed_gunships: StationedStrikecraft[];
  planet_type_id?: string;
}

export interface ProvinceRegion {
  region_id: number;
  map_id: number;
  classification: string;
  display_name: string;
  region_center_x: number;
  region_center_y: number;
  hex_count: number;
  system_count: number;
  is_system_allowed: boolean;
}

export interface MapFleet {
  fleet_id: string;
  fleet_name: string;
  owner_classification: string;
  hex_x: number;
  hex_y: number;
  source_fleet_id: string; // reference to the fleets table
  is_garrison?: boolean;
  system_id?: number | null;
  /**
   * Persistent movement waypoint. Set by the movement phase when a fleet_move
   * order's destination is farther than one turn's map_speed. The fleet steps
   * toward this destination automatically each subsequent turn until it
   * arrives (cleared), the player overrides it with a new fleet_move order,
   * or the player cancels the order from the Fleet panel. This is fleet
   * STATE — not a per-turn player order — so it does not cost combat points
   * after the initial issuance and does not appear as a fresh player order.
   */
  dest_x?: number | null;
  dest_y?: number | null;
  /** Turn on which the original fleet_move order was issued. Informational. */
  dest_set_turn?: number | null;
}

export interface MapState {
  mapData: MapData | null;
  hexes: Map<string, HexData>;
  systems: Map<number, SystemData>;
  regions: ProvinceRegion[];
  facilityTypes: FacilityType[];
  fleets: MapFleet[];
}

export type EditorTool = "select" | "paint" | "fill" | "brush";
export type BrushSize = 1 | 7 | 19;

export interface EditorState {
  tool: EditorTool;
  brushSize: BrushSize;
  paintClassification: HexClassification;
  selectedHexKey: string | null;
  hoveredHexKey: string | null;
  showBorders: boolean;
  showSystems: boolean;
  showCoordinates: boolean;
  highlightClassification: HexClassification | "ALL" | null;
}

export function hexKey(x: number, y: number): string {
  return `${x},${y}`;
}
