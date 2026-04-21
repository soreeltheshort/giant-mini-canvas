/**
 * Shared battle setup helpers.
 *
 * Both the Battle Simulator (src/pages/Battle.tsx) and the in-game combat
 * phase (src/lib/turnProcessor/phases/combat.ts) build the same inputs for
 * `runBattle()`. To guarantee identical results in both contexts, all
 * non-engine logic (snapshot loading, config loading, ground-unit calc)
 * lives here.
 *
 * Anything that affects battle outcomes MUST go through these helpers — do
 * not duplicate fleet/config loading elsewhere.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  FleetSnapshot,
  FleetShipData,
  ShipTypeData,
  PhaseConfig,
  GroupModConfig,
  CombatConstants,
  WeaponTargetPref,
  GroundCombatOutcome,
} from "@/lib/battleEngine";

export interface FleetCompositionRow {
  id: string;
  /** Source table the row lives in. Combat must write back to the same table. */
  source: "fleet_ships" | "game_fleet_ships";
  /** parent id (fleet_id for fleet_ships, game_fleet_id for game_fleet_ships) */
  parent_id: string;
  ship_type_id: string;
  quantity: number;
  tactical_group: string;
}

export interface LoadedFleet {
  snapshot: FleetSnapshot;
  /** Raw composition rows — used by the turn processor to apply losses. */
  rows: FleetCompositionRow[];
}

export interface BattleConfigBundle {
  phases: PhaseConfig[] | undefined;
  groupMods: GroupModConfig[] | undefined;
  combatConsts: CombatConstants | undefined;
  weaponPrefs: WeaponTargetPref[] | undefined;
  groundOutcomes: GroundCombatOutcome[] | undefined;
}

/**
 * Load a single fleet snapshot the same way the Battle simulator does.
 *
 * - Fleet metadata (name, readiness) ALWAYS comes from the source `fleets` row.
 * - Ship composition source depends on context:
 *     - If `gameFleetId` is provided, ships are loaded from `game_fleet_ships`
 *       (the per-game roster) and the returned rows carry that id so combat
 *       writebacks land in `game_fleet_ships`. Player saved fleets are not
 *       mutated by combat — that was the previous bug.
 *     - Otherwise (Battle Simulator, Fleet Builder previews) ships are loaded
 *       from `fleet_ships` keyed by the source fleet id.
 */
export async function loadFleetSnapshot(
  supabase: SupabaseClient,
  fleetId: string,
  gameFleetId?: string,
): Promise<LoadedFleet | null> {
  const { data: fleet } = await (supabase as any)
    .from("fleets")
    .select("id, name, readiness")
    .eq("id", fleetId)
    .maybeSingle();
  if (!fleet) return null;

  let ships: any[] = [];
  let source: "fleet_ships" | "game_fleet_ships" = "fleet_ships";
  let parentId = fleetId;

  if (gameFleetId) {
    source = "game_fleet_ships";
    parentId = gameFleetId;
    const { data } = await (supabase as any)
      .from("game_fleet_ships")
      .select("id, game_fleet_id, ship_type_id, quantity, tactical_group, ship_types(*)")
      .eq("game_fleet_id", gameFleetId);
    ships = data || [];
  } else {
    const { data } = await (supabase as any)
      .from("fleet_ships")
      .select("id, fleet_id, ship_type_id, quantity, tactical_group, ship_types(*)")
      .eq("fleet_id", fleetId);
    ships = data || [];
  }

  const rows: FleetCompositionRow[] = ships
    .filter((s: any) => s.quantity > 0 && s.ship_types)
    .map((s: any) => ({
      id: s.id,
      source,
      parent_id: parentId,
      ship_type_id: s.ship_type_id,
      quantity: s.quantity,
      tactical_group: s.tactical_group,
    }));

  const shipsForSnap: FleetShipData[] = ships
    .filter((s: any) => s.quantity > 0 && s.ship_types)
    .map((s: any) => ({
      ship_type: s.ship_types as ShipTypeData,
      quantity: s.quantity,
      tactical_group: s.tactical_group,
    }));

  return {
    snapshot: { id: fleet.id, name: fleet.name, readiness: fleet.readiness ?? 2, ships: shipsForSnap },
    rows,
  };
}

/** Load the full battle config (phases, modifiers, constants, etc.) from DB. */
export async function loadBattleConfig(supabase: SupabaseClient): Promise<BattleConfigBundle> {
  const [
    { data: phasesData },
    { data: modsData },
    { data: constsData },
    { data: weaponPrefsData },
    { data: groundOutcomesData },
  ] = await Promise.all([
    (supabase as any).from("battle_phases").select("*").order("seq_order"),
    (supabase as any).from("group_modifiers").select("*"),
    (supabase as any).from("combat_constants").select("*"),
    (supabase as any).from("weapon_target_preferences").select("*").order("priority"),
    (supabase as any).from("ground_combat_outcomes").select("*").order("probability"),
  ]);

  const phases: PhaseConfig[] | undefined = (phasesData || []).map((p: any) => ({
    name: p.name, groupsA: p.groups_a, groupsB: p.groups_b,
    modA: Number(p.mod_a), modB: Number(p.mod_b),
    requiredGroup: p.required_group ?? null,
  }));
  const groupMods: GroupModConfig[] | undefined = (modsData || []).map((g: any) => ({
    group_name: g.group_name, attack_mod: Number(g.attack_mod), defense_mod: Number(g.defense_mod),
  }));
  const combatConsts: CombatConstants | undefined = constsData
    ? (constsData as any[]).reduce((acc, row) => { (acc as any)[row.key] = Number(row.value); return acc; }, {} as CombatConstants)
    : undefined;
  const weaponPrefs: WeaponTargetPref[] | undefined = (weaponPrefsData || []).map((w: any) => ({
    weapon_key: w.weapon_key, hull_class: w.hull_class, priority: w.priority,
  }));
  const groundOutcomes: GroundCombatOutcome[] | undefined = (groundOutcomesData || []).map((o: any) => ({
    probability: Number(o.probability), damage: Number(o.damage),
  }));

  return { phases, groupMods, combatConsts, weaponPrefs, groundOutcomes };
}

/** Sum of ground_invasion across "Attack Planet" tactical group ships. */
export function calcGroundUnits(snap: FleetSnapshot): number {
  return snap.ships
    .filter(s => s.tactical_group === "Attack Planet")
    .reduce((sum, s) => sum + (s.ship_type.ground_invasion || 0) * s.quantity, 0);
}
