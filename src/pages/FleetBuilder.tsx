import { useEffect, useState, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Plus, X, ChevronDown } from "lucide-react";

interface ShipType {
  id: string;
  ship_id: string;
  name: string;
  class: string;
  hull_class: string;
  target_preference: string;
  point_cost: number;
  maintenance: number;
  hull: number;
  armor: number;
  map_speed: number;
  cbt_speed: number;
  sensor_rating: number;
  laser_2_5cm: number;
  laser_4_5cm: number;
  laser_6_5cm: number;
  laser_10cm: number;
  laser_14cm: number;
  laser_20cm: number;
  laser_28cm: number;
  laser_50cm: number;
  missile_10kg: number;
  missile_50kg: number;
  missile_100kg: number;
  missile_half_kt: number;
  ground_invasion: number;
  repair_pod: number;
  supply_pod: number;
  scout_sensors: number;
  fighter_bay: number;
  fighter_storage: number;
  gun_ship_link: number;
  gunship_storage: number;
}

interface FleetShipEntry {
  ship_type_id: string;
  quantity: number;
  tactical_group: string;
  notes: string;
}

const GROUPS = ["Core", "Rear", "Retreat", "Special1", "Special2"];
const HULL_CLASSES = ["T", "BB", "CH", "CM", "CL", "DD", "FH", "FL", "GS"];
const HULL_LABELS: Record<string, string> = {
  T: "Titan", BB: "Battleship", CH: "Cruiser Heavy", CM: "Cruiser Medium",
  CL: "Cruiser Light", DD: "Destroyer", FH: "Fighter Heavy", FL: "Fighter Light", GS: "Gunship"
};

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
  const [filterClass, setFilterClass] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedHull, setExpandedHull] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) navigate("/login");
  }, [loading, user, navigate]);

  useEffect(() => {
    supabase.from("ship_types").select("*").order("hull", { ascending: false }).order("point_cost", { ascending: false }).then(({ data }) => {
      if (data) setShipTypes(data as unknown as ShipType[]);
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

  const filteredShips = useMemo(() => {
    let ships = shipTypes;
    if (filterClass !== "all") ships = ships.filter(s => s.hull_class === filterClass);
    if (searchTerm) ships = ships.filter(s => s.name.toLowerCase().includes(searchTerm.toLowerCase()));
    return ships;
  }, [shipTypes, filterClass, searchTerm]);

  const groupedShips = useMemo(() => {
    const groups: Record<string, ShipType[]> = {};
    for (const s of filteredShips) {
      if (!groups[s.hull_class]) groups[s.hull_class] = [];
      groups[s.hull_class].push(s);
    }
    return groups;
  }, [filteredShips]);

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

  const getWeaponSummary = (st: ShipType) => {
    const weapons: string[] = [];
    if (st.laser_2_5cm) weapons.push(`L2.5×${st.laser_2_5cm}`);
    if (st.laser_4_5cm) weapons.push(`L4.5×${st.laser_4_5cm}`);
    if (st.laser_6_5cm) weapons.push(`L6.5×${st.laser_6_5cm}`);
    if (st.laser_10cm) weapons.push(`L10×${st.laser_10cm}`);
    if (st.laser_14cm) weapons.push(`L14×${st.laser_14cm}`);
    if (st.laser_20cm) weapons.push(`L20×${st.laser_20cm}`);
    if (st.laser_28cm) weapons.push(`L28×${st.laser_28cm}`);
    if (st.laser_50cm) weapons.push(`L50×${st.laser_50cm}`);
    if (st.missile_10kg) weapons.push(`M10k×${st.missile_10kg}`);
    if (st.missile_50kg) weapons.push(`M50k×${st.missile_50kg}`);
    if (st.missile_100kg) weapons.push(`M100k×${st.missile_100kg}`);
    if (st.missile_half_kt) weapons.push(`M½kt×${st.missile_half_kt}`);
    return weapons.join(" ");
  };

  const getSpecialSummary = (st: ShipType) => {
    const specials: string[] = [];
    if (st.fighter_bay) specials.push(`FB:${st.fighter_bay}`);
    if (st.fighter_storage) specials.push(`FS:${st.fighter_storage}`);
    if (st.gun_ship_link) specials.push(`GSL:${st.gun_ship_link}`);
    if (st.gunship_storage) specials.push(`GSt:${st.gunship_storage}`);
    if (st.ground_invasion) specials.push(`GI:${st.ground_invasion}`);
    if (st.repair_pod) specials.push(`RP:${st.repair_pod}`);
    if (st.supply_pod) specials.push(`SP:${st.supply_pod}`);
    if (st.scout_sensors) specials.push(`SS:${st.scout_sensors}`);
    return specials.join(" ");
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

        {noCore && <p className="mt-2 text-sm text-secondary">⚠ Fleet has no ships in the Core group.</p>}
        {allRetreat && <p className="mt-2 text-sm text-secondary">⚠ All ships are in Retreat.</p>}

        {/* Two-panel layout */}
        <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_380px]">
          {/* Left: Fleet Composition */}
          <div>
            <h2 className="font-heading text-lg font-semibold text-foreground">Fleet Composition</h2>
            {entries.length === 0 && <p className="mt-4 text-sm text-muted-foreground">Select ships from the catalog on the right to add them.</p>}
            <div className="mt-4 space-y-2">
              {entries.map((entry, idx) => {
                const st = shipTypes.find(s => s.id === entry.ship_type_id);
                if (!st) return null;
                return (
                  <div key={idx} className="flex flex-wrap items-center gap-3 border border-border rounded p-3 bg-card">
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-semibold text-foreground">{st.name}</span>
                      <span className="ml-2 text-xs text-muted-foreground">{st.hull_class} · {st.point_cost * entry.quantity}pts</span>
                    </div>
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
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => removeEntry(idx)}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                );
              })}
            </div>

            <div className="mt-6 flex gap-3">
              <Button onClick={save} disabled={saving || overBudget}>
                {saving ? "Saving..." : "Save Fleet"}
              </Button>
              <Button variant="outline" onClick={() => navigate("/dashboard")}>Cancel</Button>
            </div>
          </div>

          {/* Right: Ship Catalog (scrolling) */}
          <div className="border border-border rounded bg-card">
            <div className="border-b border-border p-3">
              <h2 className="font-heading text-sm font-semibold text-foreground mb-2">Ship Catalog</h2>
              <Input
                placeholder="Search ships..."
                className="h-8 text-xs mb-2"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
              <div className="flex flex-wrap gap-1">
                <button
                  className={`px-2 py-0.5 text-xs rounded ${filterClass === "all" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
                  onClick={() => setFilterClass("all")}
                >All</button>
                {HULL_CLASSES.map(hc => (
                  <button
                    key={hc}
                    className={`px-2 py-0.5 text-xs rounded ${filterClass === hc ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
                    onClick={() => setFilterClass(hc)}
                  >{hc}</button>
                ))}
              </div>
            </div>
            <ScrollArea className="h-[600px]">
              <div className="p-2">
                {HULL_CLASSES.filter(hc => groupedShips[hc]).map(hc => (
                  <div key={hc} className="mb-1">
                    <button
                      className="w-full flex items-center justify-between px-2 py-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground"
                      onClick={() => setExpandedHull(expandedHull === hc ? null : hc)}
                    >
                      <span>{HULL_LABELS[hc] || hc} ({groupedShips[hc].length})</span>
                      <ChevronDown className={`h-3 w-3 transition-transform ${expandedHull === hc ? "rotate-180" : ""}`} />
                    </button>
                    {(expandedHull === hc || filterClass !== "all" || searchTerm) && (
                      <div className="space-y-1 mb-2">
                        {groupedShips[hc].map(st => (
                          <button
                            key={st.id}
                            onClick={() => addShip(st.id)}
                            className="w-full border border-border rounded p-2 text-left transition-colors hover:border-primary hover:bg-muted/50 group"
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-semibold text-foreground">{st.ship_id} {st.name}</span>
                              <span className="text-xs font-bold text-primary">{st.point_cost}pts</span>
                            </div>
                            <div className="text-[10px] text-muted-foreground mt-0.5">
                              H:{st.hull} A:{st.armor} Spd:{st.map_speed}/{st.cbt_speed} Tgt:{st.target_preference}
                            </div>
                            {getWeaponSummary(st) && (
                              <div className="text-[10px] text-muted-foreground">{getWeaponSummary(st)}</div>
                            )}
                            {getSpecialSummary(st) && (
                              <div className="text-[10px] text-secondary">{getSpecialSummary(st)}</div>
                            )}
                            <Plus className="h-3 w-3 text-primary opacity-0 group-hover:opacity-100 absolute right-2 top-2" />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default FleetBuilder;
