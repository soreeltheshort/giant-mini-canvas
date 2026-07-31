/**
 * Starbases
 *
 * A starbase is a player-built map entity stored as a `SystemData` record with
 * `system_type === "station"`. It reuses the system pipeline (facilities,
 * garrison, intel, ownership, rendering) but differs in three ways:
 *
 *   1. It is CONSTRUCTED — `build_turns_remaining > 0` marks a construction
 *      site that has no economy and cannot fight.
 *   2. It has NO innate population/tribute. Everything comes from facilities
 *      (`population_bonus`, `tribute_flat`, `tribute_percent`, `maintenance`).
 *   3. It FIGHTS as a single Core-group combatant whose hull, armour and
 *      weapon mounts are the sum of its facilities' combat columns. When its
 *      hull reaches zero the starbase is destroyed (never captured).
 *
 * Starbases may only be founded on an EMPTY hex inside the founder's supply
 * grid. Cost/turns/admin cost come from `combat_constants`
 * (`starbase_build_cost`, `starbase_build_turns`, `starbase_admin_cost`) and
 * are editable in Assets → Factions Config → Combat Constants.
 */
import type { SystemData } from "./mapTypes";
import { FACILITY_WEAPON_KEYS } from "@/hooks/useFacilityTypes";

export const STARBASE_DEFAULTS = {
  build_turns: 3,
  build_cost: 200,
  admin_cost: 1,
};

export interface StarbaseFacilityCombatRow {
  id: string;
  hull_points?: number | null;
  armor?: number | null;
  population_bonus?: number | null;
  [key: string]: any;
}

export function isStarbase(sys: { system_type?: string | null } | null | undefined): boolean {
  return (sys?.system_type || "system") === "station";
}

/** True while the starbase is still under construction. */
export function isUnderConstruction(sys: { build_turns_remaining?: number } | null | undefined): boolean {
  return (sys?.build_turns_remaining || 0) > 0;
}

export interface StarbaseCombatStats {
  maxHull: number;
  armor: number;
  weapons: Record<string, number>;
  /** True when the starbase has at least one weapon mount. */
  armed: boolean;
}

/** Sum the combat contribution of every facility present on the starbase. */
export function computeStarbaseCombatStats(
  sys: SystemData,
  facilityTypes: StarbaseFacilityCombatRow[],
): StarbaseCombatStats {
  const byId = new Map(facilityTypes.map((f) => [String(f.id), f]));
  const weapons: Record<string, number> = {};
  let maxHull = 0;
  let armor = 0;
  for (const f of sys.facilities || []) {
    const ft = byId.get(String(f.facility_type_id));
    if (!ft) continue;
    const qty = Math.max(1, Number(f.quantity) || 1);
    maxHull += (Number(ft.hull_points) || 0) * qty;
    armor = Math.max(armor, Number(ft.armor) || 0);
    for (const k of FACILITY_WEAPON_KEYS) {
      const n = (Number((ft as any)[k]) || 0) * qty;
      if (n > 0) weapons[k] = (weapons[k] || 0) + n;
    }
  }
  return { maxHull, armor, weapons, armed: Object.keys(weapons).length > 0 };
}

/** Population contributed by facilities (starbases have no innate population). */
export function computeStarbasePopulation(
  sys: SystemData,
  facilityTypes: StarbaseFacilityCombatRow[],
): number {
  const byId = new Map(facilityTypes.map((f) => [String(f.id), f]));
  let pop = 0;
  for (const f of sys.facilities || []) {
    const ft = byId.get(String(f.facility_type_id));
    if (!ft) continue;
    pop += (Number(ft.population_bonus) || 0) * Math.max(1, Number(f.quantity) || 1);
  }
  return pop;
}

/**
 * Synthetic ship type representing the starbase in the battle engine.
 * Zero speed in every virtual-speed slot — a starbase never manoeuvres.
 */
export function starbaseShipType(sys: SystemData, stats: StarbaseCombatStats): any {
  return {
    id: `starbase-${sys.system_id}`,
    name: sys.system_name || "Starbase",
    class: "Starbase",
    hull_class: "STATION",
    point_cost: 0,
    hull: Math.max(1, stats.maxHull),
    armor: stats.armor,
    sensor_rating: 0,
    cbt_speed: 0,
    map_speed: 0,
    target_preference: "",
    ...stats.weapons,
    fighter_bay: 0, fighter_storage: 0, gun_ship_link: 0, gunship_storage: 0,
    ground_invasion: 0, repair_pod: 0, supply_pod: 0, scout_sensors: 0,
    virtual_atk_speed_core: 0, virtual_def_speed_core: 0,
  };
}

/** Battle-engine fleet snapshot for a starbase (one Core-group combatant). */
export function starbaseSnapshot(sys: SystemData, stats: StarbaseCombatStats): any {
  const shipType = starbaseShipType(sys, stats);
  const currentHull = sys.current_hull == null ? shipType.hull : Math.max(0, Number(sys.current_hull));
  return {
    id: `starbase-${sys.system_id}`,
    name: sys.system_name || "Starbase",
    readiness: 2,
    ships: [
      {
        ship_type: shipType,
        quantity: 1,
        tactical_group: "Core",
        instances: [{ sourceRowId: `starbase-${sys.system_id}`, currentHull, crippled: false }],
      },
    ],
  };
}

/** Read a starbase constant out of the loaded combat_constants map. */
export function starbaseConstant(
  consts: Record<string, number> | undefined | null,
  key: "starbase_build_turns" | "starbase_build_cost" | "starbase_admin_cost",
): number {
  const fallback =
    key === "starbase_build_turns" ? STARBASE_DEFAULTS.build_turns
    : key === "starbase_build_cost" ? STARBASE_DEFAULTS.build_cost
    : STARBASE_DEFAULTS.admin_cost;
  const v = consts?.[key];
  return Number.isFinite(v as number) ? Number(v) : fallback;
}
