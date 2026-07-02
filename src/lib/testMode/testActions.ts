/**
 * Test Mode actions — admin-only in-game edits that bypass normal rules.
 *
 * Every action performs the underlying DB write and inserts a `game_logs`
 * entry with `log_type = "test_mode_edit"` and `phase = "admin"` so the
 * change is auditable. All actions rely on the caller being an admin — the
 * UI gates them client-side and the game_logs / game_fleets / game_factions
 * / game_fleet_ships tables already restrict writes to admins.
 */
import { supabase } from "@/integrations/supabase/client";

interface LogArgs {
  gameId: string;
  turnNumber: number;
  message: string;
  details: Record<string, any>;
}

async function writeLog({ gameId, turnNumber, message, details }: LogArgs) {
  const { data: { user } } = await supabase.auth.getUser();
  await (supabase as any).from("game_logs").insert({
    game_id: gameId,
    turn_number: turnNumber,
    log_type: "test_mode_edit",
    phase: "admin",
    message: `TEST MODE: ${message}`,
    details_json: { ...details, admin_user_id: user?.id ?? null },
  });
}

export async function teleportFleet(args: {
  gameId: string; turnNumber: number;
  gameFleetId: string; fleetName: string;
  fromX: number; fromY: number; toX: number; toY: number;
}) {
  const { error } = await (supabase as any).from("game_fleets")
    .update({ hex_x: args.toX, hex_y: args.toY, dest_x: args.toX, dest_y: args.toY })
    .eq("id", args.gameFleetId);
  if (error) throw error;
  await writeLog({
    gameId: args.gameId, turnNumber: args.turnNumber,
    message: `teleported ${args.fleetName} from (${args.fromX},${args.fromY}) to (${args.toX},${args.toY})`,
    details: { game_fleet_id: args.gameFleetId, from: [args.fromX, args.fromY], to: [args.toX, args.toY] },
  });
}

export async function addShipsToFleet(args: {
  gameId: string; turnNumber: number;
  gameFleetId: string; fleetName: string;
  shipTypeId: string; shipTypeName: string; quantity: number;
  tacticalGroup?: string;
}) {
  const qty = Math.max(1, Math.floor(args.quantity));
  const group = args.tacticalGroup || "Core";
  const rows = Array.from({ length: qty }, () => ({
    game_fleet_id: args.gameFleetId,
    ship_type_id: args.shipTypeId,
    quantity: 1,
    tactical_group: group,
    current_hp: null,
    crippled: false,
  }));
  const { error } = await (supabase as any).from("game_fleet_ships").insert(rows);
  if (error) throw error;
  await writeLog({
    gameId: args.gameId, turnNumber: args.turnNumber,
    message: `added ${qty}× ${args.shipTypeName} to ${args.fleetName} (${group})`,
    details: { game_fleet_id: args.gameFleetId, ship_type_id: args.shipTypeId, quantity: qty, tactical_group: group },
  });
}

export async function removeFleetShipRow(args: {
  gameId: string; turnNumber: number;
  rowId: string; fleetName: string; shipTypeName: string;
}) {
  const { error } = await (supabase as any).from("game_fleet_ships")
    .delete().eq("id", args.rowId);
  if (error) throw error;
  await writeLog({
    gameId: args.gameId, turnNumber: args.turnNumber,
    message: `removed 1× ${args.shipTypeName} from ${args.fleetName}`,
    details: { row_id: args.rowId },
  });
}

export async function setTreasury(args: {
  gameId: string; turnNumber: number;
  gameFactionId: string; factionName: string;
  fromValue: number; toValue: number;
}) {
  const toValue = Math.max(0, Math.floor(args.toValue));
  const { error } = await (supabase as any).from("game_factions")
    .update({ treasury: toValue }).eq("id", args.gameFactionId);
  if (error) throw error;
  await writeLog({
    gameId: args.gameId, turnNumber: args.turnNumber,
    message: `set ${args.factionName} treasury ${args.fromValue} → ${toValue}`,
    details: { game_faction_id: args.gameFactionId, from: args.fromValue, to: toValue },
  });
}

export async function setFleetSupply(args: {
  gameId: string; turnNumber: number;
  gameFleetId: string; fleetName: string;
  fromValue: number; toValue: number;
}) {
  const toValue = Math.max(0, Math.floor(args.toValue));
  const { error } = await (supabase as any).from("game_fleets")
    .update({ current_supply: toValue }).eq("id", args.gameFleetId);
  if (error) throw error;
  await writeLog({
    gameId: args.gameId, turnNumber: args.turnNumber,
    message: `set ${args.fleetName} supply ${args.fromValue} → ${toValue}`,
    details: { game_fleet_id: args.gameFleetId, from: args.fromValue, to: toValue },
  });
}
