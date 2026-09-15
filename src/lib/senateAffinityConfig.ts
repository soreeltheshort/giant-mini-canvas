/**
 * Editable config for senate affinities (label + icon).
 * The pairing rules themselves stay in `senateAffinities.ts`.
 */
import { supabase } from "@/integrations/supabase/client";

export interface AffinityConfigRow {
  id: string;
  label: string;
  icon_url: string | null;
  sort_order: number;
}

const db = () => supabase as any;

export async function listAffinityConfig(): Promise<AffinityConfigRow[]> {
  const { data, error } = await db()
    .from("senate_affinity_config")
    .select("id, label, icon_url, sort_order")
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return (data || []) as AffinityConfigRow[];
}

export async function updateAffinityConfig(
  id: string,
  updates: Partial<Pick<AffinityConfigRow, "label" | "icon_url" | "sort_order">>,
) {
  const { error } = await db().from("senate_affinity_config").update(updates).eq("id", id);
  if (error) throw error;
}
