import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import Header from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import AIInspector from "@/components/admin/ai/AIInspector";
import FollowthroughEditor from "@/components/admin/ai/FollowthroughEditor";
import { seedDefaultPersonas } from "@/lib/ai/seedDefaultPersonas";
import { GOAL_CODES } from "@/lib/ai/goalCatalog";

interface Persona {
  id: string;
  name: string;
  description: string;


  aggression: number;
  expansionism: number;
  loyalty: number;
  risk_tolerance: number;
  economic_focus: number;
  paranoia: number;
  diplomacy: number;
  enemy_strength_total_tolerance_pct: number;
  enemy_strength_nearby_tolerance_pct: number;
}

interface GoalWeight {
  id: string;
  persona_id: string;
  goal_type: string;
  base_weight: number;
  urgency_multiplier: number;
  threshold_json: any;
}




const TRAITS = [
  "aggression",
  "expansionism",
  "economic_focus",
  "risk_tolerance",
  "loyalty",
  "paranoia",
  "diplomacy",
] as const;

const GOAL_TYPES = [
  ...GOAL_CODES,
  // Legacy types kept selectable for back-compat with older personas:
  "defend_system",
  "capture_system",
  "eliminate_player",
  "accumulate_treasury",
  "build_fleet",
  "survey_region",
  "maintain_alliance",
];

export default function AdminAIConfig() {
  const { user, loading, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [weights, setWeights] = useState<GoalWeight[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && !user) navigate("/login");
  }, [loading, user, navigate]);

  const reload = async () => {
    const [{ data: p }, { data: w }] = await Promise.all([
      supabase.from("ai_personas").select("*").order("name"),
      supabase.from("ai_persona_goal_weights").select("*"),
    ]);
    setPersonas((p ?? []) as any);
    setWeights((w ?? []) as any);
  };

  useEffect(() => {
    reload();
  }, []);

  const addPersona = async () => {
    setBusy(true);
    const { error } = await supabase.from("ai_personas").insert({
      name: "New Persona",
      description: "",
    } as any);

    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Persona created");
    reload();
  };

  const seedDefaults = async () => {
    setBusy(true);
    try {
      const { inserted, skipped } = await seedDefaultPersonas();
      toast.success(`Seed complete — ${inserted} added, ${skipped} already existed`);
      reload();
    } catch (e: any) {
      toast.error(e.message ?? "Seed failed");
    } finally {
      setBusy(false);
    }
  };

  if (loading)
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="container py-20 text-center text-muted-foreground">Loading...</div>
      </div>
    );

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="container max-w-5xl py-8 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-accent">AI Configuration</h1>
        </div>
        <p className="text-xs text-muted-foreground">
          Tune AI personas with trait sliders and goal-weight matrices. The Inspector tab shows what each AI thought, planned, and did on past turns.
        </p>


        <Tabs defaultValue="personas">
          <TabsList>
            <TabsTrigger value="personas">Personas</TabsTrigger>
            <TabsTrigger value="inspector">Inspector</TabsTrigger>
          </TabsList>

          <TabsContent value="personas" className="space-y-6 pt-4">
            {isAdmin && (
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={addPersona} disabled={busy}>+ New persona</Button>
                <Button size="sm" variant="outline" onClick={seedDefaults} disabled={busy}>
                  Seed defaults
                </Button>
                <span className="text-[11px] text-muted-foreground self-center">
                  Seed inserts Warlord, Trade Senator, Paranoid Isolationist if missing. Safe to run twice.
                </span>
              </div>
            )}

            {personas.length === 0 ? (
              <p className="text-sm text-muted-foreground">No personas defined yet.</p>
            ) : (
              <div className="space-y-6">
                {personas.map((p) => (
                  <PersonaCard
                    key={p.id}
                    persona={p}
                    weights={weights.filter((w) => w.persona_id === p.id)}
                    isAdmin={isAdmin}
                    onChanged={reload}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="inspector" className="pt-4">
            <AIInspector />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function PersonaCard({
  persona,
  weights,
  isAdmin,
  onChanged,
}: {
  persona: Persona;
  weights: GoalWeight[];
  isAdmin: boolean;
  onChanged: () => void;
}) {
  const [draft, setDraft] = useState<Persona>(persona);
  const [savingTrait, setSavingTrait] = useState(false);
  useEffect(() => setDraft(persona), [persona.id]);

  const patch = (p: Partial<Persona>) => setDraft((d) => ({ ...d, ...p }));

  const saveField = async (fields: Partial<Persona>) => {
    if (!isAdmin) return;
    const { error } = await supabase.from("ai_personas").update(fields as any).eq("id", persona.id);
    if (error) toast.error(error.message);
  };

  const duplicate = async () => {
    const { data: created, error } = await supabase
      .from("ai_personas")
      .insert({
        name: `${persona.name} (copy)`,
        description: persona.description,
        aggression: persona.aggression,

        expansionism: persona.expansionism,
        loyalty: persona.loyalty,
        risk_tolerance: persona.risk_tolerance,
        economic_focus: persona.economic_focus,
        paranoia: persona.paranoia,
        diplomacy: persona.diplomacy,
      } as any)
      .select()
      .single();
    if (error || !created) return toast.error(error?.message ?? "Duplicate failed");
    if (weights.length > 0) {
      const rows = weights.map((w) => ({
        persona_id: (created as any).id,
        goal_type: w.goal_type,
        base_weight: w.base_weight,
        urgency_multiplier: w.urgency_multiplier,
        threshold_json: w.threshold_json ?? {},
      }));
      await supabase.from("ai_persona_goal_weights").insert(rows as any);
    }
    toast.success("Duplicated");
    onChanged();
  };

  const remove = async () => {
    if (!confirm(`Delete persona "${persona.name}"? This also removes its goal weights.`)) return;
    await supabase.from("ai_persona_goal_weights").delete().eq("persona_id", persona.id);
    const { error } = await supabase.from("ai_personas").delete().eq("id", persona.id);
    if (error) return toast.error(error.message);
    toast.success("Deleted");
    onChanged();
  };

  return (
    <div className="rounded border border-border p-4 space-y-4">
      <div className="flex items-start gap-2">
        <Input
          value={draft.name}
          disabled={!isAdmin}
          onChange={(e) => patch({ name: e.target.value })}
          onBlur={() => saveField({ name: draft.name })}
          className="h-9 flex-1 font-semibold"
        />
        {isAdmin && (
          <>
            <Button size="sm" variant="outline" onClick={duplicate}>Duplicate</Button>
            <Button size="sm" variant="ghost" className="text-destructive" onClick={remove}>Delete</Button>
          </>
        )}
      </div>

      <div>
        <Label className="text-[10px] text-muted-foreground">Short description</Label>
        <Input
          value={draft.description}
          disabled={!isAdmin}
          onChange={(e) => patch({ description: e.target.value })}
          onBlur={() => saveField({ description: draft.description })}
          className="h-9"
        />
      </div>





      <div className="space-y-3">
        <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Trait Sliders (0 – 1)</Label>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3">
          {TRAITS.map((t) => (
            <div key={t} className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs capitalize">{t.replace("_", " ")}</span>
                <span className="text-xs font-mono">{Number(draft[t] ?? 0).toFixed(2)}</span>
              </div>
              <Slider
                value={[Number(draft[t] ?? 0) * 100]}
                min={0}
                max={100}
                step={1}
                disabled={!isAdmin || savingTrait}
                onValueChange={([v]) => patch({ [t]: v / 100 } as any)}
                onValueCommit={async ([v]) => {
                  setSavingTrait(true);
                  await saveField({ [t]: v / 100 } as Partial<Persona>);
                  setSavingTrait(false);
                }}
              />
            </div>
          ))}
        </div>
      </div>

      <GoalWeights personaId={persona.id} weights={weights} isAdmin={isAdmin} onChanged={onChanged} />
      <FollowthroughEditor personaId={persona.id} isAdmin={isAdmin} />
    </div>
  );
}

function GoalWeights({
  personaId,
  weights,
  isAdmin,
  onChanged,
}: {
  personaId: string;
  weights: GoalWeight[];
  isAdmin: boolean;
  onChanged: () => void;
}) {
  const [newType, setNewType] = useState("");

  const updateRow = async (id: string, fields: Partial<GoalWeight>) => {
    const { error } = await supabase.from("ai_persona_goal_weights").update(fields as any).eq("id", id);
    if (error) toast.error(error.message);
  };

  const addRow = async (goalTypeArg?: string) => {
    const goal_type = (goalTypeArg ?? newType).trim();
    if (!goal_type) return;
    const { error } = await supabase.from("ai_persona_goal_weights").insert({
      persona_id: personaId,
      goal_type,
      base_weight: 1,
      urgency_multiplier: 1,
      threshold_json: {},
    } as any);
    if (error) return toast.error(error.message);
    setNewType("");
    onChanged();
  };

  const removeRow = async (id: string) => {
    const { error } = await supabase.from("ai_persona_goal_weights").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    onChanged();
  };

  const definedTypes = new Set(weights.map((w) => w.goal_type));

  return (
    <div className="space-y-2 border-t border-border pt-3">
      <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Goal Weights</Label>
      {weights.length === 0 && (
        <p className="text-xs text-muted-foreground">No goal weights defined. Use a known goal type below, or type a custom one.</p>
      )}
      {weights.map((w) => (
        <GoalWeightRow key={w.id} row={w} isAdmin={isAdmin} onUpdate={updateRow} onRemove={removeRow} />
      ))}
      {isAdmin && (
        <div className="space-y-2 pt-1">
          <div className="flex flex-wrap gap-1">
            {GOAL_TYPES.filter((g) => !definedTypes.has(g)).map((g) => (
              <Button key={g} size="sm" variant="outline" className="h-7 text-xs" onClick={() => addRow(g)}>
                + {g}
              </Button>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              value={newType}
              placeholder="custom goal_type"
              onChange={(e) => setNewType(e.target.value)}
              className="h-8 flex-1 text-sm"
            />
            <Button size="sm" variant="outline" disabled={!newType.trim()} onClick={() => addRow()}>+ Add</Button>
          </div>
        </div>
      )}
    </div>
  );
}

function GoalWeightRow({
  row,
  isAdmin,
  onUpdate,
  onRemove,
}: {
  row: GoalWeight;
  isAdmin: boolean;
  onUpdate: (id: string, fields: Partial<GoalWeight>) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState(row);
  const [thresholdText, setThresholdText] = useState(() => JSON.stringify(row.threshold_json ?? {}, null, 0));
  const [thresholdError, setThresholdError] = useState<string | null>(null);
  useEffect(() => {
    setDraft(row);
    setThresholdText(JSON.stringify(row.threshold_json ?? {}, null, 0));
    setThresholdError(null);
  }, [row.id]);
  const patch = (p: Partial<GoalWeight>) => setDraft((d) => ({ ...d, ...p }));

  const commitThreshold = async () => {
    try {
      const parsed = thresholdText.trim() === "" ? {} : JSON.parse(thresholdText);
      setThresholdError(null);
      await onUpdate(row.id, { threshold_json: parsed });
    } catch (e: any) {
      setThresholdError("Invalid JSON");
    }
  };

  return (
    <div className="space-y-1 rounded border border-border px-2 py-1.5">
      <div className="flex items-end gap-2">
        <div className="flex-1 min-w-0">
          <Label className="text-[10px] text-muted-foreground">Goal type</Label>
          <Input
            value={draft.goal_type}
            disabled={!isAdmin}
            onChange={(e) => patch({ goal_type: e.target.value })}
            onBlur={() => onUpdate(row.id, { goal_type: draft.goal_type })}
            className="h-7 text-sm font-mono"
          />
        </div>
        <div className="w-20">
          <Label className="text-[10px] text-muted-foreground">Base</Label>
          <Input
            type="number"
            step="0.1"
            value={draft.base_weight}
            disabled={!isAdmin}
            onChange={(e) => patch({ base_weight: Number(e.target.value) })}
            onBlur={() => onUpdate(row.id, { base_weight: draft.base_weight })}
            className="h-7 text-sm text-right font-mono"
          />
        </div>
        <div className="w-20">
          <Label className="text-[10px] text-muted-foreground">Urgency×</Label>
          <Input
            type="number"
            step="0.1"
            value={draft.urgency_multiplier}
            disabled={!isAdmin}
            onChange={(e) => patch({ urgency_multiplier: Number(e.target.value) })}
            onBlur={() => onUpdate(row.id, { urgency_multiplier: draft.urgency_multiplier })}
            className="h-7 text-sm text-right font-mono"
          />
        </div>
        {isAdmin && (
          <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive" onClick={() => onRemove(row.id)}>×</Button>
        )}
      </div>
      <div>
        <Label className="text-[10px] text-muted-foreground">threshold_json</Label>
        <Input
          value={thresholdText}
          disabled={!isAdmin}
          onChange={(e) => setThresholdText(e.target.value)}
          onBlur={commitThreshold}
          placeholder='{"min_treasury":100}'
          className={`h-7 text-xs font-mono ${thresholdError ? "border-destructive" : ""}`}
        />
        {thresholdError && <p className="text-[10px] text-destructive">{thresholdError}</p>}
      </div>
    </div>
  );
}
