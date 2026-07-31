import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export interface DbFacilityType {
  id: string;
  name: string;
  description: string;
  icon: string;
  cost: number;
  maintenance: number;
  condition_bonus: number;
  tribute_flat: number;
  tribute_percent: number;
  survey_bonus: number;
  ground_defense_bonus: number;
  turns_to_build: number;
  construction_kickback: number;
  consumed_facility_id: string | null;
  fighter_capacity: number;
  gunship_capacity: number;
  max_per_system: number;
  ship_build_capacity: number;
  max_ship_hull_class: string | null;
  synod: boolean;
  admin_cost: number;
  supply_range: number;
  requires_supply: boolean;
  /** Where this facility may be built: "planet" | "starbase" | "both". */
  allowed_on: string;
  /** Population this facility adds (used by starbases, which have none innately). */
  population_bonus: number;
  /** Starbase combat contribution. */
  hull_points: number;
  armor: number;
  laser_light: number;
  laser_medium: number;
  laser_heavy: number;
  laser_hull_breaker: number;
  missile_10kg: number;
  missile_50kg: number;
  missile_100kg: number;
  missile_half_kt: number;
  missile_synod: number;
  missile_kraken: number;
}

/** Weapon columns shared between facility_types and ship_types. */
export const FACILITY_WEAPON_KEYS = [
  "laser_light",
  "laser_medium",
  "laser_heavy",
  "laser_hull_breaker",
  "missile_10kg",
  "missile_50kg",
  "missile_100kg",
  "missile_half_kt",
  "missile_synod",
  "missile_kraken",
] as const;

/** True when a facility type may be placed on the given system type. */
export function facilityAllowedOn(
  ft: { allowed_on?: string | null },
  systemType: "system" | "station" | undefined | null,
): boolean {
  const allowed = (ft.allowed_on || "planet").toLowerCase();
  if (allowed === "both") return true;
  return systemType === "station" ? allowed === "starbase" : allowed === "planet";
}

/** Blank facility-type field set used by the "add facility" forms. */
export function emptyFacilityFields(): Omit<DbFacilityType, "id"> {
  return {
    name: "", description: "", icon: "🏭",
    cost: 0, admin_cost: 1, maintenance: 0, condition_bonus: 0,
    tribute_flat: 0, tribute_percent: 0, survey_bonus: 0, ground_defense_bonus: 0,
    turns_to_build: 1, construction_kickback: 0, consumed_facility_id: null,
    fighter_capacity: 0, gunship_capacity: 0, max_per_system: 0,
    ship_build_capacity: 0, max_ship_hull_class: null, synod: false,
    supply_range: 0, requires_supply: true,
    allowed_on: "planet", population_bonus: 0,
    hull_points: 0, armor: 0,
    laser_light: 0, laser_medium: 0, laser_heavy: 0, laser_hull_breaker: 0,
    missile_10kg: 0, missile_50kg: 0, missile_100kg: 0, missile_half_kt: 0,
    missile_synod: 0, missile_kraken: 0,
  };
}




export function useFacilityTypes() {
  const [facilityTypes, setFacilityTypes] = useState<DbFacilityType[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchAll = useCallback(async () => {
    const { data, error } = await supabase
      .from("facility_types")
      .select("*")
      .order("created_at", { ascending: true });
    if (error) {
      console.error("[FacilityTypes] fetch error", error);
    } else {
      setFacilityTypes(data || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const addFacilityType = useCallback(async (fields: Omit<DbFacilityType, "id">) => {
    const { error } = await supabase.from("facility_types").insert(fields as any);
    if (error) {
      toast({ title: "Failed to add", description: error.message, variant: "destructive" });
    } else {
      await fetchAll();
    }
  }, [fetchAll, toast]);

  const updateFacilityType = useCallback(async (id: string, updates: Partial<Omit<DbFacilityType, "id">>) => {
    const { error } = await supabase.from("facility_types").update(updates as any).eq("id", id);
    if (error) {
      toast({ title: "Failed to update", description: error.message, variant: "destructive" });
    } else {
      await fetchAll();
    }
  }, [fetchAll, toast]);

  const removeFacilityType = useCallback(async (id: string) => {
    const { error } = await supabase.from("facility_types").delete().eq("id", id);
    if (error) {
      toast({ title: "Failed to delete", description: error.message, variant: "destructive" });
    } else {
      await fetchAll();
    }
  }, [fetchAll, toast]);

  return { facilityTypes, loading, addFacilityType, updateFacilityType, removeFacilityType, refetch: fetchAll };
}
