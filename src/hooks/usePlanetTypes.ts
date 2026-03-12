import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export interface DbPlanetType {
  id: string;
  name: string;
  min_initial_condition: number;
  max_initial_condition: number;
  min_resources: number;
  max_resources: number;
  weight: number;
}

export function usePlanetTypes() {
  const [planetTypes, setPlanetTypes] = useState<DbPlanetType[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchAll = useCallback(async () => {
    const { data, error } = await supabase
      .from("planet_types")
      .select("id, name, min_initial_condition, max_initial_condition, min_resources, max_resources, weight")
      .order("name", { ascending: true });
    if (error) {
      console.error("[PlanetTypes] fetch error", error);
    } else {
      setPlanetTypes(data || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const addPlanetType = useCallback(async (fields: Omit<DbPlanetType, "id">) => {
    const { error } = await supabase.from("planet_types").insert(fields as any);
    if (error) {
      toast({ title: "Failed to add", description: error.message, variant: "destructive" });
    } else {
      await fetchAll();
    }
  }, [fetchAll, toast]);

  const updatePlanetType = useCallback(async (id: string, updates: Partial<Omit<DbPlanetType, "id">>) => {
    const { error } = await supabase.from("planet_types").update(updates as any).eq("id", id);
    if (error) {
      toast({ title: "Failed to update", description: error.message, variant: "destructive" });
    } else {
      await fetchAll();
    }
  }, [fetchAll, toast]);

  const removePlanetType = useCallback(async (id: string) => {
    const { error } = await supabase.from("planet_types").delete().eq("id", id);
    if (error) {
      toast({ title: "Failed to delete", description: error.message, variant: "destructive" });
    } else {
      await fetchAll();
    }
  }, [fetchAll, toast]);

  return { planetTypes, loading, addPlanetType, updatePlanetType, removePlanetType, refetch: fetchAll };
}
