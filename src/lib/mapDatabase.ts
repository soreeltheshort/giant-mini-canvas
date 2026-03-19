import {
  MapData,
  HexData,
  SystemData,
  ProvinceRegion,
  MapState,
  MapFleet,
  FacilityType,
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
        classification: "UNEXPLORED_MARCHES",
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
    facilityTypes: [],
    fleets: [],
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
    importance_rank INTEGER DEFAULT 0,
    owner TEXT DEFAULT '',
    system_type TEXT DEFAULT 'system',
    current_population INTEGER DEFAULT 0,
    survey INTEGER DEFAULT 0,
    tribute INTEGER DEFAULT 0,
    upkeep INTEGER DEFAULT 0,
    resources INTEGER DEFAULT 0,
    condition INTEGER DEFAULT 0,
    morale INTEGER DEFAULT 0,
    max_ground_defenses INTEGER DEFAULT 0,
    current_ground_defenses INTEGER DEFAULT 0,
    initial_condition INTEGER DEFAULT 40,
    planet_index INTEGER DEFAULT 0,
    planet_type_id TEXT DEFAULT ''
  )`);

  db.run(`CREATE TABLE facilities_in_production (
    system_id INTEGER,
    facility_type_id TEXT,
    turns_remaining INTEGER DEFAULT 1
  )`);

  db.run(`CREATE TABLE stationed_fighters (
    system_id INTEGER,
    ship_type_id TEXT,
    quantity INTEGER DEFAULT 0
  )`);

  db.run(`CREATE TABLE stationed_gunships (
    system_id INTEGER,
    ship_type_id TEXT,
    quantity INTEGER DEFAULT 0
  )`);
  db.run(`CREATE TABLE facility_types (
    facility_type_id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    description TEXT DEFAULT '',
    icon TEXT DEFAULT '🏭'
  )`);

  db.run(`CREATE TABLE system_facilities (
    system_id INTEGER,
    facility_type_id INTEGER,
    quantity INTEGER DEFAULT 1,
    PRIMARY KEY (system_id, facility_type_id)
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
      `INSERT INTO systems (map_id, hex_id, system_name, classification, importance_rank, owner,
        system_type, current_population, survey, tribute, upkeep, resources,
        condition, morale, max_ground_defenses, current_ground_defenses,
        initial_condition, planet_index, planet_type_id)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [sys.map_id, sys.hex_id, sys.system_name, sys.classification, sys.importance_rank, sys.owner || "",
       sys.system_type || "system", sys.current_population || 0, sys.survey || 0, sys.tribute || 0,
       sys.upkeep || 0, sys.resources || 0, sys.condition || 0, sys.morale || 0,
       sys.max_ground_defenses || 0, sys.current_ground_defenses || 0,
       sys.initial_condition || 40, sys.planet_index || 0, sys.planet_type_id || ""]
    );
    const lastId = db.exec("SELECT last_insert_rowid()")[0].values[0][0] as number;
    for (const fac of sys.facilities || []) {
      db.run(
        "INSERT INTO system_facilities (system_id, facility_type_id, quantity) VALUES (?,?,?)",
        [lastId, fac.facility_type_id, fac.quantity]
      );
    }
    for (const fip of sys.facilities_in_production || []) {
      db.run(
        "INSERT INTO facilities_in_production (system_id, facility_type_id, turns_remaining) VALUES (?,?,?)",
        [lastId, fip.facility_type_id, fip.turns_remaining]
      );
    }
    for (const f of sys.stationed_fighters || []) {
      db.run(
        "INSERT INTO stationed_fighters (system_id, ship_type_id, quantity) VALUES (?,?,?)",
        [lastId, f.ship_type_id, f.quantity]
      );
    }
    for (const g of sys.stationed_gunships || []) {
      db.run(
        "INSERT INTO stationed_gunships (system_id, ship_type_id, quantity) VALUES (?,?,?)",
        [lastId, g.ship_type_id, g.quantity]
      );
    }
  }
  db.run("COMMIT");

  // Insert facility types
  db.run("BEGIN TRANSACTION");
  for (const ft of state.facilityTypes || []) {
    db.run(
      "INSERT INTO facility_types (facility_type_id, name, description, icon) VALUES (?,?,?,?)",
      [ft.facility_type_id, ft.name, ft.description, ft.icon]
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

  // Read hexes — migrate legacy MARCHES to UNEXPLORED_MARCHES
  const hexes = new Map<string, HexData>();
  for (const row of readRows("SELECT * FROM hexes")) {
    row.has_system = !!row.has_system;
    if (row.classification === "MARCHES") {
      row.classification = "UNEXPLORED_MARCHES";
    }
    hexes.set(hexKey(row.x, row.y), row as HexData);
  }

  // Read systems and their facilities
  const systemFacilities = readRows("SELECT * FROM system_facilities");
  const facBySystemId = new Map<number, { facility_type_id: string; quantity: number }[]>();
  for (const sf of systemFacilities) {
    if (!facBySystemId.has(sf.system_id)) facBySystemId.set(sf.system_id, []);
    facBySystemId.get(sf.system_id)!.push({ facility_type_id: String(sf.facility_type_id), quantity: sf.quantity });
  }

  // Read facilities in production
  const fipRows = readRows("SELECT * FROM facilities_in_production");
  const fipBySystemId = new Map<number, { facility_type_id: string; turns_remaining: number }[]>();
  for (const fip of fipRows) {
    if (!fipBySystemId.has(fip.system_id)) fipBySystemId.set(fip.system_id, []);
    fipBySystemId.get(fip.system_id)!.push({ facility_type_id: String(fip.facility_type_id), turns_remaining: fip.turns_remaining });
  }

  // Read stationed strikecraft
  const fighterRows = readRows("SELECT * FROM stationed_fighters");
  const fightersBySystemId = new Map<number, { ship_type_id: string; quantity: number }[]>();
  for (const f of fighterRows) {
    if (!fightersBySystemId.has(f.system_id)) fightersBySystemId.set(f.system_id, []);
    fightersBySystemId.get(f.system_id)!.push({ ship_type_id: String(f.ship_type_id), quantity: f.quantity });
  }

  const gunshipRows = readRows("SELECT * FROM stationed_gunships");
  const gunshipsBySystemId = new Map<number, { ship_type_id: string; quantity: number }[]>();
  for (const g of gunshipRows) {
    if (!gunshipsBySystemId.has(g.system_id)) gunshipsBySystemId.set(g.system_id, []);
    gunshipsBySystemId.get(g.system_id)!.push({ ship_type_id: String(g.ship_type_id), quantity: g.quantity });
  }

  const systems = new Map<number, SystemData>();
  for (const row of readRows("SELECT * FROM systems")) {
    row.owner = row.owner || "";
    row.system_type = row.system_type || "system";
    row.current_population = row.current_population || 0;
    row.survey = row.survey || 0;
    row.tribute = row.tribute || 0;
    row.upkeep = row.upkeep || 0;
    row.resources = row.resources || 0;
    row.condition = row.condition || 0;
    row.morale = row.morale || 0;
    row.max_ground_defenses = row.max_ground_defenses || 0;
    row.current_ground_defenses = row.current_ground_defenses || 0;
    row.initial_condition = row.initial_condition ?? 40;
    row.planet_index = row.planet_index || 0;
    row.planet_type_id = row.planet_type_id || undefined;
    row.facilities = facBySystemId.get(row.system_id) || [];
    row.facilities_in_production = fipBySystemId.get(row.system_id) || [];
    row.stationed_fighters = fightersBySystemId.get(row.system_id) || [];
    row.stationed_gunships = gunshipsBySystemId.get(row.system_id) || [];
    systems.set(row.hex_id, row as SystemData);
  }

  // Read regions
  const regions: ProvinceRegion[] = [];
  for (const row of readRows("SELECT * FROM province_regions")) {
    row.is_system_allowed = !!row.is_system_allowed;
    regions.push(row as ProvinceRegion);
  }

  // Read facility types
  const facilityTypes: FacilityType[] = [];
  for (const row of readRows("SELECT * FROM facility_types")) {
    facilityTypes.push(row as FacilityType);
  }

  db.close();
  return { mapData, hexes, systems, regions, facilityTypes };
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
