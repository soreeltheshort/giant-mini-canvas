import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export interface DbFaction {
  id: string;
  name: string;
  code_name?: string | null;
  color: string;
}

export function useFactions() {
  const [factions, setFactions] = useState<DbFaction[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchAll = useCallback(async () => {
    const { data, error } = await (supabase as any)
      .from("factions")
      .select("id, name, code_name, color")
      .order("created_at", { ascending: true });
    if (error) {
      console.error("[Factions] fetch error", error);
    } else {
      setFactions(data || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const addFaction = useCallback(async (name: string, color: string, code_name?: string) => {
    const { error } = await (supabase as any).from("factions").insert({ name, color, code_name: code_name || null });
    if (error) toast({ title: "Failed to add faction", description: error.message, variant: "destructive" });
    else await fetchAll();
  }, [fetchAll, toast]);

  const updateFaction = useCallback(async (id: string, updates: Partial<Pick<DbFaction, "name" | "color" | "code_name">>) => {
    const { error } = await (supabase as any).from("factions").update(updates).eq("id", id);
    if (error) toast({ title: "Failed to update", description: error.message, variant: "destructive" });
    else await fetchAll();
  }, [fetchAll, toast]);

  const removeFaction = useCallback(async (id: string) => {
    const { error } = await (supabase as any).from("factions").delete().eq("id", id);
    if (error) toast({ title: "Failed to delete", description: error.message, variant: "destructive" });
    else await fetchAll();
  }, [fetchAll, toast]);

  return { factions, loading, addFaction, updateFaction, removeFaction, refetch: fetchAll };
}
