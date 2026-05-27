import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import {
  applyFactionsConfigBundle,
  exportCurrentFactionsConfig,
  FactionsConfigBundle,
  getDefaultFactionsConfigId,
  listSavedFactionsConfigs,
  SavedFactionsConfigRow,
  setDefaultFactionsConfigId,
  uploadFactionsConfigFile,
} from "@/lib/factionsConfig";

export default function MapConfigSaveLoad({ isAdmin }: { isAdmin: boolean }) {
  const { user } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<"export" | "import" | null>(null);
  const [activeConfig, setActiveConfig] = useState<SavedFactionsConfigRow | null>(null);

  useEffect(() => {
    (async () => {
      const id = await getDefaultFactionsConfigId().catch(() => null);
      if (!id) return;
      const list = await listSavedFactionsConfigs().catch(() => [] as SavedFactionsConfigRow[]);
      setActiveConfig(list.find((c) => c.id === id) || null);
    })();
  }, []);

  const handleExport = async () => {
    setBusy("export");
    try {
      const bundle = await exportCurrentFactionsConfig();
      const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      a.download = `factions-config-${stamp}.json`;
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
    if (!file || !user) return;
    if (!confirm("Import configuration? Existing rows with matching IDs will be overwritten. New rows from the file will be inserted. No rows will be deleted.")) {
      return;
    }
    setBusy("import");
    try {
      const text = await file.text();
      const bundle: FactionsConfigBundle = JSON.parse(text);
      await applyFactionsConfigBundle(bundle);
      const row = await uploadFactionsConfigFile({
        name: file.name.replace(/\.json$/i, ""),
        bundle,
        uploadedBy: user.id,
      });
      await setDefaultFactionsConfigId(row.id);
      setActiveConfig(row);
      toast.success("Configuration imported and saved as default. Reloading…");
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
          Import upserts by id and does not delete rows. Imported files are stored in the cloud and become
          the default Factions Config offered when creating a new game.
        </p>
        <p className="text-xs text-muted-foreground mt-2">
          Current default config:{" "}
          <span className="text-foreground font-medium">
            {activeConfig?.name ?? "— none —"}
          </span>
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
