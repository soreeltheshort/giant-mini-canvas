/**
 * Fork a new game from an existing game's snapshot.
 *
 * Preserves the original game and creates a branched copy at the snapshot's
 * point in time. The fork carries lineage back to its parent so the Games
 * list can group branches and show their relationship.
 *
 * What is copied:
 *  - `map_data_json` and `turn_number` from the snapshot row
 *  - `game_factions` rows from the *parent* game (players/AI/treasury/etc.)
 *  - Per-game fleet roster re-materialized from the snapshot map JSON
 *
 * What is NOT copied (matches existing snapshot-restore behavior):
 *  - `player_orders`, `player_system_intel`, `player_fleet_intel`, `game_logs`,
 *    `battle_runs`. Branches start with a clean history.
 */
import { supabase } from "@/integrations/supabase/client";
import { materializeGameFleets } from "@/lib/materializeGameFleets";
import { SystemData, MapState, MapFleet } from "@/lib/mapTypes";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function deserializeMapState(json: any): MapState {
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

/**
 * Compute a branch name like "Game050:SS04". If a sibling with the same name
 * already exists, append " (b)", " (c)", ... until unique.
 */
async function computeBranchName(parentName: string, snapshotLabel: string): Promise<string> {
  // Compact the snapshot label to "SS<n>" if it follows the standard pattern,
  // otherwise embed the raw label.
  let suffix = snapshotLabel.trim();
  const turnMatch = suffix.match(/turn\s+(\d+)/i);
  if (turnMatch) suffix = `SS${String(turnMatch[1]).padStart(2, "0")}`;
  else if (/^ss\d+$/i.test(suffix)) suffix = suffix.toUpperCase();
  else suffix = `SS-${suffix.replace(/\s+/g, "_").slice(0, 16)}`;

  const base = `${parentName}:${suffix}`;
  const { data: existing } = await (supabase as any)
    .from("games")
    .select("name")
    .ilike("name", `${base}%`);
  const used = new Set<string>(((existing as any[]) || []).map((r) => r.name));
  if (!used.has(base)) return base;
  // a, b, c... we already used the un-suffixed one (treated as "a")
  for (let i = 1; i < 26; i++) {
    const letter = String.fromCharCode(97 + i); // b, c, ...
    const candidate = `${base} (${letter})`;
    if (!used.has(candidate)) return candidate;
  }
  return `${base} (${Date.now()})`;
}

export interface ForkResult {
  newGameId: string;
  newGameName: string;
  fleetsCreated: number;
  fleetsReused: number;
  factionsCopied: number;
}

export async function forkGameFromSnapshot(params: {
  parentGameId: string;
  snapshotId: string;
  createdBy: string;
}): Promise<ForkResult> {
  const { parentGameId, snapshotId, createdBy } = params;

  // Load parent game + snapshot
  const [{ data: parent, error: parentErr }, { data: snap, error: snapErr }] = await Promise.all([
    (supabase as any).from("games").select("id, name, status").eq("id", parentGameId).single(),
    (supabase as any).from("game_snapshots").select("id, turn_number, label, map_data_json").eq("id", snapshotId).single(),
  ]);
  if (parentErr || !parent) throw new Error(`Parent game not found: ${parentErr?.message || "missing"}`);
  if (snapErr || !snap) throw new Error(`Snapshot not found: ${snapErr?.message || "missing"}`);

  // Reset fleet_ids in the snapshot's map JSON so materializeGameFleets will
  // create fresh game_fleets rows for the new game (instead of reusing the
  // parent's game_fleets ids).
  const parsedMap: MapState = deserializeMapState(snap.map_data_json);
  const resetFleets: MapFleet[] = (parsedMap.fleets || []).map((fl) => {
    const source = UUID_RE.test(fl.source_fleet_id || "")
      ? fl.source_fleet_id
      : (UUID_RE.test(fl.fleet_id) ? fl.fleet_id : fl.fleet_id);
    // Wipe the per-game UUID; keep source_fleet_id (template) so
    // materializeGameFleets can re-insert.
    return { ...fl, fleet_id: source!, source_fleet_id: source };
  });
  const resetMapState: MapState = { ...parsedMap, fleets: resetFleets };

  const branchName = await computeBranchName(parent.name, snap.label || `Turn ${snap.turn_number}`);

  // Insert the new game row with serialized map (without materialized fleets yet)
  const initialSerialized = serializeMapState(resetMapState);
  const now = new Date().toISOString();
  const { data: newGame, error: insertErr } = await (supabase as any)
    .from("games")
    .insert({
      name: branchName,
      created_by: createdBy,
      status: parent.status === "completed" ? "paused" : parent.status,
      turn_number: snap.turn_number,
      turn_phase: "orders",
      map_data_json: initialSerialized,
      parent_game_id: parentGameId,
      parent_snapshot_id: snapshotId,
      forked_at: now,
      last_opened_at: now,
    })
    .select("id")
    .single();
  if (insertErr || !newGame?.id) throw new Error(`Fork insert failed: ${insertErr?.message || "no id"}`);

  const newGameId: string = newGame.id;

  // Copy game_factions from parent (reset per-turn order locks)
  const { data: parentFactions } = await (supabase as any)
    .from("game_factions")
    .select("user_id, faction_id, player_slot, initialized, visible_system_ids, treasury, last_tribute, last_maintenance, admin_capability, combat_capability, admin_points_remaining, combat_points_remaining, is_ai, ai_persona_id, scouted_hex_ids")
    .eq("game_id", parentGameId);
  let factionsCopied = 0;
  if (parentFactions && parentFactions.length > 0) {
    const rows = parentFactions.map((pf: any) => ({
      ...pf,
      game_id: newGameId,
      orders_locked: false,
    }));
    const { error: factErr } = await (supabase as any).from("game_factions").insert(rows);
    if (factErr) console.warn("[forkGameFromSnapshot] game_factions copy failed:", factErr.message);
    else factionsCopied = rows.length;
  }

  // Re-materialize fleets for the new game; this rewrites map fleet_ids and
  // creates game_fleets + (via trigger) game_fleet_ships.
  const { updatedMap, created, reused } = await materializeGameFleets(newGameId, resetMapState);
  const finalSerialized = serializeMapState(updatedMap);
  await (supabase as any).from("games").update({ map_data_json: finalSerialized }).eq("id", newGameId);

  // Lineage log entry on the new game
  await (supabase as any).from("game_logs").insert({
    game_id: newGameId,
    turn_number: snap.turn_number,
    log_type: "game_forked",
    message: `Forked from "${parent.name}" snapshot "${snap.label}" (turn ${snap.turn_number}).`,
    details_json: { parent_game_id: parentGameId, parent_snapshot_id: snapshotId },
  });

  return {
    newGameId,
    newGameName: branchName,
    fleetsCreated: created,
    fleetsReused: reused,
    factionsCopied,
  };
}

/** Update last_opened_at on a game (best-effort, errors swallowed). */
export async function touchGameLastOpened(gameId: string): Promise<void> {
  try {
    await (supabase as any)
      .from("games")
      .update({ last_opened_at: new Date().toISOString() })
      .eq("id", gameId);
  } catch (e) {
    console.warn("[touchGameLastOpened] failed", e);
  }
}
