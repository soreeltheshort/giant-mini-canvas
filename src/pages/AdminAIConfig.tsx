import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import Header from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { toast } from "sonner";

interface Persona {
  id: string;
  name: string;
  description: string;
  model_key: string;
  system_prompt: string;
  aggression: number;
  expansionism: number;
  loyalty: number;
  risk_tolerance: number;
  economic_focus: number;
}

interface GoalWeight {
  id: string;
  persona_id: string;
  goal_type: string;
  base_weight: number;
  urgency_multiplier: number;
  threshold_json: any;
}

const MODELS = [
  "google/gemini-2.5-flash",
  "google/gemini-2.5-flash-lite",
  "google/gemini-2.5-pro",
  "openai/gpt-5",
  "openai/gpt-5-mini",
  "openai/gpt-5-nano",
];

const TRAITS = ["aggression", "expansionism", "loyalty", "risk_tolerance", "economic_focus"] as const;
type Trait = (typeof TRAITS)[number];

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
      model_key: "google/gemini-2.5-flash",
      system_prompt: "",
    } as any);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Persona created");
    reload();
  };

  if (loading) return <div className="min-h-screen bg-background"><Header /><div className="container py-20 text-center text-muted-foreground">Loading...</div></div>;

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="container max-w-4xl py-8 space-y-8">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-accent">AI Configuration</h1>
          {isAdmin && (
            <Button size="sm" onClick={addPersona} disabled={busy}>+ Add Persona</Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Configure AI personas (model, system prompt, trait sliders) and the per-persona weighting that biases goal selection.
        </p>

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
          <Button size="sm" variant="ghost" className="text-destructive" onClick={remove}>Delete</Button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <Label className="text-[10px] text-muted-foreground">Model</Label>
          <select
            value={draft.model_key}
            disabled={!isAdmin}
            onChange={(e) => { patch({ model_key: e.target.value }); saveField({ model_key: e.target.value }); }}
            className="h-9 w-full rounded border border-border bg-background px-2 text-sm"
          >
            {MODELS.map((m) => <option key={m} value={m}>{m}</option>)}
            {!MODELS.includes(draft.model_key) && <option value={draft.model_key}>{draft.model_key}</option>}
          </select>
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
      </div>

      <div>
        <Label className="text-[10px] text-muted-foreground">System prompt</Label>
        <Textarea
          value={draft.system_prompt}
          disabled={!isAdmin}
          onChange={(e) => patch({ system_prompt: e.target.value })}
          onBlur={() => saveField({ system_prompt: draft.system_prompt })}
          rows={4}
          className="text-sm font-mono"
        />
      </div>

      <div className="space-y-3">
        <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Trait Sliders (0 – 1)</Label>
        {TRAITS.map((t) => (
          <div key={t} className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs capitalize">{t.replace("_", " ")}</span>
              <span className="text-xs font-mono">{Number(draft[t]).toFixed(2)}</span>
            </div>
            <Slider
              value={[Number(draft[t]) * 100]}
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

      <GoalWeights personaId={persona.id} weights={weights} isAdmin={isAdmin} onChanged={onChanged} />
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

  const addRow = async () => {
    const goal_type = newType.trim();
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

  return (
    <div className="space-y-2 border-t border-border pt-3">
      <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Goal Weights</Label>
      {weights.length === 0 && (
        <p className="text-xs text-muted-foreground">No goal weights defined. Add a goal type below to bias this persona toward or against it.</p>
      )}
      {weights.map((w) => (
        <GoalWeightRow key={w.id} row={w} isAdmin={isAdmin} onUpdate={updateRow} onRemove={removeRow} />
      ))}
      {isAdmin && (
        <div className="flex gap-2 pt-1">
          <Input
            value={newType}
            placeholder="goal_type (e.g. expand, defend, attack_player)"
            onChange={(e) => setNewType(e.target.value)}
            className="h-8 flex-1 text-sm"
          />
          <Button size="sm" variant="outline" disabled={!newType.trim()} onClick={addRow}>+ Goal</Button>
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
  useEffect(() => setDraft(row), [row.id]);
  const patch = (p: Partial<GoalWeight>) => setDraft((d) => ({ ...d, ...p }));

  return (
    <div className="flex items-end gap-2 rounded border border-border px-2 py-1.5">
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
  );
}
