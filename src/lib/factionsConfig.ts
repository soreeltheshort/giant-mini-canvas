import { supabase } from "@/integrations/supabase/client";
import { loadRandomizeParams, saveRandomizeParams } from "@/lib/randomizeSystems";

const TABLES = [
  "naming_conventions",
  "factions",
  "system_actions",
  "planet_types",
  "facility_types",
  "combat_constants",
  "fleet_size_categories",
] as const;
type TableName = (typeof TABLES)[number];

export interface FactionsConfigBundle {
  version: 1;
  exported_at: string;
  randomize_params: ReturnType<typeof loadRandomizeParams>;
  tables: Record<TableName, any[]>;
}

export interface SavedFactionsConfigRow {
  id: string;
  name: string;
  file_path: string;
  created_at: string;
}

const BUCKET = "config-files";

export async function exportCurrentFactionsConfig(): Promise<FactionsConfigBundle> {
  const tables: Record<string, any[]> = {};
  for (const t of TABLES) {
    const { data, error } = await (supabase as any).from(t).select("*");
    if (error) throw new Error(`${t}: ${error.message}`);
    tables[t] = data ?? [];
  }
  return {
    version: 1,
    exported_at: new Date().toISOString(),
    randomize_params: loadRandomizeParams(),
    tables: tables as FactionsConfigBundle["tables"],
  };
}

export async function applyFactionsConfigBundle(bundle: FactionsConfigBundle): Promise<void> {
  if (!bundle || bundle.version !== 1 || !bundle.tables) {
    throw new Error("Unrecognized config file format");
  }
  for (const t of TABLES) {
    const rows = bundle.tables[t];
    if (!Array.isArray(rows) || rows.length === 0) continue;
    const { error } = await (supabase as any).from(t).upsert(rows, { onConflict: "id" });
    if (error) throw new Error(`${t}: ${error.message}`);
  }
  if (bundle.randomize_params) saveRandomizeParams(bundle.randomize_params);
}

export async function listSavedFactionsConfigs(): Promise<SavedFactionsConfigRow[]> {
  const { data, error } = await (supabase as any)
    .from("saved_factions_configs")
    .select("id, name, file_path, created_at")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function getDefaultFactionsConfigId(): Promise<string | null> {
  const { data } = await (supabase as any)
    .from("app_settings")
    .select("default_factions_config_id")
    .eq("id", "global")
    .maybeSingle();
  return data?.default_factions_config_id || null;
}

export async function setDefaultFactionsConfigId(id: string): Promise<void> {
  const { error } = await (supabase as any)
    .from("app_settings")
    .upsert({ id: "global", default_factions_config_id: id, updated_at: new Date().toISOString() });
  if (error) throw error;
}

export async function downloadFactionsConfigBundle(filePath: string): Promise<FactionsConfigBundle> {
  const { data, error } = await (supabase as any).storage.from(BUCKET).download(filePath);
  if (error) throw error;
  const text = await (data as Blob).text();
  return JSON.parse(text);
}

export async function uploadFactionsConfigFile(params: {
  name: string;
  bundle: FactionsConfigBundle;
  uploadedBy: string;
}): Promise<SavedFactionsConfigRow> {
  const path = `${crypto.randomUUID()}.json`;
  const blob = new Blob([JSON.stringify(params.bundle, null, 2)], { type: "application/json" });
  const { error: upErr } = await (supabase as any).storage.from(BUCKET).upload(path, blob, {
    contentType: "application/json",
    upsert: false,
  });
  if (upErr) throw upErr;
  const { data, error } = await (supabase as any)
    .from("saved_factions_configs")
    .insert({ name: params.name, file_path: path, uploaded_by: params.uploadedBy })
    .select("id, name, file_path, created_at")
    .single();
  if (error) throw error;
  return data as SavedFactionsConfigRow;
}

/** Apply a saved config by id and mark it as default. */
export async function applyAndSetDefaultFactionsConfig(id: string): Promise<void> {
  const { data, error } = await (supabase as any)
    .from("saved_factions_configs")
    .select("file_path")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data?.file_path) throw new Error("Config not found");
  const bundle = await downloadFactionsConfigBundle(data.file_path);
  await applyFactionsConfigBundle(bundle);
  await setDefaultFactionsConfigId(id);
}
