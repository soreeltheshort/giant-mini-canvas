import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export interface DbSystemAction {
  id: string;
  name: string;
  description: string;
  icon: string;
}

export function useSystemActions() {
  const [actions, setActions] = useState<DbSystemAction[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchAll = useCallback(async () => {
    const { data, error } = await (supabase as any)
      .from("system_actions")
      .select("id, name, description, icon")
      .order("created_at", { ascending: true });
    if (error) {
      console.error("[SystemActions] fetch error", error);
    } else {
      setActions(data || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const addAction = useCallback(async (name: string, description: string, icon: string) => {
    const { error } = await (supabase as any).from("system_actions").insert({ name, description, icon });
    if (error) toast({ title: "Failed to add action", description: error.message, variant: "destructive" });
    else await fetchAll();
  }, [fetchAll, toast]);

  const updateAction = useCallback(async (id: string, updates: Partial<Pick<DbSystemAction, "name" | "description" | "icon">>) => {
    const { error } = await (supabase as any).from("system_actions").update(updates).eq("id", id);
    if (error) toast({ title: "Failed to update", description: error.message, variant: "destructive" });
    else await fetchAll();
  }, [fetchAll, toast]);

  const removeAction = useCallback(async (id: string) => {
    const { error } = await (supabase as any).from("system_actions").delete().eq("id", id);
    if (error) toast({ title: "Failed to delete", description: error.message, variant: "destructive" });
    else await fetchAll();
  }, [fetchAll, toast]);

  return { actions, loading, addAction, updateAction, removeAction, refetch: fetchAll };
}
