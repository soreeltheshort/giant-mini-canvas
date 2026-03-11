import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useFacilityTypes } from "@/hooks/useFacilityTypes";
import { useFactions } from "@/hooks/useFactions";
import { DbFacilityType } from "@/hooks/useFacilityTypes";
import { useSystemActions } from "@/hooks/useSystemActions";
import Header from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  ALL_CLASSIFICATIONS,
  CLASSIFICATION_LABELS,
  CLASSIFICATION_COLORS,
  HexClassification,
} from "@/lib/mapTypes";
import { loadRandomizeParams, saveRandomizeParams } from "@/lib/randomizeSystems";

const MapTestingConfig = () => {
  const { user, loading, isAdmin } = useAuth();
  const navigate = useNavigate();
  const { facilityTypes, loading: ftLoading, addFacilityType, updateFacilityType, removeFacilityType } = useFacilityTypes();
  const { factions, loading: facLoading, addFaction, updateFaction, removeFaction } = useFactions();
  const { actions, loading: actLoading, addAction, updateAction, removeAction } = useSystemActions();

  // facility form state removed — now in AddFacilityForm

  // Faction form
  const [newFacName, setNewFacName] = useState("");
  const [newFacColor, setNewFacColor] = useState("#888888");

  // Action form
  const [newActName, setNewActName] = useState("");
  const [newActDesc, setNewActDesc] = useState("");
  const [newActIcon, setNewActIcon] = useState("⚡");

  // Random system generation params
  const [params, setParams] = useState(() => loadRandomizeParams());
  const selectedProvinces = params.provinces;
  const hexesPerSystem = params.hexesPerSystem;
  const minDistance = params.minDistance;
  const forceEvenDistribution = params.forceEvenDistribution;

  const updateParams = (patch: Partial<typeof params>) => {
    setParams((prev) => {
      const next = { ...prev, ...patch };
      saveRandomizeParams(next);
      return next;
    });
  };
  const setSelectedProvinces = (fn: (prev: HexClassification[]) => HexClassification[]) =>
    updateParams({ provinces: fn(params.provinces) });
  const setHexesPerSystem = (v: number) => updateParams({ hexesPerSystem: v });
  const setMinDistance = (v: number) => updateParams({ minDistance: v });
  const setForceEvenDistribution = (v: boolean) => updateParams({ forceEvenDistribution: v });

  useEffect(() => {
    if (!loading && !user) navigate("/login");
  }, [loading, user, navigate]);

  if (loading || ftLoading || facLoading || actLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="container py-20 text-center text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header />
      <div className="container max-w-2xl py-8 space-y-10">
        <h1 className="text-xl font-semibold text-foreground">Map Testing Configuration</h1>

        {/* ── Factions ── */}
        <ConfigSection title="Factions" desc="Define the factions that can own systems. These are shared across all maps.">
          {factions.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">No factions defined yet.</p>
          ) : (
            <div className="space-y-2">
              {factions.map((f) => (
                <FactionRow key={f.id} faction={f} isAdmin={isAdmin} onUpdate={updateFaction} onRemove={removeFaction} />
              ))}
            </div>
          )}
          {isAdmin && (
            <div className="border border-border rounded-md p-4 space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Add New Faction</p>
              <div className="flex gap-2">
                <Input type="color" value={newFacColor} onChange={(e) => setNewFacColor(e.target.value)} className="h-9 w-12 p-1 cursor-pointer" />
                <Input value={newFacName} onChange={(e) => setNewFacName(e.target.value)} className="h-9 flex-1" placeholder="Faction name" />
              </div>
              <Button size="sm" disabled={!newFacName.trim()} onClick={async () => { await addFaction(newFacName.trim(), newFacColor); setNewFacName(""); setNewFacColor("#888888"); }}>
                Add Faction
              </Button>
            </div>
          )}
        </ConfigSection>

        {/* ── Actions ── */}
        <ConfigSection title="System Actions" desc="Define economic actions that can be assigned to systems (e.g. Trade, Build, Mine).">
          {actions.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">No actions defined yet.</p>
          ) : (
            <div className="space-y-2">
              {actions.map((a) => (
                <ActionRow key={a.id} action={a} isAdmin={isAdmin} onUpdate={updateAction} onRemove={removeAction} />
              ))}
            </div>
          )}
          {isAdmin && (
            <div className="border border-border rounded-md p-4 space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Add New Action</p>
              <div className="flex gap-2">
                <Input value={newActIcon} onChange={(e) => setNewActIcon(e.target.value)} className="h-9 w-14 text-center" placeholder="⚡" />
                <Input value={newActName} onChange={(e) => setNewActName(e.target.value)} className="h-9 flex-1" placeholder="Action name" />
              </div>
              <Input value={newActDesc} onChange={(e) => setNewActDesc(e.target.value)} className="h-9" placeholder="Description (optional)" />
              <Button size="sm" disabled={!newActName.trim()} onClick={async () => { await addAction(newActName.trim(), newActDesc.trim(), newActIcon || "⚡"); setNewActName(""); setNewActDesc(""); setNewActIcon("⚡"); }}>
                Add Action
              </Button>
            </div>
          )}
        </ConfigSection>

        {/* ── Facility Types ── */}
        <ConfigSection title="Facility Types" desc="Define the types of facilities that can be placed on planets. These are shared across all maps.">
          {facilityTypes.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">No facility types defined yet.</p>
          ) : (
            <div className="space-y-2">
              {facilityTypes.map((ft) => (
                <FacilityTypeRow key={ft.id} ft={ft} isAdmin={isAdmin} onUpdate={updateFacilityType} onRemove={removeFacilityType} allFacilityTypes={facilityTypes} />
              ))}
            </div>
          )}
          {isAdmin && <AddFacilityForm onAdd={addFacilityType} allFacilityTypes={facilityTypes} />}
        </ConfigSection>

        {/* ── Random System Generation ── */}
        <ConfigSection title="Random System Generation" desc="Configure parameters for randomly placing solar systems on the map.">
          <div className="space-y-2">
            <Label className="text-xs font-medium text-muted-foreground">Provinces to Randomize</Label>
            <div className="grid grid-cols-2 gap-2">
              {ALL_CLASSIFICATIONS.map((cls) => (
                <label key={cls} className="flex items-center gap-2 rounded border border-border px-3 py-2 cursor-pointer hover:bg-accent/50 transition-colors">
                  <Checkbox checked={selectedProvinces.includes(cls)} onCheckedChange={(checked) => { setSelectedProvinces(prev => checked ? [...prev, cls] : prev.filter(c => c !== cls)); }} />
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: CLASSIFICATION_COLORS[cls] }} />
                  <span className="text-sm text-foreground">{CLASSIFICATION_LABELS[cls]}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium text-muted-foreground">Hexes per Solar System</Label>
              <span className="text-sm font-mono text-foreground">{hexesPerSystem}</span>
            </div>
            <Slider value={[hexesPerSystem]} onValueChange={([v]) => setHexesPerSystem(v)} min={5} max={200} step={1} />
            <p className="text-xs text-muted-foreground">One system will be placed for every {hexesPerSystem} hexes in each selected province.</p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium text-muted-foreground">Minimum Distance Between Systems</Label>
              <span className="text-sm font-mono text-foreground">{minDistance} hex{minDistance !== 1 ? "es" : ""}</span>
            </div>
            <Slider value={[minDistance]} onValueChange={([v]) => setMinDistance(v)} min={1} max={10} step={1} />
          </div>

          <label className="flex items-center gap-3 rounded border border-border px-3 py-3 cursor-pointer hover:bg-accent/50 transition-colors">
            <Checkbox checked={forceEvenDistribution} onCheckedChange={(checked) => setForceEvenDistribution(!!checked)} />
            <div>
              <p className="text-sm font-medium text-foreground">Force Even System Distribution</p>
              <p className="text-xs text-muted-foreground">Spread systems as evenly as possible across each province rather than placing randomly.</p>
            </div>
          </label>
        </ConfigSection>

        {/* ── Turn Economy Constants ── */}
        <TurnConstantsSection isAdmin={isAdmin} />
      </div>
    </div>
  );
};

/* ── Shared section wrapper ── */
function ConfigSection({ title, desc, children }: { title: string; desc: string; children: React.ReactNode }) {
  return (
    <div className="space-y-4">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{title}</h2>
      <p className="text-xs text-muted-foreground">{desc}</p>
      {children}
    </div>
  );
}

/* ── Faction row ── */
function FactionRow({ faction, isAdmin, onUpdate, onRemove }: {
  faction: { id: string; name: string; color: string };
  isAdmin: boolean;
  onUpdate: (id: string, updates: Partial<{ name: string; color: string }>) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(faction.name);
  const [color, setColor] = useState(faction.color);

  if (!editing) {
    return (
      <div className="flex items-center gap-3 rounded border border-border px-3 py-2">
        <span className="h-4 w-4 rounded-full shrink-0" style={{ backgroundColor: faction.color }} />
        <span className="text-sm font-medium text-foreground flex-1">{faction.name}</span>
        {isAdmin && (
          <div className="flex gap-1">
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditing(true)}>Edit</Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive" onClick={() => onRemove(faction.id)}>Delete</Button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="rounded border border-primary/50 px-3 py-2 space-y-2">
      <div className="flex gap-2">
        <Input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-8 w-12 p-1 cursor-pointer" />
        <Input value={name} onChange={(e) => setName(e.target.value)} className="h-8 flex-1" />
      </div>
      <div className="flex gap-1">
        <Button size="sm" className="h-7 text-xs" onClick={async () => { await onUpdate(faction.id, { name, color }); setEditing(false); }}>Save</Button>
        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditing(false)}>Cancel</Button>
      </div>
    </div>
  );
}

/* ── Action row ── */
function ActionRow({ action, isAdmin, onUpdate, onRemove }: {
  action: { id: string; name: string; description: string; icon: string };
  isAdmin: boolean;
  onUpdate: (id: string, updates: Partial<{ name: string; description: string; icon: string }>) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(action.name);
  const [desc, setDesc] = useState(action.description);
  const [icon, setIcon] = useState(action.icon);

  if (!editing) {
    return (
      <div className="flex items-center gap-3 rounded border border-border px-3 py-2">
        <span className="text-lg">{action.icon}</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground">{action.name}</p>
          {action.description && <p className="text-xs text-muted-foreground">{action.description}</p>}
        </div>
        {isAdmin && (
          <div className="flex gap-1">
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditing(true)}>Edit</Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive" onClick={() => onRemove(action.id)}>Delete</Button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="rounded border border-primary/50 px-3 py-2 space-y-2">
      <div className="flex gap-2">
        <Input value={icon} onChange={(e) => setIcon(e.target.value)} className="h-8 w-14 text-center" />
        <Input value={name} onChange={(e) => setName(e.target.value)} className="h-8 flex-1" />
      </div>
      <Input value={desc} onChange={(e) => setDesc(e.target.value)} className="h-8" placeholder="Description" />
      <div className="flex gap-1">
        <Button size="sm" className="h-7 text-xs" onClick={async () => { await onUpdate(action.id, { name, description: desc, icon }); setEditing(false); }}>Save</Button>
        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditing(false)}>Cancel</Button>
      </div>
    </div>
  );
}

/* ── Facility stat badges ── */
const STAT_DEFS: { key: keyof DbFacilityType; label: string; prefix?: string; suffix?: string }[] = [
  { key: "cost", label: "Cost" },
  { key: "maintenance", label: "Maint" },
  { key: "condition_bonus", label: "Condition", prefix: "+" },
  { key: "tribute_flat", label: "Tribute", prefix: "+" },
  { key: "tribute_percent", label: "Tribute %", prefix: "+", suffix: "%" },
  { key: "survey_bonus", label: "Survey", prefix: "+" },
  { key: "ground_defense_bonus", label: "Ground Def", prefix: "+" },
  { key: "turns_to_build", label: "Turns to Build" },
  { key: "construction_kickback", label: "Kickback", suffix: "%" },
  { key: "fighter_capacity", label: "Fighter Cap" },
  { key: "gunship_capacity", label: "Gunship Cap" },
];

function StatBadges({ ft, allFacilityTypes }: { ft: DbFacilityType; allFacilityTypes: DbFacilityType[] }) {
  const nonZero = STAT_DEFS.filter((s) => (ft[s.key] as number) !== 0);
  const consumed = ft.consumed_facility_id ? allFacilityTypes.find(f => f.id === ft.consumed_facility_id) : null;
  if (nonZero.length === 0 && !consumed) return null;
  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {nonZero.map((s) => (
        <span key={s.key} className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-mono">
          {s.label}: {s.prefix || ""}{ft[s.key] as number}{s.suffix || ""}
        </span>
      ))}
      {consumed && (
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-mono">
          Consumes: {consumed.icon} {consumed.name}
        </span>
      )}
    </div>
  );
}

/* ── Facility Type row ── */
function FacilityTypeRow({ ft, isAdmin, onUpdate, onRemove, allFacilityTypes }: {
  ft: DbFacilityType;
  isAdmin: boolean;
  onUpdate: (id: string, updates: Partial<Omit<DbFacilityType, "id">>) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
  allFacilityTypes: DbFacilityType[];
}) {
  const [editing, setEditing] = useState(false);
  const [fields, setFields] = useState<Omit<DbFacilityType, "id">>({ ...ft });
  const patch = (p: Partial<Omit<DbFacilityType, "id">>) => setFields((prev) => ({ ...prev, ...p }));

  if (!editing) {
    return (
      <div className="flex items-center gap-3 rounded border border-border px-3 py-2">
        <span className="text-lg">{ft.icon}</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground">{ft.name}</p>
          {ft.description && <p className="text-xs text-muted-foreground line-clamp-2">{ft.description}</p>}
          <StatBadges ft={ft} allFacilityTypes={allFacilityTypes} />
        </div>
        {isAdmin && (
          <div className="flex gap-1">
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditing(true)}>Edit</Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive" onClick={() => onRemove(ft.id)}>Delete</Button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="rounded border border-primary/50 px-3 py-2 space-y-2">
      <div className="flex gap-2">
        <Input value={fields.icon} onChange={(e) => patch({ icon: e.target.value })} className="h-8 w-14 text-center" />
        <Input value={fields.name} onChange={(e) => patch({ name: e.target.value })} className="h-8 flex-1" />
      </div>
      <Input value={fields.description} onChange={(e) => patch({ description: e.target.value })} className="h-8" placeholder="Description" />
      <FacilityNumericFields fields={fields} patch={patch} allFacilityTypes={allFacilityTypes} currentId={ft.id} />
      <div className="flex gap-1">
        <Button size="sm" className="h-7 text-xs" onClick={async () => { await onUpdate(ft.id, fields); setEditing(false); }}>Save</Button>
        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setFields({ ...ft }); setEditing(false); }}>Cancel</Button>
      </div>
    </div>
  );
}

/* ── Shared numeric fields for facility editing ── */
function FacilityNumericFields({ fields, patch, allFacilityTypes, currentId }: {
  fields: Omit<DbFacilityType, "id">;
  patch: (p: Partial<Omit<DbFacilityType, "id">>) => void;
  allFacilityTypes: DbFacilityType[];
  currentId?: string;
}) {
  const selectableTypes = allFacilityTypes.filter(f => f.id !== currentId);
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {STAT_DEFS.map((s) => (
          <div key={s.key} className="flex flex-col gap-0.5">
            <label className="text-[10px] text-muted-foreground">{s.label}</label>
            <Input
              type="number"
              value={(fields as any)[s.key]}
              onChange={(e) => patch({ [s.key]: parseInt(e.target.value) || 0 })}
              className="h-7 text-xs"
            />
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-0.5">
        <label className="text-[10px] text-muted-foreground">Consumed Facility</label>
        <select
          value={fields.consumed_facility_id || ""}
          onChange={(e) => patch({ consumed_facility_id: e.target.value || null })}
          className="h-7 text-xs rounded border border-input bg-background px-2"
        >
          <option value="">None</option>
          {selectableTypes.map(f => (
            <option key={f.id} value={f.id}>{f.icon} {f.name}</option>
          ))}
        </select>
      </div>
    </div>
  );
}

/* ── Add Facility Form ── */
function AddFacilityForm({ onAdd, allFacilityTypes }: { onAdd: (fields: Omit<DbFacilityType, "id">) => Promise<void>; allFacilityTypes: DbFacilityType[] }) {
  const empty: Omit<DbFacilityType, "id"> = {
    name: "", description: "", icon: "🏭",
    cost: 0, maintenance: 0, condition_bonus: 0,
    tribute_flat: 0, tribute_percent: 0, survey_bonus: 0, ground_defense_bonus: 0,
    turns_to_build: 1, construction_kickback: 0, consumed_facility_id: null,
    fighter_capacity: 0, gunship_capacity: 0,
  };
  const [fields, setFields] = useState(empty);
  const patch = (p: Partial<Omit<DbFacilityType, "id">>) => setFields((prev) => ({ ...prev, ...p }));

  return (
    <div className="border border-border rounded-md p-4 space-y-2">
      <p className="text-xs font-medium text-muted-foreground">Add New Facility Type</p>
      <div className="flex gap-2">
        <Input value={fields.icon} onChange={(e) => patch({ icon: e.target.value })} className="h-9 w-14 text-center" placeholder="🏭" />
        <Input value={fields.name} onChange={(e) => patch({ name: e.target.value })} className="h-9 flex-1" placeholder="Facility name" />
      </div>
      <Input value={fields.description} onChange={(e) => patch({ description: e.target.value })} className="h-9" placeholder="Description (optional)" />
      <FacilityNumericFields fields={fields} patch={patch} allFacilityTypes={allFacilityTypes} />
      <Button size="sm" disabled={!fields.name.trim()} onClick={async () => { await onAdd({ ...fields, name: fields.name.trim() }); setFields(empty); }}>
        Add Facility Type
      </Button>
    </div>
  );
}

/* ── Turn Economy Constants ── */
function TurnConstantsSection({ isAdmin }: { isAdmin: boolean }) {
  const [constants, setConstants] = useState<{ id: string; key: string; value: number; description: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from("combat_constants")
        .select("id, key, value, description")
        .order("key");
      if (data) setConstants(data.map((r) => ({ ...r, value: Number(r.value) })));
      setLoading(false);
    };
    load();
  }, []);

  const updateValue = async (id: string, newValue: number) => {
    setSaving(id);
    await supabase.from("combat_constants").update({ value: newValue }).eq("id", id);
    setConstants((prev) => prev.map((c) => (c.id === id ? { ...c, value: newValue } : c)));
    setSaving(null);
  };

  if (loading) return <p className="text-xs text-muted-foreground">Loading constants...</p>;

  return (
    <ConfigSection title="Turn Economy Constants" desc="These constants control the Next Turn calculations for tribute, upkeep, and ground force replacement.">
      <div className="space-y-3">
        {constants.map((c) => (
          <div key={c.id} className="flex items-center gap-3 rounded border border-border px-3 py-2">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground font-mono">{c.key}</p>
              <p className="text-xs text-muted-foreground">{c.description}</p>
            </div>
            <Input
              type="number"
              step="any"
              value={c.value}
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                if (!isNaN(v)) setConstants((prev) => prev.map((x) => (x.id === c.id ? { ...x, value: v } : x)));
              }}
              onBlur={(e) => {
                const v = parseFloat(e.target.value);
                if (!isNaN(v) && isAdmin) updateValue(c.id, v);
              }}
              disabled={!isAdmin}
              className="h-8 w-24 text-sm text-right font-mono"
            />
            {saving === c.id && <span className="text-[10px] text-muted-foreground">Saving...</span>}
          </div>
        ))}
        {constants.length === 0 && (
          <p className="text-sm text-muted-foreground">No constants defined yet.</p>
        )}
      </div>
    </ConfigSection>
  );
}

export default MapTestingConfig;
