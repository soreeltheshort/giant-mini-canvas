/**
 * Turn 0 — runs ONCE when a game transitions from "setup" to "active".
 *
 * Currently does just one thing:
 *   1. Visibility seeding — gives every player a baseline visibility set
 *      (Core + Marches + ALL Province systems) and pre-populates fog-of-war
 *      memory snapshots so all province planet locations are remembered
 *      from the very first turn.
 *
 * Designed as a single entry point so future "start of game" steps (e.g.
 * starting treasury, initial intel events, opening news feed entries) can
 * be added here without touching the AdminGames UI plumbing.
 *
 * Loads its own MapState from `games.map_data_json` so it never silently
 * no-ops when called before the admin UI has finished hydrating.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { MapState, HexData, SystemData } from "./mapTypes";
import { buildSystemSnapshot } from "./systemIntel";

interface TurnZeroResult {
  systemsSeeded: number;
  playersUpdated: number;
  intelRowsWritten: number;
  fleetsSupplied: number;
}

/**
 * Build the baseline visible_system_ids array. A system counts as baseline if
 * EITHER its own classification OR the underlying hex's classification is
 * Core / Marches / any Province. (Some maps tag the system with one and the
 * hex with the other; accept either to be robust.)
 */
function buildBaselineVisibleSystemIds(ms: MapState): number[] {
  const hexClassById = new Map<number, string>();
  for (const h of ms.hexes.values()) hexClassById.set(h.hex_id, h.classification);

  const isBaseline = (cls: string) =>
    cls === "CORE" || cls === "MARCHES" || cls.startsWith("PROVINCE_");

  const ids: number[] = [];
  for (const sys of ms.systems.values()) {
    const sysCls = (sys.classification || "").toUpperCase();
    const hexCls = (hexClassById.get(sys.hex_id) || "").toUpperCase();
    if (isBaseline(sysCls) || isBaseline(hexCls)) {
      ids.push(sys.system_id);
    }
  }
  return ids;
}

/** Rehydrate a MapState from the JSON blob stored on `games.map_data_json`. */
function deserializeMapState(json: any): MapState {
  return {
    mapData: json.mapData ?? null,
    hexes: new Map<string, HexData>(json.hexes ?? []),
    systems: new Map<number, SystemData>(json.systems ?? []),
    regions: json.regions ?? [],
    facilityTypes: json.facilityTypes ?? [],
    fleets: json.fleets ?? [],
  };
}

export async function runTurnZero(
  supabase: SupabaseClient<any>,
  gameId: string,
): Promise<TurnZeroResult> {
  // 1. Load mapState from the DB so we don't depend on UI state being hydrated.
  const { data: game } = await (supabase as any)
    .from("games")
    .select("map_data_json")
    .eq("id", gameId)
    .single();

  if (!game?.map_data_json || Object.keys(game.map_data_json).length === 0) {
    throw new Error("Turn 0 aborted: game has no map_data_json yet.");
  }
  const ms = deserializeMapState(game.map_data_json);

  // 2. Build baseline visibility (Core + Marches + all Provinces).
  const visibleIds = buildBaselineVisibleSystemIds(ms);

  // 3. Push to every player in the game.
  const { data: gamePlayers } = await (supabase as any)
    .from("game_players")
    .select("id")
    .eq("game_id", gameId);

  const players = (gamePlayers ?? []) as Array<{ id: string }>;
  for (const gp of players) {
    await (supabase as any)
      .from("game_players")
      .update({ visible_system_ids: visibleIds })
      .eq("id", gp.id);
  }

  // 4. Pre-populate fog-of-war memory: write a snapshot of every baseline
  //    system for every player so they have a "last known state" from turn 1.
  const visibleSet = new Set(visibleIds);
  const baselineSystems = Array.from(ms.systems.values()).filter(s => visibleSet.has(s.system_id));

  const intelRows: any[] = [];
  for (const gp of players) {
    for (const sys of baselineSystems) {
      intelRows.push({
        game_id: gameId,
        observer_player_id: gp.id,
        system_id: sys.system_id,
        last_seen_turn: 0,
        snapshot_json: buildSystemSnapshot(sys),
      });
    }
  }

  const CHUNK = 500;
  for (let i = 0; i < intelRows.length; i += CHUNK) {
    await (supabase as any)
      .from("player_system_intel")
      .upsert(intelRows.slice(i, i + CHUNK), { onConflict: "observer_player_id,system_id" });
  }

  // 5. Seed every fleet in the game with full supply (free of charge).
  //    Max supply = sum(ship.supply_pod * quantity) * supply_capacity_coefficient.
  const { data: capRow } = await (supabase as any)
    .from("combat_constants")
    .select("value")
    .eq("key", "supply_capacity_coefficient")
    .maybeSingle();
  const supplyCoefficient = Number(capRow?.value) || 10;

  const { data: gameFleets } = await (supabase as any)
    .from("game_fleets")
    .select("id, fleet_id, fleet_name")
    .eq("game_id", gameId);

  const { data: allShipTypes } = await (supabase as any)
    .from("ship_types").select("id, supply_pod");
  const supplyPodMap = new Map<string, number>();
  for (const st of (allShipTypes || [])) supplyPodMap.set(st.id, Number(st.supply_pod) || 0);

  let fleetsSupplied = 0;
  for (const gf of (gameFleets || [])) {
    const { data: ships } = await (supabase as any)
      .from("game_fleet_ships")
      .select("ship_type_id, quantity")
      .eq("game_fleet_id", gf.id);
    const totalSupplyPods = (ships || []).reduce(
      (sum: number, r: any) => sum + (supplyPodMap.get(r.ship_type_id) || 0) * (Number(r.quantity) || 0),
      0,
    );
    const maxSupplies = totalSupplyPods * supplyCoefficient;
    if (maxSupplies <= 0) continue;
    await (supabase as any).from("fleets")
      .update({ current_supply: maxSupplies })
      .eq("id", gf.fleet_id);
    fleetsSupplied++;
  }

  // 6. Log it for auditability.
  await (supabase as any).from("game_logs").insert({
    game_id: gameId,
    turn_number: 0,
    phase: "turn_zero",
    log_type: "turn_zero_complete",
    message: `Turn 0 complete: ${visibleIds.length} systems seeded for ${players.length} player(s); ${fleetsSupplied} fleet(s) supplied.`,
    details_json: {
      systems_seeded: visibleIds.length,
      players_updated: players.length,
      intel_rows: intelRows.length,
      fleets_supplied: fleetsSupplied,
    },
  });

  return {
    systemsSeeded: visibleIds.length,
    playersUpdated: players.length,
    intelRowsWritten: intelRows.length,
    fleetsSupplied,
  };
}
