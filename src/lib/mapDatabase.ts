import initSqlJs, { Database } from "sql.js";
import {
  MapData,
  HexData,
  SystemData,
  ProvinceRegion,
  MapState,
  HexClassification,
  hexKey,
} from "./mapTypes";

let SQL: Awaited<ReturnType<typeof initSqlJs>> | null = null;

async function getSql() {
  if (!SQL) {
    console.log("[sql.js] Initializing with v1.8.0...");
    SQL = await initSqlJs({
      locateFile: (file: string) => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.8.0/${file}`,
    });
    console.log("[sql.js] Initialized successfully");
  }
  return SQL;
}

export async function loadMapFromFile(file: File): Promise<{ db: Database; state: MapState }> {
  const sqlJs = await getSql();
  const buf = await file.arrayBuffer();
  const db = new sqlJs.Database(new Uint8Array(buf));

  const state = readMapState(db);
  return { db, state };
}

export function readMapState(db: Database): MapState {
  // Read map
  const mapRows = db.exec("SELECT * FROM maps LIMIT 1");
  let mapData: MapData | null = null;
  if (mapRows.length > 0 && mapRows[0].values.length > 0) {
    const cols = mapRows[0].columns;
    const row = mapRows[0].values[0];
    const obj: any = {};
    cols.forEach((c, i) => (obj[c] = row[i]));
    mapData = obj as MapData;
  }

  // Read hexes
  const hexes = new Map<string, HexData>();
  const hexRows = db.exec("SELECT * FROM hexes");
  if (hexRows.length > 0) {
    const cols = hexRows[0].columns;
    for (const row of hexRows[0].values) {
      const obj: any = {};
      cols.forEach((c, i) => (obj[c] = row[i]));
      obj.has_system = !!obj.has_system;
      const hex = obj as HexData;
      hexes.set(hexKey(hex.x, hex.y), hex);
    }
  }

  // Read systems
  const systems = new Map<number, SystemData>();
  const sysRows = db.exec("SELECT * FROM systems");
  if (sysRows.length > 0) {
    const cols = sysRows[0].columns;
    for (const row of sysRows[0].values) {
      const obj: any = {};
      cols.forEach((c, i) => (obj[c] = row[i]));
      systems.set(obj.hex_id, obj as SystemData);
    }
  }

  // Read regions
  const regions: ProvinceRegion[] = [];
  const regRows = db.exec("SELECT * FROM province_regions");
  if (regRows.length > 0) {
    const cols = regRows[0].columns;
    for (const row of regRows[0].values) {
      const obj: any = {};
      cols.forEach((c, i) => (obj[c] = row[i]));
      obj.is_system_allowed = !!obj.is_system_allowed;
      regions.push(obj as ProvinceRegion);
    }
  }

  return { mapData, hexes, systems, regions };
}

export function updateHexClassification(
  db: Database,
  hexId: number,
  classification: HexClassification,
  regionId: number | null
) {
  db.run(
    "UPDATE hexes SET classification = ?, region_id = ? WHERE hex_id = ?",
    [classification, regionId, hexId]
  );
}

export function updateHexSystem(db: Database, hexId: number, hasSystem: boolean) {
  db.run("UPDATE hexes SET has_system = ? WHERE hex_id = ?", [hasSystem ? 1 : 0, hexId]);
}

export function addSystem(
  db: Database,
  mapId: number,
  hexId: number,
  name: string,
  classification: string,
  rank: number
) {
  db.run(
    "INSERT INTO systems (map_id, hex_id, system_name, classification, importance_rank) VALUES (?, ?, ?, ?, ?)",
    [mapId, hexId, name, classification, rank]
  );
  db.run("UPDATE hexes SET has_system = 1 WHERE hex_id = ?", [hexId]);
}

export function updateSystem(
  db: Database,
  hexId: number,
  name: string,
  rank: number
) {
  db.run(
    "UPDATE systems SET system_name = ?, importance_rank = ? WHERE hex_id = ?",
    [name, rank, hexId]
  );
}

export function removeSystem(db: Database, hexId: number) {
  db.run("DELETE FROM systems WHERE hex_id = ?", [hexId]);
  db.run("UPDATE hexes SET has_system = 0 WHERE hex_id = ?", [hexId]);
}

export function exportDatabase(db: Database): Uint8Array {
  return db.export();
}

export function getProvinceStats(state: MapState) {
  const stats: Record<string, { hexCount: number; systemCount: number }> = {};
  for (const hex of state.hexes.values()) {
    if (!stats[hex.classification]) stats[hex.classification] = { hexCount: 0, systemCount: 0 };
    stats[hex.classification].hexCount++;
    if (hex.has_system) stats[hex.classification].systemCount++;
  }
  return stats;
}
