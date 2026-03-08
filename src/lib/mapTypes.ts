export type HexClassification =
  | "CORE"
  | "PROVINCE_1"
  | "PROVINCE_2"
  | "PROVINCE_3"
  | "PROVINCE_4"
  | "PROVINCE_5"
  | "PROVINCE_6"
  | "MARCHES";

export const CLASSIFICATION_LABELS: Record<HexClassification, string> = {
  CORE: "Core",
  PROVINCE_1: "Province 1",
  PROVINCE_2: "Province 2",
  PROVINCE_3: "Province 3",
  PROVINCE_4: "Province 4",
  PROVINCE_5: "Province 5",
  PROVINCE_6: "Province 6",
  MARCHES: "Marches",
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

export interface SystemData {
  system_id: number;
  map_id: number;
  hex_id: number;
  system_name: string;
  classification: string;
  importance_rank: number;
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

export interface MapState {
  mapData: MapData | null;
  hexes: Map<string, HexData>;
  systems: Map<number, SystemData>;
  regions: ProvinceRegion[];
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
