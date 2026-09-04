import { useCallback, useEffect, useRef, useState } from "react";
import Header from "@/components/Header";
import PageMeta from "@/components/PageMeta";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Trash2, Download, Upload, Copy, ArrowUp, ArrowDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  SenateBloc,
  SenateBlocSet,
  addSenateBloc,
  createSenateBlocSet,
  deleteSenateBloc,
  deleteSenateBlocSet,
  duplicateSenateBlocSet,
  exportSenateBlocSet,
  getDefaultSenateBlocSetId,
  importSenateBlocSet,
  listSenateBlocSets,
  listSenateBlocs,
  setDefaultSenateBlocSetId,
  updateSenateBloc,
  updateSenateBlocSet,
} from "@/lib/senateBlocs";

const IMAGE_BUCKET = "images";

export default function AdminPolitics() {
  const { user, isAdmin } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);

  const [sets, setSets] = useState<SenateBlocSet[]>([]);
  const [activeSetId, setActiveSetId] = useState<string | null>(null);
  const [blocs, setBlocs] = useState<SenateBloc[]>([]);
  const [images, setImages] = useState<{ name: string; url: string }[]>([]);
  const [busy, setBusy] = useState(false);

  const activeSet = sets.find((s) => s.id === activeSetId) || null;

  const loadSets = useCallback(async (preferId?: string) => {
    const rows = await listSenateBlocSets().catch(() => [] as SenateBlocSet[]);
    setSets(rows);
    const defId = await getDefaultSenateBlocSetId().catch(() => null);
    const next = preferId || activeSetId || defId || rows[0]?.id || null;
    setActiveSetId(rows.some((r) => r.id === next) ? next : rows[0]?.id ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSetId]);

  const loadBlocs = useCallback(async (setId: string | null) => {
    setBlocs(setId ? await listSenateBlocs(setId).catch(() => []) : []);
  }, []);

  useEffect(() => { loadSets(); /* eslint-disable-next-line */ }, []);
  useEffect(() => { loadBlocs(activeSetId); }, [activeSetId, loadBlocs]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.storage.from(IMAGE_BUCKET).list("", { limit: 1000 });
      setImages(
        (data ?? [])
          .filter((f) => f.name && !f.name.endsWith("/") && f.name !== ".emptyFolderPlaceholder")
          .map((f) => ({ name: f.name, url: supabase.storage.from(IMAGE_BUCKET).getPublicUrl(f.name).data.publicUrl })),
      );
    })();
  }, []);

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="container mx-auto px-4 py-16 text-muted-foreground font-body">Admins only.</div>
      </div>
    );
  }

  const withBusy = async (fn: () => Promise<void>) => {
    setBusy(true);
    try { await fn(); } catch (e: any) { toast.error(e.message ?? String(e)); } finally { setBusy(false); }
  };

  const handleNewSet = () => withBusy(async () => {
    const name = prompt("Name for the new politics set?")?.trim();
    if (!name) return;
    const set = await createSenateBlocSet(name, "", user?.id);
    await loadSets(set.id);
    toast.success("Set created");
  });

  const handleRenameSet = () => withBusy(async () => {
    if (!activeSet) return;
    const name = prompt("Rename set", activeSet.name)?.trim();
    if (!name) return;
    await updateSenateBlocSet(activeSet.id, { name });
    await loadSets(activeSet.id);
  });

  const handleDuplicate = () => withBusy(async () => {
    if (!activeSetId) return;
    const copy = await duplicateSenateBlocSet(activeSetId, user?.id);
    await loadSets(copy.id);
    toast.success("Set duplicated");
  });

  const handleDeleteSet = () => withBusy(async () => {
    if (!activeSet) return;
    if (!confirm(`Delete "${activeSet.name}" and all of its blocs?`)) return;
    await deleteSenateBlocSet(activeSet.id);
    setActiveSetId(null);
    await loadSets();
    toast.success("Set deleted");
  });

  const handleMakeDefault = () => withBusy(async () => {
    if (!activeSetId) return;
    await setDefaultSenateBlocSetId(activeSetId);
    toast.success("Set as default for new games");
  });

  const handleExport = () => withBusy(async () => {
    if (!activeSetId) return;
    const bundle = await exportSenateBlocSet(activeSetId);
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
      const set = await importSenateBlocSet(bundle, user?.id);
      await loadSets(set.id);
      toast.success(`Imported "${set.name}"`);
    });
  };

  const handleAddBloc = () => withBusy(async () => {
    if (!activeSetId) return;
    const max = blocs.reduce((m, b) => Math.max(m, b.sort_order), 0);
    await addSenateBloc(activeSetId, max + 1);
    await loadBlocs(activeSetId);
  });

  const patchBloc = (id: string, updates: Partial<SenateBloc>) => {
    setBlocs((prev) => prev.map((b) => (b.id === id ? { ...b, ...updates } : b)));
  };

  const saveBloc = async (b: SenateBloc) => {
    try {
      await updateSenateBloc(b.id, {
        name: b.name,
        description: b.description,
        image_url: b.image_url,
        accent_color: b.accent_color,
        sort_order: b.sort_order,
      });
    } catch (e: any) {
      toast.error(e.message ?? String(e));
    }
  };

  const move = (index: number, dir: -1 | 1) => withBusy(async () => {
    const other = blocs[index + dir];
    const cur = blocs[index];
    if (!other || !cur) return;
    await updateSenateBloc(cur.id, { sort_order: other.sort_order });
    await updateSenateBloc(other.id, { sort_order: cur.sort_order });
    await loadBlocs(activeSetId);
  });

  const removeBloc = (b: SenateBloc) => withBusy(async () => {
    if (!confirm(`Delete "${b.name}"?`)) return;
    await deleteSenateBloc(b.id);
    await loadBlocs(activeSetId);
  });

  return (
    <div className="min-h-screen bg-background">
      <PageMeta
        title="Politics — Senate Blocs Editor"
        description="Create and edit senate bloc sets used by the politics screen in Third Republic."
        path="/admin/politics"
      />
      <Header />
      <div className="container mx-auto px-4 py-10 max-w-5xl">
        <h1 className="font-heading text-3xl text-gold mb-1">Politics</h1>
        <p className="font-body font-medium text-muted-foreground mb-8">
          Senate blocs are the political groups of the Senate. They are separate from the military factions on the map.
        </p>

        {/* Set toolbar */}
        <div className="flex flex-wrap items-end gap-3 mb-8 border border-bronze/40 rounded-sm p-4 bg-card">
          <div className="space-y-1.5">
            <div className="text-xs font-heading uppercase tracking-[0.25em] text-bronze">Active Set</div>
            <Select value={activeSetId ?? ""} onValueChange={setActiveSetId} disabled={busy || sets.length === 0}>
              <SelectTrigger className="min-w-[16rem]">
                <SelectValue placeholder={sets.length ? "Select a set" : "No sets yet"} />
              </SelectTrigger>
              <SelectContent className="bg-background z-50">
                {sets.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" size="sm" onClick={handleNewSet} disabled={busy}><Plus className="h-4 w-4 mr-1" />New</Button>
          <Button variant="outline" size="sm" onClick={handleRenameSet} disabled={busy || !activeSet}>Rename</Button>
          <Button variant="outline" size="sm" onClick={handleDuplicate} disabled={busy || !activeSet}><Copy className="h-4 w-4 mr-1" />Duplicate</Button>
          <Button variant="outline" size="sm" onClick={handleMakeDefault} disabled={busy || !activeSet}>Make Default</Button>
          <Button variant="outline" size="sm" onClick={handleExport} disabled={busy || !activeSet}><Download className="h-4 w-4 mr-1" />Save</Button>
          <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={busy}><Upload className="h-4 w-4 mr-1" />Load</Button>
          <Button variant="destructive" size="sm" onClick={handleDeleteSet} disabled={busy || !activeSet}><Trash2 className="h-4 w-4 mr-1" />Delete Set</Button>
          <input ref={fileRef} type="file" accept="application/json" className="hidden" onChange={handleFile} />
        </div>

        {/* Blocs */}
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-heading text-xl text-gold">Senate Blocs ({blocs.length})</h2>
          <Button size="sm" onClick={handleAddBloc} disabled={busy || !activeSetId}><Plus className="h-4 w-4 mr-1" />Add Bloc</Button>
        </div>

        <div className="space-y-4">
          {blocs.map((b, i) => (
            <div key={b.id} className="border border-bronze/40 rounded-sm p-4 bg-card grid md:grid-cols-[8rem_1fr] gap-4">
              <div className="space-y-2">
                <div className="w-full aspect-[5/7] border border-bronze/40 rounded-sm overflow-hidden bg-muted">
                  {b.image_url
                    ? <img src={b.image_url} alt={b.name} className="w-full h-full object-cover" />
                    : <div className="w-full h-full" style={{ background: b.accent_color }} />}
                </div>
                <div className="flex gap-1">
                  <Button variant="outline" size="icon" className="h-7 w-7" disabled={busy || i === 0} onClick={() => move(i, -1)}><ArrowUp className="h-3 w-3" /></Button>
                  <Button variant="outline" size="icon" className="h-7 w-7" disabled={busy || i === blocs.length - 1} onClick={() => move(i, 1)}><ArrowDown className="h-3 w-3" /></Button>
                  <Button variant="destructive" size="icon" className="h-7 w-7" disabled={busy} onClick={() => removeBloc(b)}><Trash2 className="h-3 w-3" /></Button>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex gap-3">
                  <Input
                    value={b.name}
                    onChange={(e) => patchBloc(b.id, { name: e.target.value })}
                    onBlur={() => saveBloc(b)}
                    placeholder="Bloc name"
                  />
                  <input
                    type="color"
                    value={b.accent_color}
                    onChange={(e) => patchBloc(b.id, { accent_color: e.target.value })}
                    onBlur={() => saveBloc(b)}
                    className="h-10 w-14 rounded-sm border border-bronze/40 bg-transparent"
                    title="Accent color"
                  />
                </div>
                <Textarea
                  value={b.description}
                  onChange={(e) => patchBloc(b.id, { description: e.target.value })}
                  onBlur={() => saveBloc(b)}
                  placeholder="Description shown in the politics dossier"
                  rows={3}
                />
                <div className="flex flex-col sm:flex-row gap-3">
                  <Select
                    value={b.image_url ?? "none"}
                    onValueChange={(v) => {
                      const url = v === "none" ? null : v;
                      patchBloc(b.id, { image_url: url });
                      saveBloc({ ...b, image_url: url });
                    }}
                  >
                    <SelectTrigger className="sm:w-64"><SelectValue placeholder="Choose an image" /></SelectTrigger>
                    <SelectContent className="bg-background z-50 max-h-72">
                      <SelectItem value="none">No image</SelectItem>
                      {images.map((img) => <SelectItem key={img.name} value={img.url}>{img.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Input
                    value={b.image_url ?? ""}
                    onChange={(e) => patchBloc(b.id, { image_url: e.target.value || null })}
                    onBlur={() => saveBloc(b)}
                    placeholder="…or paste an image URL"
                  />
                </div>
              </div>
            </div>
          ))}
          {blocs.length === 0 && (
            <p className="text-muted-foreground font-body font-medium py-8 text-center">
              No blocs in this set yet.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
