import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Trash2, Download, Upload, Copy } from "lucide-react";
import {
  FavorSet,
  createFavorSet,
  deleteFavorSet,
  duplicateFavorSet,
  exportFavorSet,
  getDefaultFavorSetId,
  importFavorSet,
  listFavorSets,
  setDefaultFavorSetId,
  updateFavorSet,
} from "@/lib/favores";

interface Props {
  value: string | null;
  onChange: (id: string | null) => void;
  /** Current user id, used when creating/importing sets. */
  userId?: string;
  disabled?: boolean;
  label?: string;
  /**
   * "full" = every management action (admin editor).
   * "load" = pick an existing set or load one from a file only.
   */
  mode?: "full" | "load";
  onSetsChanged?: () => void;
  className?: string;
}

/**
 * Shared Active Set toolbar for Favor sets. Mirrors SenateBlocSetToolbar.
 */
export default function FavorSetToolbar({
  value,
  onChange,
  userId,
  disabled,
  label = "Active Set",
  mode = "full",
  onSetsChanged,
  className,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [sets, setSets] = useState<FavorSet[]>([]);
  const [busy, setBusy] = useState(false);
  const full = mode === "full";

  const loadSets = useCallback(
    async (preferId?: string) => {
      const rows = await listFavorSets().catch(() => [] as FavorSet[]);
      setSets(rows);
      const defId = await getDefaultFavorSetId().catch(() => null);
      const next = preferId || value || defId || rows[0]?.id || null;
      const resolved = rows.some((r) => r.id === next) ? next : rows[0]?.id ?? null;
      if (resolved !== value) onChange(resolved);
      onSetsChanged?.();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [value],
  );

  useEffect(() => {
    loadSets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const withBusy = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e: any) {
      toast.error(e.message ?? String(e));
    } finally {
      setBusy(false);
    }
  };

  const activeSet = sets.find((s) => s.id === value) || null;
  const off = disabled || busy;

  const handleNewSet = () =>
    withBusy(async () => {
      const name = prompt("Name for the new Favores set?")?.trim();
      if (!name) return;
      const set = await createFavorSet(name, "", userId);
      await loadSets(set.id);
      toast.success("Set created");
    });

  const handleRenameSet = () =>
    withBusy(async () => {
      if (!activeSet) return;
      const name = prompt("Rename set", activeSet.name)?.trim();
      if (!name) return;
      await updateFavorSet(activeSet.id, { name });
      await loadSets(activeSet.id);
    });

  const handleDuplicate = () =>
    withBusy(async () => {
      if (!value) return;
      const copy = await duplicateFavorSet(value, userId);
      await loadSets(copy.id);
      toast.success("Set duplicated");
    });

  const handleDeleteSet = () =>
    withBusy(async () => {
      if (!activeSet) return;
      if (!confirm(`Delete "${activeSet.name}" and all of its Favores?`)) return;
      await deleteFavorSet(activeSet.id);
      onChange(null);
      await loadSets();
      toast.success("Set deleted");
    });

  const handleMakeDefault = () =>
    withBusy(async () => {
      if (!value) return;
      await setDefaultFavorSetId(value);
      toast.success("Set as default for new games");
    });

  const handleExport = () =>
    withBusy(async () => {
      if (!value) return;
      const bundle = await exportFavorSet(value);
      const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `favores-${bundle.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    });

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    withBusy(async () => {
      const bundle = JSON.parse(await file.text());
      const set = await importFavorSet(bundle, userId);
      await loadSets(set.id);
      toast.success(`Imported "${set.name}"`);
    });
  };

  return (
    <div
      className={
        className ??
        (full
          ? "flex flex-wrap items-end gap-3 border border-bronze/40 rounded-sm p-4 bg-card"
          : "flex flex-wrap items-end gap-3")
      }
    >
      <div className="space-y-1.5">
        <div className="text-xs font-heading uppercase tracking-[0.25em] text-bronze">{label}</div>
        <Select value={value ?? ""} onValueChange={onChange} disabled={off || sets.length === 0}>
          <SelectTrigger className="min-w-[16rem]">
            <SelectValue placeholder={sets.length ? "Select a set" : "No sets yet"} />
          </SelectTrigger>
          <SelectContent className="bg-background z-50">
            {sets.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {full && (
        <>
          <Button variant="outline" size="sm" onClick={handleNewSet} disabled={off}>
            <Plus className="h-4 w-4 mr-1" />
            New
          </Button>
          <Button variant="outline" size="sm" onClick={handleRenameSet} disabled={off || !activeSet}>
            Rename
          </Button>
          <Button variant="outline" size="sm" onClick={handleDuplicate} disabled={off || !activeSet}>
            <Copy className="h-4 w-4 mr-1" />
            Duplicate
          </Button>
          <Button variant="outline" size="sm" onClick={handleMakeDefault} disabled={off || !activeSet}>
            Make Default
          </Button>
          <Button variant="outline" size="sm" onClick={handleExport} disabled={off || !activeSet}>
            <Download className="h-4 w-4 mr-1" />
            Save
          </Button>
        </>
      )}

      <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={off}>
        <Upload className="h-4 w-4 mr-1" />
        Load
      </Button>

      {full && (
        <Button variant="destructive" size="sm" onClick={handleDeleteSet} disabled={off || !activeSet}>
          <Trash2 className="h-4 w-4 mr-1" />
          Delete Set
        </Button>
      )}

      <input ref={fileRef} type="file" accept="application/json" className="hidden" onChange={handleFile} />
    </div>
  );
}
