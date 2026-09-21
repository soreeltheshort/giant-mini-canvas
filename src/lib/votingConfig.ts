/**
 * Global voting configuration.
 * `influence_admin_point_multiplier` is the coefficient applied to a player's
 * committed influence when they spend 1 admin point on a bloc.
 */
import { supabase } from "@/integrations/supabase/client";

export const DEFAULT_INFLUENCE_MULTIPLIER = 1.5;

const db = () => supabase as any;

export async function getInfluenceMultiplier(): Promise<number> {
  const { data } = await db()
    .from("app_settings")
    .select("influence_admin_point_multiplier")
    .eq("id", "global")
    .maybeSingle();
  const value = Number(data?.influence_admin_point_multiplier);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_INFLUENCE_MULTIPLIER;
}

export async function setInfluenceMultiplier(value: number): Promise<void> {
  const { error } = await db()
    .from("app_settings")
    .upsert({ id: "global", influence_admin_point_multiplier: value, updated_at: new Date().toISOString() });
  if (error) throw error;
}
