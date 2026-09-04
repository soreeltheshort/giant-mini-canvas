/**
 * Senate blocs — the political groups of the Senate.
 *
 * IMPORTANT: senate blocs are NOT the military `factions` (provinces, Synod,
 * Neutral Colonies …). They are a completely separate concept with their own
 * tables (`senate_bloc_sets` / `senate_blocs`) and their own admin editor.
 * Never resolve a bloc from an `owner_classification` or a faction row.
 */
import { supabase } from "@/integrations/supabase/client";

export interface SenateBloc {
  id: string;
  set_id: string;
  name: string;
  description: string;
  image_url: string | null;
  accent_color: string;
  sort_order: number;
}

export interface SenateBlocSet {
  id: string;
  name: string;
  description: string;
  created_at?: string;
}

export interface SenateBlocSetBundle {
  kind: "senate-bloc-set";
  version: 1;
  name: string;
  description: string;
  blocs: Array<Pick<SenateBloc, "name" | "description" | "image_url" | "accent_color" | "sort_order">>;
}

const db = () => supabase as any;

export async function listSenateBlocSets(): Promise<SenateBlocSet[]> {
  const { data, error } = await db()
    .from("senate_bloc_sets")
    .select("id, name, description, created_at")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data || []) as SenateBlocSet[];
}

export async function listSenateBlocs(setId: string): Promise<SenateBloc[]> {
  const { data, error } = await db()
    .from("senate_blocs")
    .select("id, set_id, name, description, image_url, accent_color, sort_order")
    .eq("set_id", setId)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return (data || []) as SenateBloc[];
}

export async function getDefaultSenateBlocSetId(): Promise<string | null> {
  const { data } = await db()
    .from("app_settings")
    .select("default_senate_bloc_set_id")
    .eq("id", "global")
    .maybeSingle();
  return (data?.default_senate_bloc_set_id as string | null) ?? null;
}

export async function setDefaultSenateBlocSetId(id: string): Promise<void> {
  const { error } = await db()
    .from("app_settings")
    .upsert({ id: "global", default_senate_bloc_set_id: id, updated_at: new Date().toISOString() });
  if (error) throw error;
}

/** Resolve which bloc set a game uses: the game's own set, else the global default. */
export async function resolveGameSenateBlocSetId(gameId?: string | null): Promise<string | null> {
  if (gameId) {
    const { data } = await db()
      .from("games")
      .select("senate_bloc_set_id")
      .eq("id", gameId)
      .maybeSingle();
    const id = (data?.senate_bloc_set_id as string | null) ?? null;
    if (id) return id;
  }
  return getDefaultSenateBlocSetId();
}

export async function createSenateBlocSet(name: string, description = "", createdBy?: string): Promise<SenateBlocSet> {
  const { data, error } = await db()
    .from("senate_bloc_sets")
    .insert({ name, description, created_by: createdBy ?? null })
    .select("id, name, description, created_at")
    .single();
  if (error) throw error;
  return data as SenateBlocSet;
}

export async function updateSenateBlocSet(id: string, updates: Partial<Pick<SenateBlocSet, "name" | "description">>) {
  const { error } = await db().from("senate_bloc_sets").update(updates).eq("id", id);
  if (error) throw error;
}

export async function deleteSenateBlocSet(id: string) {
  const { error } = await db().from("senate_bloc_sets").delete().eq("id", id);
  if (error) throw error;
}

export async function addSenateBloc(setId: string, sortOrder: number): Promise<SenateBloc> {
  const { data, error } = await db()
    .from("senate_blocs")
    .insert({ set_id: setId, name: "New Bloc", description: "", sort_order: sortOrder })
    .select("id, set_id, name, description, image_url, accent_color, sort_order")
    .single();
  if (error) throw error;
  return data as SenateBloc;
}

export async function updateSenateBloc(
  id: string,
  updates: Partial<Pick<SenateBloc, "name" | "description" | "image_url" | "accent_color" | "sort_order">>,
) {
  const { error } = await db().from("senate_blocs").update(updates).eq("id", id);
  if (error) throw error;
}

export async function deleteSenateBloc(id: string) {
  const { error } = await db().from("senate_blocs").delete().eq("id", id);
  if (error) throw error;
}

export async function exportSenateBlocSet(setId: string): Promise<SenateBlocSetBundle> {
  const sets = await listSenateBlocSets();
  const set = sets.find((s) => s.id === setId);
  const blocs = await listSenateBlocs(setId);
  return {
    kind: "senate-bloc-set",
    version: 1,
    name: set?.name || "Senate Blocs",
    description: set?.description || "",
    blocs: blocs.map((b) => ({
      name: b.name,
      description: b.description,
      image_url: b.image_url,
      accent_color: b.accent_color,
      sort_order: b.sort_order,
    })),
  };
}

/** Import a bundle as a brand new set (never overwrites an existing one). */
export async function importSenateBlocSet(bundle: SenateBlocSetBundle, createdBy?: string): Promise<SenateBlocSet> {
  if (!bundle || bundle.kind !== "senate-bloc-set" || !Array.isArray(bundle.blocs)) {
    throw new Error("Not a senate bloc set file");
  }
  const set = await createSenateBlocSet(bundle.name || "Imported Set", bundle.description || "", createdBy);
  if (bundle.blocs.length) {
    const rows = bundle.blocs.map((b, i) => ({
      set_id: set.id,
      name: b.name,
      description: b.description ?? "",
      image_url: b.image_url ?? null,
      accent_color: b.accent_color || "#8a6d3b",
      sort_order: b.sort_order ?? i + 1,
    }));
    const { error } = await db().from("senate_blocs").insert(rows);
    if (error) throw error;
  }
  return set;
}

export async function duplicateSenateBlocSet(setId: string, createdBy?: string): Promise<SenateBlocSet> {
  const bundle = await exportSenateBlocSet(setId);
  return importSenateBlocSet({ ...bundle, name: `${bundle.name} (copy)` }, createdBy);
}
