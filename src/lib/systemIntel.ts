/**
 * Builds the persisted "last known state" snapshot of a system stored in
 * player_system_intel.snapshot_json. Keep this stable: the player UI reads
 * it directly to render fog-of-war memory.
 *
 * Only includes fields that make sense as "last seen" — nothing live like
 * facilities-in-production timing. Update both this file and the consumer
 * if you add a field.
 */
import type { SystemData } from "./mapTypes";

export interface SystemIntelSnapshot {
  system_id: number;
  system_name: string;
  classification: string;
  owner: string;
  system_type: SystemData["system_type"];
  current_population: number;
  resources: number;
  condition: number;
  morale: number;
  current_ground_defenses: number;
  max_ground_defenses: number;
  planet_type_id?: string;
  facilities: SystemData["facilities"];
  hex_id: number;
}

export function buildSystemSnapshot(sys: SystemData): SystemIntelSnapshot {
  return {
    system_id: sys.system_id,
    system_name: sys.system_name,
    classification: sys.classification,
    owner: sys.owner ?? "",
    system_type: sys.system_type,
    current_population: sys.current_population ?? 0,
    resources: sys.resources ?? 0,
    condition: sys.condition ?? 0,
    morale: sys.morale ?? 0,
    current_ground_defenses: sys.current_ground_defenses ?? 0,
    max_ground_defenses: sys.max_ground_defenses ?? 0,
    planet_type_id: sys.planet_type_id,
    facilities: Array.isArray(sys.facilities) ? sys.facilities : [],
    hex_id: sys.hex_id,
  };
}
