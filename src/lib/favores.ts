/**
 * Favores — mini-quests offered to players. Each Favor is a template with a
 * description carrying random variables, a success criterion, a rarity draw
 * weight and rewards applied to senate blocs and/or affinities.
 *
 * Favores are stored in named sets (`favor_sets` / `favors`), exactly like
 * senate bloc sets, so admins can save, load, duplicate and default them.
 * Senate blocs are NOT military factions — the bloc targets here refer to
 * `senate_blocs` rows only.
 */
import { supabase } from "@/integrations/supabase/client";
import type { FavorVariable } from "@/lib/favorCriteria";

export interface Favor {
  id: string;
  set_id: string;
  name: string;
  description: string;
  variables: FavorVariable[];
  criterion_type: string;
  criterion_params: Record<string, any>;
  rarity: string;
  rarity_weight: number;
  bloc_reward: number;
  affinity_reward: number;
  target_bloc_ids: string[];
  target_affinities: string[];
  sort_order: number;
}

export interface FavorSet {
  id: string;
  name: string;
  description: string;
  created_at?: string;
}

type FavorPayload = Omit<Favor, "id" | "set_id">;

export interface FavorSetBundle {
  kind: "favor-set";
  version: 1;
  name: string;
  description: string;
  favors: FavorPayload[];
}

const COLS =
  "id, set_id, name, description, variables, criterion_type, criterion_params, rarity, rarity_weight, bloc_reward, affinity_reward, target_bloc_ids, target_affinities, sort_order";

const db = () => supabase as any;

export async function listFavorSets(): Promise<FavorSet[]> {
  const { data, error } = await db()
    .from("favor_sets")
    .select("id, name, description, created_at")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data || []) as FavorSet[];
}

export async function listFavors(setId: string): Promise<Favor[]> {
  const { data, error } = await db()
    .from("favors")
    .select(COLS)
    .eq("set_id", setId)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return (data || []) as Favor[];
}

export async function getDefaultFavorSetId(): Promise<string | null> {
  const { data } = await db()
    .from("app_settings")
    .select("default_favor_set_id")
    .eq("id", "global")
    .maybeSingle();
  return (data?.default_favor_set_id as string | null) ?? null;
}

export async function setDefaultFavorSetId(id: string): Promise<void> {
  const { error } = await db()
    .from("app_settings")
    .upsert({ id: "global", default_favor_set_id: id, updated_at: new Date().toISOString() });
  if (error) throw error;
}

export async function createFavorSet(name: string, description = "", createdBy?: string): Promise<FavorSet> {
  const { data, error } = await db()
    .from("favor_sets")
    .insert({ name, description, created_by: createdBy ?? null })
    .select("id, name, description, created_at")
    .single();
  if (error) throw error;
  return data as FavorSet;
}

export async function updateFavorSet(id: string, updates: Partial<Pick<FavorSet, "name" | "description">>) {
  const { error } = await db().from("favor_sets").update(updates).eq("id", id);
  if (error) throw error;
}

export async function deleteFavorSet(id: string) {
  const { error } = await db().from("favor_sets").delete().eq("id", id);
  if (error) throw error;
}

export async function addFavor(setId: string, sortOrder: number): Promise<Favor> {
  const { data, error } = await db()
    .from("favors")
    .insert({ set_id: setId, name: "New Favor", description: "", sort_order: sortOrder })
    .select(COLS)
    .single();
  if (error) throw error;
  return data as Favor;
}

export async function updateFavor(id: string, updates: Partial<FavorPayload>) {
  const { error } = await db().from("favors").update(updates).eq("id", id);
  if (error) throw error;
}

export async function deleteFavor(id: string) {
  const { error } = await db().from("favors").delete().eq("id", id);
  if (error) throw error;
}

export async function exportFavorSet(setId: string): Promise<FavorSetBundle> {
  const sets = await listFavorSets();
  const set = sets.find((s) => s.id === setId);
  const favors = await listFavors(setId);
  return {
    kind: "favor-set",
    version: 1,
    name: set?.name || "Favores",
    description: set?.description || "",
    favors: favors.map((f) => ({
      name: f.name,
      description: f.description,
      variables: f.variables ?? [],
      criterion_type: f.criterion_type,
      criterion_params: f.criterion_params ?? {},
      rarity: f.rarity,
      rarity_weight: f.rarity_weight ?? 100,
      bloc_reward: f.bloc_reward ?? 0,
      affinity_reward: f.affinity_reward ?? 0,
      target_bloc_ids: f.target_bloc_ids ?? [],
      target_affinities: f.target_affinities ?? [],
      sort_order: f.sort_order,
    })),
  };
}

/**
 * Import a bundle as a brand new set (never overwrites an existing one).
 * Bloc targets are dropped on import because bloc ids belong to the senate
 * bloc set of the environment they were exported from.
 */
export async function importFavorSet(bundle: FavorSetBundle, createdBy?: string): Promise<FavorSet> {
  if (!bundle || bundle.kind !== "favor-set" || !Array.isArray(bundle.favors)) {
    throw new Error("Not a Favores file");
  }
  const set = await createFavorSet(bundle.name || "Imported Favores", bundle.description || "", createdBy);
  if (bundle.favors.length) {
    const rows = bundle.favors.map((f, i) => ({
      set_id: set.id,
      name: f.name,
      description: f.description ?? "",
      variables: f.variables ?? [],
      criterion_type: f.criterion_type || "credit_auction",
      criterion_params: f.criterion_params ?? {},
      rarity: f.rarity || "common",
      rarity_weight: f.rarity_weight ?? 100,
      bloc_reward: f.bloc_reward ?? 0,
      affinity_reward: f.affinity_reward ?? 0,
      target_bloc_ids: f.target_bloc_ids ?? [],
      target_affinities: f.target_affinities ?? [],
      sort_order: f.sort_order ?? i + 1,
    }));
    const { error } = await db().from("favors").insert(rows);
    if (error) throw error;
  }
  return set;
}

export async function duplicateFavorSet(setId: string, createdBy?: string): Promise<FavorSet> {
  const bundle = await exportFavorSet(setId);
  return importFavorSet({ ...bundle, name: `${bundle.name} (copy)` }, createdBy);
}
