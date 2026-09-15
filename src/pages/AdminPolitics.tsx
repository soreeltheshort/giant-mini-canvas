import { useCallback, useEffect, useState } from "react";
import Header from "@/components/Header";
import PageMeta from "@/components/PageMeta";
import SenateBlocSetToolbar from "@/components/SenateBlocSetToolbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Trash2, ArrowUp, ArrowDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  SenateBloc,
  addSenateBloc,
  deleteSenateBloc,
  listSenateBlocs,
  updateSenateBloc,
} from "@/lib/senateBlocs";
import { AFFINITIES, MAX_AFFINITIES, canAddAffinity, isStandaloneAffinity, oppositeOf } from "@/lib/senateAffinities";
import { AffinityConfigRow, listAffinityConfig, updateAffinityConfig } from "@/lib/senateAffinityConfig";

const IMAGE_BUCKET = "images";

export default function AdminPolitics() {
  const { user, isAdmin } = useAuth();
  const [activeSetId, setActiveSetId] = useState<string | null>(null);
  const [blocs, setBlocs] = useState<SenateBloc[]>([]);
  const [images, setImages] = useState<{ name: string; url: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [affinityCfg, setAffinityCfg] = useState<AffinityConfigRow[]>([]);

  const affinityLabelOf = (id: string) =>
    affinityCfg.find((a) => a.id === id)?.label ?? AFFINITIES.find((a) => a.id === id)?.label ?? id;
  const affinityIconOf = (id: string) => affinityCfg.find((a) => a.id === id)?.icon_url ?? null;

  const loadBlocs = useCallback(async (setId: string | null) => {
    setBlocs(setId ? await listSenateBlocs(setId).catch(() => []) : []);
  }, []);

  useEffect(() => { listAffinityConfig().then(setAffinityCfg).catch(() => setAffinityCfg([])); }, []);
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
        senate_votes: b.senate_votes ?? 0,
        affinities: b.affinities ?? [],
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
        <SenateBlocSetToolbar
          value={activeSetId}
          onChange={setActiveSetId}
          userId={user?.id}
          disabled={busy}
          mode="full"
          onSetsChanged={() => loadBlocs(activeSetId)}
          className="flex flex-wrap items-end gap-3 mb-8 border border-bronze/40 rounded-sm p-4 bg-card"
        />

        {/* Affinities table */}
        <div className="mb-8 border border-bronze/40 rounded-sm bg-card">
          <div className="px-4 py-3 border-b border-bronze/30">
            <h2 className="font-heading text-xl text-gold">Affinities</h2>
            <p className="font-body font-medium text-xs text-muted-foreground">
              Labels and icons are shared across all sets. For each affinity: how many blocs in the active set hold it, and the combined senate votes of those blocs.
            </p>
          </div>
          <div className="divide-y divide-bronze/20">
            {(affinityCfg.length ? affinityCfg : AFFINITIES.map((a, i) => ({ id: a.id, label: a.label, icon_url: null, sort_order: i }))).map((row) => {
              const holding = blocs.filter((b) => (b.affinities ?? []).includes(row.id));
              const count = holding.length;
              const voteSum = holding.reduce((sum, b) => sum + (b.senate_votes ?? 0), 0);
              const opp = oppositeOf(row.id);
              const patch = (updates: Partial<AffinityConfigRow>) =>
                setAffinityCfg((prev) => prev.map((r) => (r.id === row.id ? { ...r, ...updates } : r)));
              const save = async (updates: Partial<AffinityConfigRow>) => {
                try { await updateAffinityConfig(row.id, updates); } catch (e: any) { toast.error(e.message ?? String(e)); }
              };
              return (
                <div key={row.id} className="grid grid-cols-[3rem_1fr_auto_auto_18rem] items-center gap-3 px-4 py-2">
                  <div className="h-10 w-10 border border-bronze/40 rounded-sm overflow-hidden bg-muted flex items-center justify-center">
                    {row.icon_url
                      ? <img src={row.icon_url} alt={`${row.label} affinity icon`} className="w-full h-full object-cover" />
                      : <span className="text-[10px] font-body text-muted-foreground">none</span>}
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      value={row.label}
                      onChange={(e) => patch({ label: e.target.value })}
                      onBlur={() => save({ label: row.label })}
                      className="max-w-[14rem]"
                    />
                    <span className="text-xs font-body text-muted-foreground">
                      {opp ? `opposed to ${affinityLabelOf(opp)}` : "allegiance"}
                    </span>
                  </div>
                  <div className="text-right w-16 tabular-nums">
                    <div className="font-body font-semibold text-white">{count} bloc{count === 1 ? "" : "s"}</div>
                    <div className="font-body font-semibold text-xs text-white">{voteSum} votes</div>
                  </div>
                  <Select
                    value={row.icon_url ?? "none"}
                    onValueChange={(v) => {
                      const url = v === "none" ? null : v;
                      patch({ icon_url: url });
                      save({ icon_url: url });
                    }}
                  >
                    <SelectTrigger><SelectValue placeholder="Choose an icon" /></SelectTrigger>
                    <SelectContent className="bg-background z-50 max-h-72">
                      <SelectItem value="none">No icon</SelectItem>
                      {images.map((img) => <SelectItem key={img.name} value={img.url}>{img.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              );
            })}
          </div>
        </div>

        {/* Blocs */}
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-heading text-xl text-gold">
            Senate Blocs ({blocs.length})
            <span className="ml-4 font-body font-semibold text-base text-crimson">
              Total Seats: {blocs.reduce((sum, b) => sum + (b.senate_votes ?? 0), 0)}
            </span>
          </h2>
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
                <div className="flex flex-wrap items-center gap-3">
                  <label className="text-xs font-heading uppercase tracking-widest text-bronze">Senate Votes</label>
                  <Input
                    type="number"
                    min={0}
                    className="w-24"
                    value={b.senate_votes ?? 0}
                    onChange={(e) => patchBloc(b.id, { senate_votes: Math.max(0, parseInt(e.target.value || "0", 10)) })}
                    onBlur={() => saveBloc(b)}
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="text-xs font-heading uppercase tracking-widest text-bronze">
                    Affinities ({(b.affinities ?? []).filter((x) => !isStandaloneAffinity(x)).length}/{MAX_AFFINITIES}
                    {" + "}
                    {(b.affinities ?? []).filter(isStandaloneAffinity).length} allegiances)
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {AFFINITIES.map((a) => {
                      const cur = b.affinities ?? [];
                      const on = cur.includes(a.id);
                      const disabled = !on && !canAddAffinity(cur, a.id);
                      return (
                        <button
                          key={a.id}
                          type="button"
                          disabled={busy || disabled}
                          onClick={() => {
                            const next = on ? cur.filter((x) => x !== a.id) : [...cur, a.id];
                            patchBloc(b.id, { affinities: next });
                            saveBloc({ ...b, affinities: next });
                          }}
                          className={`px-2 py-1 rounded-sm border text-xs font-body font-semibold transition-colors ${
                            on
                              ? "border-crimson bg-crimson/10 text-crimson"
                              : disabled
                                ? "border-border text-muted-foreground/50 cursor-not-allowed"
                                : "border-bronze/50 text-muted-foreground hover:border-bronze hover:text-bronze-dark"
                          }`}
                        >
                          <span className="inline-flex items-center gap-1">
                            {affinityIconOf(a.id) && (
                              <img src={affinityIconOf(a.id)!} alt="" className="h-3.5 w-3.5 object-cover rounded-[2px]" />
                            )}
                            {affinityLabelOf(a.id)}
                          </span>
                        </button>
                      );
                    })}
                  </div>
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
