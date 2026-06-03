/**
 * gameLifecycle — shared start-game and process-turn helpers usable by both
 * the Admin Games page and the Tester Dashboard. Loads everything they need
 * from the DB so callers do not have to thread mapState/facilityTypes/shipTypes
 * through React state.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { MapState, SystemData } from "./mapTypes";
import { runTurnZero } from "./turnZero";
import { runTurnProcessor } from "./turnProcessor";
import { processNextTurn, DEFAULT_TURN_CONSTANTS, type ShipTypeForUpkeep } from "./turnEngine";
import { ownerToEconKey, rowEconKey } from "./turnProcessor/ownerKey";

const PROVINCE_NAMES: Record<number, string> = {
  1: "Valerian", 2: "Aurelian", 3: "Cassian",
  4: "Dravian", 5: "Marcellan", 6: "Octavian",
};
const STARTING_TREASURY = 300;

function serializeMapState(state: MapState): any {
  return {
    mapData: state.mapData,
    hexes: Array.from(state.hexes.entries()),
    systems: Array.from(state.systems.entries()),
    regions: state.regions,
    facilityTypes: state.facilityTypes,
    fleets: state.fleets || [],
  };
}

export function deserializeMapState(json: any): MapState {
  const systems = new Map<number, SystemData>();
  const rawEntries: Array<[any, SystemData]> = Array.isArray(json.systems) ? json.systems : [];
  for (const [, sys] of rawEntries) {
    if (sys && typeof sys.system_id === "number" && !systems.has(sys.system_id)) {
      systems.set(sys.system_id, sys);
    }
  }
  return {
    mapData: json.mapData,
    hexes: new Map(json.hexes),
    systems,
    regions: json.regions || [],
    facilityTypes: json.facilityTypes || [],
    fleets: json.fleets || [],
  };
}

async function loadGameContext(supabase: SupabaseClient, gameId: string) {
  const [{ data: g }, { data: ft }, { data: st }] = await Promise.all([
    (supabase as any).from("games").select("id, name, status, turn_number, map_data_json").eq("id", gameId).single(),
    (supabase as any).from("facility_types").select("*"),
    (supabase as any).from("ship_types").select("id, name, class, maintenance"),
  ]);
  if (!g) throw new Error("Game not found");
  if (!g.map_data_json || Object.keys(g.map_data_json).length === 0) {
    throw new Error("Game has no map. Import a map first.");
  }
  const mapState = deserializeMapState(g.map_data_json);
  const facilityTypes = (ft || []).map((f: any) => ({
    facility_type_id: f.id,
    name: f.name,
    description: f.description,
    icon: f.icon,
    cost: f.cost,
    maintenance: f.maintenance,
    turns_to_build: f.turns_to_build,
    max_per_system: f.max_per_system,
    consumed_facility_id: f.consumed_facility_id,
    fighter_capacity: f.fighter_capacity,
    gunship_capacity: f.gunship_capacity,
    ground_defense_bonus: f.ground_defense_bonus,
    survey_bonus: f.survey_bonus,
    tribute_percent: f.tribute_percent,
    tribute_flat: f.tribute_flat,
    construction_kickback: f.construction_kickback,
    condition_bonus: f.condition_bonus,
  }));
  const shipTypes: ShipTypeForUpkeep[] = (st || []).map((s: any) => ({
    id: s.id, name: s.name, class: s.class, maintenance: Number(s.maintenance),
  }));
  return { game: g, mapState, facilityTypes, shipTypes };
}

async function addLog(supabase: SupabaseClient, gameId: string, turn: number, type: string, message: string) {
  await (supabase as any).from("game_logs").insert({
    game_id: gameId, turn_number: turn, log_type: type, message, details_json: {},
  });
}

/**
 * Make sure every faction that should have a turn in this game has a row in
 * `game_players`:
 *  - Every faction with an `ai_persona_id` gets a row, regardless of whether
 *    it owns systems on this map (AI factions always process turns; the
 *    per-turn pipeline takes a no-op fast path when they have no holdings).
 *  - Every map-owner classification that resolves to a faction also gets a
 *    row. For human-player slots we back-fill `faction_id` / `ai_persona_id`
 *    on the row the lobby join flow already inserted.
 *  - Idempotent: AI/neutral rows are keyed by `(game_id, faction_id)` via the
 *    existing unique index; human rows are keyed by `player_slot`.
 */
export async function seedFactionPlayers(
  supabase: SupabaseClient,
  gameId: string,
  mapState: MapState,
): Promise<{ inserted: number; backfilled: number; skipped: number }> {
  const nameToSlot = new Map<string, number>();
  for (const [slot, name] of Object.entries(PROVINCE_NAMES)) nameToSlot.set(name.toLowerCase(), parseInt(slot, 10));

  const { data: factionRows } = await (supabase as any)
    .from("factions")
    .select("id, name, code_name, ai_persona_id");
  const factions = (factionRows || []) as Array<{ id: string; name: string; code_name: string | null; ai_persona_id: string | null }>;

  const findFaction = (ownerClass: string) => {
    const lc = ownerClass.toLowerCase();
    return (
      factions.find((f) => (f.code_name || "").toLowerCase() === lc) ||
      factions.find((f) => f.name.toLowerCase() === lc) ||
      null
    );
  };
  const ownerSlot = (ownerClass: string): number | null => {
    const m = ownerClass.match(/PROVINCE_(\d+)/i);
    if (m) return parseInt(m[1], 10);
    const s = nameToSlot.get(ownerClass.toLowerCase());
    return s ?? null;
  };

  const { data: existing } = await (supabase as any)
    .from("game_factions")
    .select("id, player_slot, faction_id, user_id")
    .eq("game_id", gameId);
  const existingRows = (existing || []) as Array<{ id: string; player_slot: number | null; faction_id: string | null; user_id: string | null }>;

  const bySlot = new Map<number, typeof existingRows[number]>();
  const byFactionNoUser = new Map<string, typeof existingRows[number]>();
  for (const r of existingRows) {
    if (r.player_slot != null) bySlot.set(r.player_slot, r);
    if (r.faction_id && !r.user_id) byFactionNoUser.set(r.faction_id, r);
  }

  let inserted = 0;
  let backfilled = 0;
  let skipped = 0;

  const insertFactionRow = async (faction: { id: string; ai_persona_id: string | null }, isAi: boolean) => {
    const { error } = await (supabase as any).from("game_factions").insert({
      game_id: gameId,
      faction_id: faction.id,
      ai_persona_id: faction.ai_persona_id,
      is_ai: isAi,
      user_id: null,
      player_slot: null,
      treasury: 0,
      admin_capability: 3,
      combat_capability: 3,
      admin_points_remaining: 3,
      combat_points_remaining: 3,
      orders_locked: false,
      initialized: true,
      visible_system_ids: [],
    });
    if (!error) {
      inserted++;
      byFactionNoUser.set(faction.id, { id: "", player_slot: null, faction_id: faction.id, user_id: null });
    }
  };

  // Pass A — every AI-bearing faction must have a row, regardless of holdings.
  for (const faction of factions) {
    if (!faction.ai_persona_id) continue;
    if (byFactionNoUser.has(faction.id)) { skipped++; continue; }
    const slot = nameToSlot.get((faction.code_name || faction.name).toLowerCase()) ?? null;
    if (slot != null && bySlot.has(slot)) {
      const row = bySlot.get(slot)!;
      if (!row.faction_id) {
        await (supabase as any).from("game_factions").update({
          faction_id: faction.id, ai_persona_id: faction.ai_persona_id,
        }).eq("id", row.id);
        backfilled++;
      } else {
        skipped++;
      }
      continue;
    }
    await insertFactionRow(faction, true);
  }

  // Pass B — map-owner classifications (neutral factions owning systems, plus
  // faction_id back-fill for human player slots).
  const owners = new Set<string>();
  for (const sys of mapState.systems.values()) {
    const o = (sys.owner || "").trim();
    if (!o || o.toLowerCase() === "unowned") continue;
    owners.add(o);
  }
  for (const owner of owners) {
    const faction = findFaction(owner);
    if (!faction) continue;
    const slot = ownerSlot(owner);

    if (slot != null && bySlot.has(slot)) {
      const row = bySlot.get(slot)!;
      if (!row.faction_id) {
        await (supabase as any).from("game_factions").update({
          faction_id: faction.id, ai_persona_id: faction.ai_persona_id,
        }).eq("id", row.id);
        backfilled++;
      }
      continue;
    }
    if (byFactionNoUser.has(faction.id)) continue;
    await insertFactionRow(faction, !!faction.ai_persona_id);
  }

  return { inserted, backfilled, skipped };
}

/**
 * Start a game (setup → active). Runs Turn 0 (visibility seeding), computes
 * Turn 1 economics for each player, sets starting treasury, and rolls any
 * setup-phase orders forward.
 */
export async function startGame(supabase: SupabaseClient, gameId: string) {
  const { game, mapState, facilityTypes, shipTypes } = await loadGameContext(supabase, gameId);
  if (game.status !== "setup") throw new Error(`Cannot start a game in status "${game.status}".`);

  await runTurnZero(supabase as any, gameId);
  await (supabase as any).from("games").update({ status: "active", turn_number: 1, turn_phase: "orders" }).eq("id", gameId);
  await (supabase as any).from("player_orders").update({ turn_number: 1 }).eq("game_id", gameId).eq("turn_number", 0);

  // Seed game_players rows for every faction present on the map (AI + neutral
  // included). Human-player rows already exist from the lobby join flow and
  // get their faction_id back-filled here. This lets non-player factions
  // process turns and appear in the AI Inspector dropdown.
  await seedFactionPlayers(supabase, gameId, mapState);

  // Load faction catalog (used to map owner strings → faction id for AI/neutral).
  const { data: factionsRaw } = await (supabase as any).from("factions").select("id, name, code_name");
  const factions = (factionsRaw || []) as Array<{ id: string; name: string; code_name: string | null }>;

  // Per-system tribute & maintenance, keyed by `slot:N` or `faction:<UUID>`.
  const playerEcon = new Map<string, { tribute: number; maintenance: number }>();
  const systems = Array.from(mapState.systems.values());
  for (const sys of systems.filter(s => s.current_population > 0 && s.owner && s.owner.toLowerCase() !== "unowned")) {
    const result = processNextTurn(sys, facilityTypes as any, DEFAULT_TURN_CONSTANTS, 0, shipTypes);
    const key = ownerToEconKey(sys.owner, factions);
    if (key) {
      const e = playerEcon.get(key) || { tribute: 0, maintenance: 0 };
      e.tribute += result.tributeBreakdown.totalTribute;
      e.maintenance += result.upkeepBreakdown.totalUpkeep;
      playerEcon.set(key, e);
    }
  }

  // Fleet maintenance from per-game roster
  const { data: gameFleets } = await (supabase as any).from("game_fleets").select("id, fleet_id, owner_classification").eq("game_id", gameId);
  if (gameFleets?.length) {
    const ids = gameFleets.map((gf: any) => gf.id);
    const [{ data: fs }, { data: allSt }] = await Promise.all([
      (supabase as any).from("game_fleet_ships").select("game_fleet_id, ship_type_id, quantity").in("game_fleet_id", ids),
      (supabase as any).from("ship_types").select("id, maintenance"),
    ]);
    const maintMap = new Map<string, number>((allSt || []).map((s: any) => [s.id, Number(s.maintenance)]));
    for (const gf of gameFleets) {
      const key = ownerToEconKey(gf.owner_classification, factions);
      if (!key) continue;
      const ships = (fs || []).filter((x: any) => x.game_fleet_id === gf.id);
      let maint = 0;
      for (const s of ships) maint += (maintMap.get(s.ship_type_id) || 0) * s.quantity;
      const e = playerEcon.get(key) || { tribute: 0, maintenance: 0 };
      e.maintenance += maint;
      playerEcon.set(key, e);
    }
  }

  // Apply starting treasury & econ to each player
  const { data: gps } = await (supabase as any).from("game_factions").select("id, player_slot, faction_id, admin_capability, combat_capability").eq("game_id", gameId);
  for (const gp of (gps || [])) {
    const key = rowEconKey(gp);
    const econ = (key && playerEcon.get(key)) || { tribute: 0, maintenance: 0 };
    const tributeInt = Math.round(econ.tribute);
    const maintInt = Math.round(econ.maintenance);
    const { error: updErr } = await (supabase as any).from("game_factions").update({
      orders_locked: false,
      treasury: STARTING_TREASURY,
      last_tribute: tributeInt,
      last_maintenance: maintInt,
      admin_points_remaining: gp.admin_capability || 3,
      combat_points_remaining: gp.combat_capability || 3,
    }).eq("id", gp.id);
    if (updErr) console.warn(`[startGame] update failed key=${key}:`, updErr.message);
  }

  await addLog(supabase, gameId, 1, "status_changed", `Game started — Turn 1 orders phase. Starting treasury: ${STARTING_TREASURY}.`);
}

/**
 * Process the current turn for a game. Mirrors AdminGames.runTurn().
 */
export async function processTurn(supabase: SupabaseClient, gameId: string) {
  const { game, mapState, facilityTypes, shipTypes } = await loadGameContext(supabase, gameId);
  if (game.status !== "active") throw new Error(`Cannot process a turn for a game in status "${game.status}".`);

  await (supabase as any).from("games").update({ turn_phase: "processing" }).eq("id", gameId);

  const currentTurn = game.turn_number;
  const nextTurn = currentTurn + 1;

  const result = await runTurnProcessor({
    supabase: supabase as any,
    gameId,
    currentTurn,
    mapState,
    facilityTypes: facilityTypes as any,
    shipTypes,
  });

  const serialized = serializeMapState(result.mapState);
  await (supabase as any).from("games").update({
    map_data_json: serialized,
    turn_number: nextTurn,
    turn_phase: "orders",
  }).eq("id", gameId);

  const { data: gps } = await (supabase as any).from("game_factions").select("id, player_slot, faction_id, treasury, admin_capability, combat_capability").eq("game_id", gameId);
  for (const gp of (gps || [])) {
    const key = rowEconKey(gp);
    const econ = (key && result.playerEcon.get(key)) || { tribute: 0, maintenance: 0 };
    const tributeInt = Math.round(econ.tribute);
    const maintInt = Math.round(econ.maintenance);
    const newTreasury = (gp.treasury || 0) + tributeInt - maintInt;
    const { error: updErr } = await (supabase as any).from("game_factions").update({
      orders_locked: false,
      treasury: newTreasury,
      last_tribute: tributeInt,
      last_maintenance: maintInt,
      admin_points_remaining: gp.admin_capability || 3,
      combat_points_remaining: gp.combat_capability || 3,
    }).eq("id", gp.id);
    if (updErr) console.warn(`[processTurn] update failed key=${key}:`, updErr.message);
  }

  await addLog(supabase, gameId, currentTurn, "turn_processed",
    `Turn ${currentTurn} processed (${result.logsInserted} log entries). Now accepting orders for Turn ${nextTurn}.`);

  return { currentTurn, nextTurn };
}

export { PROVINCE_NAMES };
