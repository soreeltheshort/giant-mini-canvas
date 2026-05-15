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
