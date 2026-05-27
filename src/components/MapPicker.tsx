import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export interface SavedMapRow { id: string; name: string; file_path: string; }

interface Props {
  value: string | null;
  onChange: (m: SavedMapRow | null) => void;
  disabled?: boolean;
  label?: string;
  /** Persist the chosen map as the new global default. Defaults to true. */
  rememberAsDefault?: boolean;
}

/**
 * Picker for saved maps used at game-creation time.
 * Defaults to the global default_map_id; selecting a different map updates the default.
 */
export default function MapPicker({ value, onChange, disabled, label = "Map", rememberAsDefault = true }: Props) {
  const [maps, setMaps] = useState<SavedMapRow[]>([]);

  useEffect(() => {
    (async () => {
      const [{ data: list }, { data: settings }] = await Promise.all([
        (supabase as any).from("saved_maps").select("id, name, file_path").order("created_at", { ascending: false }),
        (supabase as any).from("app_settings").select("default_map_id").eq("id", "global").maybeSingle(),
      ]);
      const rows = (list || []) as SavedMapRow[];
      setMaps(rows);
      if (!value) {
        const defId = settings?.default_map_id;
        const def = rows.find((m) => m.id === defId) || null;
        if (def) onChange(def);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pick = async (id: string) => {
    const m = maps.find((x) => x.id === id) || null;
    onChange(m);
    if (m && rememberAsDefault) {
      await (supabase as any)
        .from("app_settings")
        .upsert({ id: "global", default_map_id: m.id, updated_at: new Date().toISOString() });
    }
  };

  const displayName = (m: SavedMapRow) => {
    const fn = m.file_path.split("/").pop() || m.file_path;
    return m.name ? `${m.name} (${fn})` : fn;
  };

  return (
    <div className="space-y-1.5">
      <div className="text-xs font-heading uppercase tracking-[0.25em] text-bronze">{label}</div>
      <Select value={value ?? ""} onValueChange={pick} disabled={disabled || maps.length === 0}>
        <SelectTrigger className="min-w-[14rem]">
          <SelectValue placeholder={maps.length === 0 ? "No maps uploaded yet" : "Select a map"} />
        </SelectTrigger>
        <SelectContent>
          {maps.map((m) => (
            <SelectItem key={m.id} value={m.id}>
              {displayName(m)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
