import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useFacilityTypes, DbFacilityType } from "@/hooks/useFacilityTypes";
import Header from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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
  { key: "max_per_system", label: "Max/System" },
  { key: "ship_build_capacity", label: "Ship Build Cap (pts/turn)" },
];

const HULL_OPTIONS = ["Any", "Capital", "Cruiser", "Escort", "Strikecraft"];

function StatBadges({ ft, allFacilityTypes }: { ft: DbFacilityType; allFacilityTypes: DbFacilityType[] }) {
  const nonZero = STAT_DEFS.filter((s) => (ft[s.key] as number) !== 0);
  const consumed = ft.consumed_facility_id ? allFacilityTypes.find(f => f.id === ft.consumed_facility_id) : null;
  const showHull = ft.ship_build_capacity > 0 && ft.max_ship_hull_class && ft.max_ship_hull_class !== "Any";
  if (nonZero.length === 0 && !consumed && !showHull) return null;
  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {nonZero.map((s) => (
        <span key={s.key} className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-mono">
          {s.label}: {s.prefix || ""}{ft[s.key] as number}{s.suffix || ""}
        </span>
      ))}
      {showHull && (
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-mono">
          Max Hull: {ft.max_ship_hull_class}
        </span>
      )}
      {consumed && (
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-mono">
          Consumes: {consumed.icon} {consumed.name}
        </span>
      )}
    </div>
  );
}

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
      {fields.ship_build_capacity > 0 && (
        <div className="flex flex-col gap-0.5">
          <label className="text-[10px] text-muted-foreground">Max Ship Hull Class (shipyards only)</label>
          <select
            value={fields.max_ship_hull_class || "Any"}
            onChange={(e) => patch({ max_ship_hull_class: e.target.value })}
            className="h-7 text-xs rounded border border-input bg-background px-2"
          >
            {HULL_OPTIONS.map(h => <option key={h} value={h}>{h}</option>)}
          </select>
        </div>
      )}
    </div>
  );
}

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

function AddFacilityForm({ onAdd, allFacilityTypes }: { onAdd: (fields: Omit<DbFacilityType, "id">) => Promise<void>; allFacilityTypes: DbFacilityType[] }) {
  const empty: Omit<DbFacilityType, "id"> = {
    name: "", description: "", icon: "🏭",
    cost: 0, maintenance: 0, condition_bonus: 0,
    tribute_flat: 0, tribute_percent: 0, survey_bonus: 0, ground_defense_bonus: 0,
    turns_to_build: 1, construction_kickback: 0, consumed_facility_id: null,
    fighter_capacity: 0, gunship_capacity: 0, max_per_system: 0, ship_build_capacity: 0, max_ship_hull_class: "Any",
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

const AdminFacilities = () => {
  const { user, loading, isAdmin } = useAuth();
  const navigate = useNavigate();
  const { facilityTypes, loading: ftLoading, addFacilityType, updateFacilityType, removeFacilityType } = useFacilityTypes();

  useEffect(() => {
    if (!loading && !user) navigate("/login");
  }, [loading, user, navigate]);

  if (loading || ftLoading) {
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
      <div className="container max-w-2xl py-8 space-y-6">
        <div>
          <h1 className="text-xl font-semibold text-accent">Facility Types</h1>
          <p className="text-xs text-muted-foreground mt-1">Define the types of facilities that can be placed on planets. These are shared across all maps.</p>
        </div>
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
      </div>
    </div>
  );
};

export default AdminFacilities;
