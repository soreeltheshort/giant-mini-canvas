import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Trash2, Download, Upload, Copy } from "lucide-react";
import { usePromptDialog } from "@/hooks/usePromptDialog";
import {
  SenateBlocSet,
  createSenateBlocSet,
  deleteSenateBlocSet,
  duplicateSenateBlocSet,
  exportSenateBlocSet,
  getDefaultSenateBlocSetId,
  importSenateBlocSet,
  listSenateBlocSets,
  setDefaultSenateBlocSetId,
  updateSenateBlocSet,
} from "@/lib/senateBlocs";

interface Props {
  value: string | null;
  onChange: (id: string | null) => void;
  /** Current user id, used when creating/importing sets. */
  userId?: string;
  disabled?: boolean;
  label?: string;
  /**
   * "full" = every management action (admin editor).
   * "load" = pick an existing set or load one from a file; no save/default/rename/duplicate/delete.
   */
  mode?: "full" | "load";
  /** Called after sets change (create/import/delete/rename) so callers can refresh. */
  onSetsChanged?: () => void;
  className?: string;
}

/**
 * Shared Active Set toolbar for senate bloc (Politics) sets.
 * Used by the admin Politics editor and by game creation/edit in load-only mode.
 */
export default function SenateBlocSetToolbar({
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
  const [sets, setSets] = useState<SenateBlocSet[]>([]);
  const [busy, setBusy] = useState(false);
  const { ask, askConfirm, dialog } = usePromptDialog();
  const full = mode === "full";

  const loadSets = useCallback(
    async (preferId?: string) => {
      const rows = await listSenateBlocSets().catch(() => [] as SenateBlocSet[]);
      setSets(rows);
      const defId = await getDefaultSenateBlocSetId().catch(() => null);
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
      const name = await ask({
        title: "New Politics Set",
        message: "Enter a name for the new politics set.",
        placeholder: "Set name",
        confirmLabel: "Create",
      });
      if (!name) return;
      const set = await createSenateBlocSet(name, "", userId);
      await loadSets(set.id);
      toast.success("Set created");
    });

  const handleRenameSet = () =>
    withBusy(async () => {
      if (!activeSet) return;
      const name = await ask({
        title: "Rename Set",
        message: `Renaming "${activeSet.name}".`,
        defaultValue: activeSet.name,
        confirmLabel: "Rename",
      });
      if (!name) return;
      await updateSenateBlocSet(activeSet.id, { name });
      await loadSets(activeSet.id);
    });

  const handleDuplicate = () =>
    withBusy(async () => {
      if (!value) return;
      const copy = await duplicateSenateBlocSet(value, userId);
      await loadSets(copy.id);
      toast.success("Set duplicated");
    });

  const handleDeleteSet = () =>
    withBusy(async () => {
      if (!activeSet) return;
      const ok = await askConfirm({
        title: "Delete Set",
        message: `Delete "${activeSet.name}" and all of its senate blocs?`,
        confirmLabel: "Delete",
        destructive: true,
      });
      if (!ok) return;
      await deleteSenateBlocSet(activeSet.id);
      onChange(null);
      await loadSets();
      toast.success("Set deleted");
    });

  const handleMakeDefault = () =>
    withBusy(async () => {
      if (!value) return;
      await setDefaultSenateBlocSetId(value);
      toast.success("Set as default for new games");
    });

  const handleExport = () =>
    withBusy(async () => {
      if (!value) return;
      const bundle = await exportSenateBlocSet(value);
      const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `politics-${bundle.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    });

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    withBusy(async () => {
      const bundle = JSON.parse(await file.text());
      const set = await importSenateBlocSet(bundle, userId);
      await loadSets(set.id);
      toast.success(`Imported "${set.name}"`);
    });
  };

  return (
    <>
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
      {dialog}
    </>
  );
}
