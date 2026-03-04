import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

interface ShipType {
  id: string;
  name: string;
  class: string;
  hull_class: string;
  point_cost: number;
  hull: number;
  armor: number;
  lasers: number;
  missiles: number;
  sensor_rating: number;
  max_jump: number;
}

interface FleetShipEntry {
  ship_type_id: string;
  quantity: number;
  tactical_group: string;
  notes: string;
}

const GROUPS = ["Core", "Rear", "Retreat", "Special1", "Special2"];

const FleetBuilder = () => {
  const { user, loading } = useAuth();
  const [searchParams] = useSearchParams();
  const editId = searchParams.get("edit");
  const navigate = useNavigate();
  const { toast } = useToast();

  const [shipTypes, setShipTypes] = useState<ShipType[]>([]);
  const [fleetName, setFleetName] = useState("New Fleet");
  const [pointsBudget, setPointsBudget] = useState(100);
  const [entries, setEntries] = useState<FleetShipEntry[]>([]);
  const [saving, setSaving] = useState(false);
  const [revision, setRevision] = useState(1);

  useEffect(() => {
    if (!loading && !user) navigate("/login");
  }, [loading, user, navigate]);

  useEffect(() => {
    supabase.from("ship_types").select("*").then(({ data }) => {
      if (data) setShipTypes(data as ShipType[]);
    });
  }, []);

  useEffect(() => {
    if (editId && user) {
      supabase.from("fleets").select("*").eq("id", editId).single().then(({ data }) => {
        if (data) {
          setFleetName(data.name);
          setPointsBudget(data.points_budget);
          setRevision(data.revision);
        }
      });
      supabase.from("fleet_ships").select("ship_type_id, quantity, tactical_group, notes").eq("fleet_id", editId).then(({ data }) => {
        if (data) setEntries(data.map(d => ({ ...d, notes: d.notes || "" })));
      });
    }
  }, [editId, user]);

  const totalCost = entries.reduce((sum, e) => {
    const st = shipTypes.find(s => s.id === e.ship_type_id);
    return sum + (st ? st.point_cost * e.quantity : 0);
  }, 0);

  const overBudget = totalCost > pointsBudget;
  const noCore = entries.length > 0 && !entries.some(e => e.tactical_group === "Core" && e.quantity > 0);
  const allRetreat = entries.length > 0 && entries.every(e => e.tactical_group === "Retreat");

  const addShip = (shipTypeId: string) => {
    const existing = entries.find(e => e.ship_type_id === shipTypeId && e.tactical_group === "Core");
    if (existing) {
      setEntries(entries.map(e => e === existing ? { ...e, quantity: e.quantity + 1 } : e));
    } else {
      setEntries([...entries, { ship_type_id: shipTypeId, quantity: 1, tactical_group: "Core", notes: "" }]);
    }
  };

  const updateEntry = (idx: number, updates: Partial<FleetShipEntry>) => {
    setEntries(entries.map((e, i) => i === idx ? { ...e, ...updates } : e));
  };

  const removeEntry = (idx: number) => {
    setEntries(entries.filter((_, i) => i !== idx));
  };

  const save = async () => {
    if (overBudget) { toast({ title: "Over budget", description: "Remove ships to fit the points budget.", variant: "destructive" }); return; }
    if (entries.length === 0) { toast({ title: "Empty fleet", description: "Add at least one ship.", variant: "destructive" }); return; }
    setSaving(true);

    if (editId) {
      await supabase.from("fleets").update({ name: fleetName, points_budget: pointsBudget, revision: revision + 1 }).eq("id", editId);
      await supabase.from("fleet_ships").delete().eq("fleet_id", editId);
      await supabase.from("fleet_ships").insert(entries.map(e => ({ fleet_id: editId, ...e })));
    } else {
      const { data: newFleet, error } = await supabase.from("fleets")
        .insert({ owner_user_id: user!.id, name: fleetName, points_budget: pointsBudget })
        .select().single();
      if (error || !newFleet) { toast({ title: "Error", description: error?.message, variant: "destructive" }); setSaving(false); return; }
      await supabase.from("fleet_ships").insert(entries.map(e => ({ fleet_id: newFleet.id, ...e })));
    }

    setSaving(false);
    toast({ title: "Fleet saved!" });
    navigate("/dashboard");
  };

  if (loading) return <div className="min-h-screen bg-background"><Header /><div className="container py-20 text-center text-muted-foreground">Loading...</div><Footer /></div>;

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="container py-16">
        <Button variant="ghost" onClick={() => navigate("/dashboard")} className="mb-4">← Back</Button>
        <h1 className="font-heading text-2xl font-bold text-foreground">{editId ? "Edit Fleet" : "New Fleet"}</h1>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <Input placeholder="Fleet name" value={fleetName} onChange={e => setFleetName(e.target.value)} />
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Budget:</span>
            <Input type="number" className="w-24" value={pointsBudget} onChange={e => setPointsBudget(Number(e.target.value))} />
            <span className={`text-sm font-semibold ${overBudget ? "text-destructive" : "text-foreground"}`}>
              {totalCost} / {pointsBudget} pts
            </span>
          </div>
        </div>

        {noCore && <p className="mt-2 text-sm text-gold">⚠ Fleet has no ships in the Core group.</p>}
        {allRetreat && <p className="mt-2 text-sm text-gold">⚠ All ships are in Retreat.</p>}

        {/* Ship Catalog */}
        <div className="mt-8">
          <h2 className="font-heading text-lg font-semibold text-foreground">Ship Catalog</h2>
          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {shipTypes.map(st => (
              <button
                key={st.id}
                onClick={() => addShip(st.id)}
                className="border border-border p-3 text-left transition-colors hover:border-primary"
              >
                <p className="text-sm font-semibold text-foreground">{st.name}</p>
                <p className="text-xs text-muted-foreground">{st.class} · {st.hull_class} · {st.point_cost}pts</p>
                <p className="text-xs text-muted-foreground">H:{st.hull} A:{st.armor} L:{st.lasers} M:{st.missiles}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Fleet Composition */}
        <div className="mt-8">
          <h2 className="font-heading text-lg font-semibold text-foreground">Fleet Composition</h2>
          {entries.length === 0 && <p className="mt-4 text-sm text-muted-foreground">Click a ship above to add it.</p>}
          <div className="mt-4 space-y-2">
            {entries.map((entry, idx) => {
              const st = shipTypes.find(s => s.id === entry.ship_type_id);
              if (!st) return null;
              return (
                <div key={idx} className="flex flex-wrap items-center gap-3 border border-border p-3">
                  <span className="text-sm font-semibold text-foreground">{st.name}</span>
                  <span className="text-xs text-muted-foreground">{st.point_cost * entry.quantity}pts</span>
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-muted-foreground">Qty:</span>
                    <Input type="number" className="h-8 w-16" min={1} value={entry.quantity}
                      onChange={e => updateEntry(idx, { quantity: Math.max(1, Number(e.target.value)) })} />
                  </div>
                  <select
                    className="h-8 rounded border border-input bg-background px-2 text-xs text-foreground"
                    value={entry.tactical_group}
                    onChange={e => updateEntry(idx, { tactical_group: e.target.value })}
                  >
                    {GROUPS.map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
                  <Button variant="ghost" size="sm" className="text-destructive" onClick={() => removeEntry(idx)}>✕</Button>
                </div>
              );
            })}
          </div>
        </div>

        <div className="mt-8 flex gap-3">
          <Button onClick={save} disabled={saving || overBudget}>
            {saving ? "Saving..." : "Save Fleet"}
          </Button>
          <Button variant="outline" onClick={() => navigate("/dashboard")}>Cancel</Button>
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default FleetBuilder;
