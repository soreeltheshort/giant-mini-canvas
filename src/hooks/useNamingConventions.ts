import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export type NamingConventionKind = "planet" | "fleet" | "ship";

export interface NamingConvention {
  id: string;
  name: string;
  kind: NamingConventionKind;
  names: string[];
}

export function useNamingConventions() {
  const [conventions, setConventions] = useState<NamingConvention[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchAll = useCallback(async () => {
    const { data, error } = await (supabase as any)
      .from("naming_conventions")
      .select("id, name, kind, names")
      .order("kind", { ascending: true })
      .order("name", { ascending: true });
    if (error) console.error("[NamingConventions] fetch error", error);
    else setConventions((data as NamingConvention[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const add = useCallback(async (name: string, kind: NamingConventionKind, names: string[]) => {
    const { error } = await (supabase as any).from("naming_conventions").insert({ name, kind, names });
    if (error) toast({ title: "Failed to add", description: error.message, variant: "destructive" });
    else await fetchAll();
  }, [fetchAll, toast]);

  const update = useCallback(async (id: string, updates: Partial<Pick<NamingConvention, "name" | "kind" | "names">>) => {
    const { error } = await (supabase as any).from("naming_conventions").update(updates).eq("id", id);
    if (error) toast({ title: "Failed to update", description: error.message, variant: "destructive" });
    else await fetchAll();
  }, [fetchAll, toast]);

  const remove = useCallback(async (id: string) => {
    const { error } = await (supabase as any).from("naming_conventions").delete().eq("id", id);
    if (error) toast({ title: "Failed to delete", description: error.message, variant: "destructive" });
    else await fetchAll();
  }, [fetchAll, toast]);

  return { conventions, loading, add, update, remove, refetch: fetchAll };
}
