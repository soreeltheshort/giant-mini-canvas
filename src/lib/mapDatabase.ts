import {
  MapData,
  HexData,
  SystemData,
  MapState,
  HexClassification,
  hexKey,
} from "./mapTypes";
import { offsetToCube } from "./hexUtils";

// Generate a blank 141×141 hex map centered at (0,0), all MARCHES
export function generateBlankMap(): MapState {
  const mapData: MapData = {
    map_id: 1,
    name: "Third Republic Map",
    width_hexes: 141,
    height_hexes: 141,
    center_x: 0,
    center_y: 0,
  };

  const hexes = new Map<string, HexData>();
  let hexId = 1;

  for (let y = -70; y <= 70; y++) {
    for (let x = -70; x <= 70; x++) {
      const [cube_x, cube_y, cube_z] = offsetToCube(x, y);
      const hex: HexData = {
        hex_id: hexId++,
        map_id: 1,
        x,
        y,
        q: cube_x,
        r: y,
        cube_x,
        cube_y,
        cube_z,
        classification: "MARCHES",
        region_id: null,
        has_system: false,
      };
      hexes.set(hexKey(x, y), hex);
    }
  }

  return {
    mapData,
    hexes,
    systems: new Map(),
    regions: [],
  };
}

// Export map state to SQLite using sql.js loaded from CDN
export async function exportToSqlite(state: MapState): Promise<Blob> {
  const SQL = await loadSqlJsCDN();
  const db = new SQL.Database();

  db.run(`CREATE TABLE maps (
    map_id INTEGER PRIMARY KEY,
    name TEXT,
    width_hexes INTEGER,
    height_hexes INTEGER,
    center_x INTEGER,
    center_y INTEGER
  )`);

  db.run(`CREATE TABLE province_regions (
    region_id INTEGER PRIMARY KEY AUTOINCREMENT,
    map_id INTEGER,
    classification TEXT,
    display_name TEXT,
    region_center_x INTEGER,
    region_center_y INTEGER,
    hex_count INTEGER DEFAULT 0,
    system_count INTEGER DEFAULT 0,
    is_system_allowed INTEGER DEFAULT 1
  )`);

  db.run(`CREATE TABLE hexes (
    hex_id INTEGER PRIMARY KEY,
    map_id INTEGER,
    x INTEGER,
    y INTEGER,
    q INTEGER,
    r INTEGER,
    cube_x INTEGER,
    cube_y INTEGER,
    cube_z INTEGER,
    classification TEXT,
    region_id INTEGER,
    has_system INTEGER DEFAULT 0
  )`);

  db.run(`CREATE TABLE systems (
    system_id INTEGER PRIMARY KEY AUTOINCREMENT,
    map_id INTEGER,
    hex_id INTEGER,
    system_name TEXT,
    classification TEXT,
    importance_rank INTEGER DEFAULT 0
  )`);

  // Insert map
  if (state.mapData) {
    db.run(
      "INSERT INTO maps VALUES (?,?,?,?,?,?)",
      [state.mapData.map_id, state.mapData.name, state.mapData.width_hexes, state.mapData.height_hexes, state.mapData.center_x, state.mapData.center_y]
    );
  }

  // Insert hexes in batches
  const hexArr = Array.from(state.hexes.values());
  db.run("BEGIN TRANSACTION");
  for (const h of hexArr) {
    db.run(
      "INSERT INTO hexes VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
      [h.hex_id, h.map_id, h.x, h.y, h.q, h.r, h.cube_x, h.cube_y, h.cube_z, h.classification, h.region_id, h.has_system ? 1 : 0]
    );
  }
  db.run("COMMIT");

  // Insert systems
  db.run("BEGIN TRANSACTION");
  for (const sys of state.systems.values()) {
    db.run(
      "INSERT INTO systems (map_id, hex_id, system_name, classification, importance_rank) VALUES (?,?,?,?,?)",
      [sys.map_id, sys.hex_id, sys.system_name, sys.classification, sys.importance_rank]
    );
  }
  db.run("COMMIT");

  const data = db.export();
  db.close();
  return new Blob([data.buffer as ArrayBuffer], { type: "application/x-sqlite3" });
}

// Province stats
export function getProvinceStats(state: MapState) {
  const stats: Record<string, { hexCount: number; systemCount: number }> = {};
  for (const hex of state.hexes.values()) {
    if (!stats[hex.classification]) stats[hex.classification] = { hexCount: 0, systemCount: 0 };
    stats[hex.classification].hexCount++;
    if (hex.has_system) stats[hex.classification].systemCount++;
  }
  return stats;
}

// Import a SQLite file and read map state from it
export async function importFromSqlite(file: File): Promise<MapState> {
  const SQL = await loadSqlJsCDN();
  const buf = await file.arrayBuffer();
  const db = new SQL.Database(new Uint8Array(buf));

  const readRows = (sql: string) => {
    try {
      const result = db.exec(sql);
      if (result.length === 0) return [];
      const cols = result[0].columns;
      return result[0].values.map((row: any[]) => {
        const obj: any = {};
        cols.forEach((c: string, i: number) => (obj[c] = row[i]));
        return obj;
      });
    } catch {
      return [];
    }
  };

  // Read map
  const maps = readRows("SELECT * FROM maps LIMIT 1");
  const mapData: MapData | null = maps.length > 0 ? maps[0] as MapData : null;

  // Read hexes
  const hexes = new Map<string, HexData>();
  for (const row of readRows("SELECT * FROM hexes")) {
    row.has_system = !!row.has_system;
    hexes.set(hexKey(row.x, row.y), row as HexData);
  }

  // Read systems
  const systems = new Map<number, SystemData>();
  for (const row of readRows("SELECT * FROM systems")) {
    systems.set(row.hex_id, row as SystemData);
  }

  // Read regions
  const regions: ProvinceRegion[] = [];
  for (const row of readRows("SELECT * FROM province_regions")) {
    row.is_system_allowed = !!row.is_system_allowed;
    regions.push(row as ProvinceRegion);
  }

  db.close();
  return { mapData, hexes, systems, regions };
}

// Load sql.js from CDN (for export only)
let sqlPromise: Promise<any> | null = null;
function loadSqlJsCDN(): Promise<any> {
  if (sqlPromise) return sqlPromise;
  sqlPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.8.0/sql-wasm.js";
    script.onload = () => {
      const initSqlJs = (window as any).initSqlJs;
      if (!initSqlJs) { reject(new Error("initSqlJs not found")); return; }
      initSqlJs({
        locateFile: (file: string) => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.8.0/${file}`,
      }).then(resolve).catch(reject);
    };
    script.onerror = () => reject(new Error("Failed to load sql.js"));
    document.head.appendChild(script);
  });
  return sqlPromise;
}
