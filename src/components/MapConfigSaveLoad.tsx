import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { loadRandomizeParams, saveRandomizeParams } from "@/lib/randomizeSystems";

/**
 * Tables backing the Map Config page. Order matters only for readability;
 * import does per-row upsert by id so referential integrity is preserved
 * for rows that still exist.
 */
const TABLES = [
  "factions",
  "system_actions",
  "planet_types",
  "facility_types",
  "combat_constants",
  "fleet_size_categories",
] as const;

type TableName = (typeof TABLES)[number];

interface ConfigBundle {
  version: 1;
  exported_at: string;
  randomize_params: ReturnType<typeof loadRandomizeParams>;
  tables: Record<TableName, any[]>;
}

export default function MapConfigSaveLoad({ isAdmin }: { isAdmin: boolean }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<"export" | "import" | null>(null);

  const handleExport = async () => {
    setBusy("export");
    try {
      const tables: Record<string, any[]> = {};
      for (const t of TABLES) {
        const { data, error } = await (supabase as any).from(t).select("*");
        if (error) throw new Error(`${t}: ${error.message}`);
        tables[t] = data ?? [];
      }
      const bundle: ConfigBundle = {
        version: 1,
        exported_at: new Date().toISOString(),
        randomize_params: loadRandomizeParams(),
        tables: tables as ConfigBundle["tables"],
      };
      const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      a.download = `map-config-${stamp}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Configuration exported");
    } catch (e: any) {
      toast.error(`Export failed: ${e.message ?? e}`);
    } finally {
      setBusy(null);
    }
  };

  const handleImportClick = () => fileRef.current?.click();

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!confirm("Import configuration? Existing rows with matching IDs will be overwritten. New rows from the file will be inserted. No rows will be deleted.")) {
      return;
    }
    setBusy("import");
    try {
      const text = await file.text();
      const bundle: ConfigBundle = JSON.parse(text);
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
      toast.success("Configuration imported. Reloading...");
      setTimeout(() => window.location.reload(), 600);
    } catch (err: any) {
      toast.error(`Import failed: ${err.message ?? err}`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-3 rounded border border-border p-4">
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Save / Load Configuration</h2>
        <p className="text-xs text-muted-foreground mt-1">
          Export all settings on this page (factions, actions, planet types, facility types, turn constants,
          fleet size tiers, randomize params) to a JSON file, or restore from a previously exported file.
          Import upserts by id and does not delete rows.
        </p>
      </div>
      <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={handleExport} disabled={busy !== null}>
          {busy === "export" ? "Exporting..." : "Export to file"}
        </Button>
        {isAdmin && (
          <Button size="sm" variant="outline" onClick={handleImportClick} disabled={busy !== null}>
            {busy === "import" ? "Importing..." : "Import from file"}
          </Button>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={handleFile}
        />
      </div>
    </div>
  );
}
