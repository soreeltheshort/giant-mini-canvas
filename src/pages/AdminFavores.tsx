import { useCallback, useEffect, useMemo, useState } from "react";
import Header from "@/components/Header";
import PageMeta from "@/components/PageMeta";
import FavorSetToolbar from "@/components/FavorSetToolbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Trash2, ArrowUp, ArrowDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Favor, addFavor, deleteFavor, listFavors, updateFavor } from "@/lib/favores";
import {
  CRITERION_TYPES,
  FavorVariable,
  RARITIES,
  criterionDef,
  defaultCriterionParams,
  defaultRarityWeight,
  parseDescriptionVariables,
} from "@/lib/favorCriteria";
import { TRIGGER_TYPES, defaultTriggerParams, triggerDef } from "@/lib/favorTriggers";
import { AFFINITIES } from "@/lib/senateAffinities";
import { SenateBloc, listSenateBlocs, getDefaultSenateBlocSetId } from "@/lib/senateBlocs";

/**
 * Assets > Favores — admin editor for Favor templates.
 * Favores are mini-quests; rewards are applied to SENATE BLOCS and affinities,
 * never to military factions.
 */
export default function AdminFavores() {
  const { user, isAdmin } = useAuth();
  const [activeSetId, setActiveSetId] = useState<string | null>(null);
  const [favors, setFavors] = useState<Favor[]>([]);
  const [blocs, setBlocs] = useState<SenateBloc[]>([]);
  const [facilities, setFacilities] = useState<{ id: string; name: string }[]>([]);
  const [busy, setBusy] = useState(false);

  const loadFavors = useCallback(async (setId: string | null) => {
    setFavors(setId ? await listFavors(setId).catch(() => []) : []);
  }, []);

  useEffect(() => {
    loadFavors(activeSetId);
  }, [activeSetId, loadFavors]);

  useEffect(() => {
    (async () => {
      const blocSetId = await getDefaultSenateBlocSetId().catch(() => null);
      setBlocs(blocSetId ? await listSenateBlocs(blocSetId).catch(() => []) : []);
      const { data } = await (supabase as any).from("facility_types").select("id, name").order("name");
      setFacilities(data || []);
    })();
  }, []);

  const blocName = useMemo(() => new Map(blocs.map((b) => [b.id, b.name])), [blocs]);

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
    try {
      await fn();
    } catch (e: any) {
      toast.error(e.message ?? String(e));
    } finally {
      setBusy(false);
    }
  };

  const patch = (id: string, updates: Partial<Favor>) =>
    setFavors((prev) => prev.map((f) => (f.id === id ? { ...f, ...updates } : f)));

  const save = async (f: Favor) => {
    try {
      await updateFavor(f.id, {
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
      });
    } catch (e: any) {
      toast.error(e.message ?? String(e));
    }
  };

  const handleAdd = () =>
    withBusy(async () => {
      if (!activeSetId) return;
      const max = favors.reduce((m, f) => Math.max(m, f.sort_order), 0);
      await addFavor(activeSetId, max + 1);
      await loadFavors(activeSetId);
    });

  const move = (index: number, dir: -1 | 1) =>
    withBusy(async () => {
      const cur = favors[index];
      const other = favors[index + dir];
      if (!cur || !other) return;
      await updateFavor(cur.id, { sort_order: other.sort_order });
      await updateFavor(other.id, { sort_order: cur.sort_order });
      await loadFavors(activeSetId);
    });

  const remove = (f: Favor) =>
    withBusy(async () => {
      if (!confirm(`Delete "${f.name}"?`)) return;
      await deleteFavor(f.id);
      await loadFavors(activeSetId);
    });

  const toggleBloc = (f: Favor, id: string) => {
    const cur = f.target_bloc_ids ?? [];
    const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
    patch(f.id, { target_bloc_ids: next });
    save({ ...f, target_bloc_ids: next });
  };

  const toggleAffinity = (f: Favor, id: string) => {
    const cur = f.target_affinities ?? [];
    const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
    patch(f.id, { target_affinities: next });
    save({ ...f, target_affinities: next });
  };

  const setTriggerParam = (f: Favor, key: string, value: any) => {
    const next = { ...(f.trigger_params ?? {}), [key]: value };
    patch(f.id, { trigger_params: next });
    return { ...f, trigger_params: next };
  };

  const setParam = (f: Favor, key: string, value: any) => {
    const next = { ...(f.criterion_params ?? {}), [key]: value };
    patch(f.id, { criterion_params: next });
    return { ...f, criterion_params: next };
  };

  const setVariables = (f: Favor, vars: FavorVariable[]) => {
    patch(f.id, { variables: vars });
    save({ ...f, variables: vars });
  };

  return (
    <div className="min-h-screen bg-background">
      <PageMeta
        title="Favores — Mini-Quest Editor"
        description="Create and edit Favores: mini-quests with criteria, rarity and senate bloc rewards."
        path="/admin/favores"
      />
      <Header />
      <div className="container mx-auto px-4 py-10 max-w-5xl">
        <h1 className="font-heading text-2xl font-bold uppercase tracking-[0.2em] text-foreground mb-6">Favores</h1>

        <FavorSetToolbar value={activeSetId} onChange={setActiveSetId} userId={user?.id} disabled={busy} />

        <div className="flex items-center justify-between mt-8 mb-3">
          <div className="font-heading text-sm uppercase tracking-[0.25em] text-bronze">
            Favores · {favors.length}
          </div>
          <Button size="sm" onClick={handleAdd} disabled={busy || !activeSetId}>
            <Plus className="h-4 w-4 mr-1" />
            Add Favor
          </Button>
        </div>

        {!activeSetId ? (
          <p className="font-body text-muted-foreground">Create or select a set to begin.</p>
        ) : favors.length === 0 ? (
          <p className="font-body text-muted-foreground">No Favores in this set yet.</p>
        ) : (
          <div className="space-y-4">
            {favors.map((f, i) => {
              const def = criterionDef(f.criterion_type);
              const tdef = triggerDef(f.trigger_type || "none");
              const declared = parseDescriptionVariables(f.description);
              return (
                <div key={f.id} className="border border-bronze/40 rounded-sm p-4 bg-card space-y-4">
                  {/* Header row */}
                  <div className="flex flex-wrap items-center gap-2">
                    <Input
                      value={f.name}
                      onChange={(e) => patch(f.id, { name: e.target.value })}
                      onBlur={() => save(f)}
                      className="max-w-sm font-heading"
                    />
                    <div className="flex-1" />
                    <Button variant="ghost" size="icon" onClick={() => move(i, -1)} disabled={busy || i === 0}>
                      <ArrowUp className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => move(i, 1)}
                      disabled={busy || i === favors.length - 1}
                    >
                      <ArrowDown className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => remove(f)} disabled={busy}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>

                  {/* Description */}
                  <div className="space-y-1.5">
                    <Label>Description</Label>
                    <Textarea
                      value={f.description}
                      onChange={(e) => patch(f.id, { description: e.target.value })}
                      onBlur={() => save(f)}
                      rows={2}
                      placeholder="Donate {amount} credits to the Temple of Concord."
                    />
                    <p className="text-xs font-body text-muted-foreground">
                      Wrap random elements in braces, e.g. <code>{"{amount}"}</code>.
                    </p>
                  </div>

                  {/* Variables */}
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <Label>Variables</Label>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          setVariables(f, [
                            ...(f.variables ?? []),
                            { key: declared.find((d) => !(f.variables ?? []).some((v) => v.key === d)) ?? "amount", min: 1, max: 10, step: 1 },
                          ])
                        }
                      >
                        <Plus className="h-3 w-3 mr-1" />
                        Add Variable
                      </Button>
                    </div>
                    {(f.variables ?? []).length === 0 ? (
                      <p className="text-xs font-body text-muted-foreground">
                        {declared.length
                          ? `Description uses: ${declared.join(", ")} — add them here.`
                          : "No variables."}
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {(f.variables ?? []).map((v, vi) => {
                          const upd = (patchV: Partial<FavorVariable>) => {
                            const next = (f.variables ?? []).map((x, xi) => (xi === vi ? { ...x, ...patchV } : x));
                            patch(f.id, { variables: next });
                          };
                          return (
                            <div key={vi} className="flex flex-wrap items-center gap-2">
                              <Input
                                value={v.key}
                                onChange={(e) => upd({ key: e.target.value })}
                                onBlur={() => save(f)}
                                className="w-40"
                                placeholder="key"
                              />
                              <NumBox label="Min" value={v.min} onChange={(n) => upd({ min: n })} onCommit={() => save(f)} />
                              <NumBox label="Max" value={v.max} onChange={(n) => upd({ max: n })} onCommit={() => save(f)} />
                              <NumBox label="Step" value={v.step} onChange={(n) => upd({ step: n })} onCommit={() => save(f)} />
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setVariables(f, (f.variables ?? []).filter((_, xi) => xi !== vi))}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Criterion + rarity */}
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label>Criterion</Label>
                      <Select
                        value={f.criterion_type}
                        onValueChange={(val) => {
                          const next = { ...f, criterion_type: val, criterion_params: defaultCriterionParams(val) };
                          patch(f.id, { criterion_type: val, criterion_params: next.criterion_params });
                          save(next);
                        }}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent className="bg-background z-50">
                          {CRITERION_TYPES.map((c) => (
                            <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {def && <p className="text-xs font-body text-muted-foreground">{def.description}</p>}
                    </div>

                    <div className="space-y-1.5">
                      <Label>Rarity</Label>
                      <div className="flex items-center gap-2">
                        <Select
                          value={f.rarity}
                          onValueChange={(val) => {
                            const next = { ...f, rarity: val, rarity_weight: defaultRarityWeight(val) };
                            patch(f.id, { rarity: val, rarity_weight: next.rarity_weight });
                            save(next);
                          }}
                        >
                          <SelectTrigger className="flex-1"><SelectValue /></SelectTrigger>
                          <SelectContent className="bg-background z-50">
                            {RARITIES.map((r) => (
                              <SelectItem key={r.id} value={r.id}>{r.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <NumBox
                          label="Weight"
                          value={f.rarity_weight ?? 100}
                          onChange={(n) => patch(f.id, { rarity_weight: n })}
                          onCommit={() => save(f)}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Criterion params */}
                  {def && def.fields.length > 0 && (
                    <div className="flex flex-wrap items-end gap-3">
                      {def.fields.map((field) => {
                        const val = (f.criterion_params ?? {})[field.key] ?? field.default;
                        if (field.type === "facility") {
                          return (
                            <div key={field.key} className="space-y-1.5">
                              <Label>{field.label}</Label>
                              <Select
                                value={String(val || "")}
                                onValueChange={(v) => save(setParam(f, field.key, v))}
                              >
                                <SelectTrigger className="min-w-[14rem]">
                                  <SelectValue placeholder="Select a facility" />
                                </SelectTrigger>
                                <SelectContent className="bg-background z-50">
                                  {facilities.map((ft) => (
                                    <SelectItem key={ft.id} value={ft.id}>{ft.name}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          );
                        }
                        return (
                          <NumBox
                            key={field.key}
                            label={field.label}
                            value={Number(val) || 0}
                            onChange={(n) => setParam(f, field.key, n)}
                            onCommit={() => save(favors.find((x) => x.id === f.id) ?? f)}
                            width="w-32"
                          />
                        );
                      })}
                    </div>
                  )}

                  {/* Trigger */}
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label>Trigger</Label>
                      <Select
                        value={f.trigger_type || "none"}
                        onValueChange={(val) => {
                          const next = { ...f, trigger_type: val, trigger_params: defaultTriggerParams(val) };
                          patch(f.id, { trigger_type: val, trigger_params: next.trigger_params });
                          save(next);
                        }}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent className="bg-background z-50">
                          {TRIGGER_TYPES.map((t) => (
                            <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {tdef && <p className="text-xs font-body text-muted-foreground">{tdef.description}</p>}
                    </div>

                    {tdef && tdef.fields.length > 0 && (
                      <div className="flex flex-wrap items-end gap-3">
                        {tdef.fields.map((field) => (
                          <NumBox
                            key={field.key}
                            label={field.label}
                            value={Number((f.trigger_params ?? {})[field.key] ?? field.default) || 0}
                            onChange={(n) => setTriggerParam(f, field.key, n)}
                            onCommit={() => save(favors.find((x) => x.id === f.id) ?? f)}
                            width="w-40"
                          />
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Rewards */}
                  <div className="flex flex-wrap items-end gap-3">
                    <NumBox
                      label="Bloc Reward"
                      value={f.bloc_reward ?? 0}
                      onChange={(n) => patch(f.id, { bloc_reward: n })}
                      onCommit={() => save(favors.find((x) => x.id === f.id) ?? f)}
                      width="w-32"
                    />
                    <NumBox
                      label="Affinity Reward"
                      value={f.affinity_reward ?? 0}
                      onChange={(n) => patch(f.id, { affinity_reward: n })}
                      onCommit={() => save(favors.find((x) => x.id === f.id) ?? f)}
                      width="w-32"
                    />
                  </div>

                  {/* Targets */}
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label>Target Senate Blocs</Label>
                      <div className="flex flex-wrap gap-1.5">
                        {blocs.length === 0 ? (
                          <span className="text-xs font-body text-muted-foreground">No senate blocs configured.</span>
                        ) : (
                          blocs.map((b) => {
                            const on = (f.target_bloc_ids ?? []).includes(b.id);
                            return (
                              <button
                                key={b.id}
                                onClick={() => toggleBloc(f, b.id)}
                                className={`px-2.5 py-1 rounded-sm border text-xs font-heading font-bold uppercase tracking-wider transition-colors ${
                                  on
                                    ? "border-crimson bg-crimson/15 text-crimson"
                                    : "border-bronze/50 text-muted-foreground hover:text-bronze"
                                }`}
                              >
                                {b.name}
                              </button>
                            );
                          })
                        )}
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <Label>Target Affinities</Label>
                      <div className="flex flex-wrap gap-1.5">
                        {AFFINITIES.map((a) => {
                          const on = (f.target_affinities ?? []).includes(a.id);
                          return (
                            <button
                              key={a.id}
                              onClick={() => toggleAffinity(f, a.id)}
                              className={`px-2.5 py-1 rounded-sm border text-xs font-heading font-bold uppercase tracking-wider transition-colors ${
                                on
                                  ? "border-crimson bg-crimson/15 text-crimson"
                                  : "border-bronze/50 text-muted-foreground hover:text-bronze"
                              }`}
                            >
                              {a.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {(f.target_bloc_ids ?? []).length > 0 && (
                    <p className="text-xs font-body text-muted-foreground">
                      Rewards go to: {(f.target_bloc_ids ?? []).map((id) => blocName.get(id) ?? id).join(", ")}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <div className="text-xs font-heading uppercase tracking-[0.25em] text-bronze">{children}</div>;
}

function NumBox({
  label,
  value,
  onChange,
  onCommit,
  width = "w-24",
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  onCommit: () => void;
  width?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        onBlur={onCommit}
        className={width}
      />
    </div>
  );
}
