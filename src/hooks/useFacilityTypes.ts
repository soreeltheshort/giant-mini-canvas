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

  const addFacilityType = useCallback(async (name: string, description: string, icon: string) => {
    const { error } = await supabase.from("facility_types").insert({ name, description, icon });
    if (error) {
      toast({ title: "Failed to add", description: error.message, variant: "destructive" });
    } else {
      await fetchAll();
    }
  }, [fetchAll, toast]);

  const updateFacilityType = useCallback(async (id: string, updates: Partial<Pick<DbFacilityType, "name" | "description" | "icon">>) => {
    const { error } = await supabase.from("facility_types").update(updates).eq("id", id);
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
