import { useEffect, useState, useMemo, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Plus, X, ChevronDown, GripVertical } from "lucide-react";

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
  flavor_description: string;
}

interface FleetShipEntry {
  ship_type_id: string;
  quantity: number;
  tactical_group: string;
  notes: string;
}

const SPECIAL_ROLES = ["Flank", "Outflank", "Attack Planet", "Cover Retreat", "Skirmish"];

const BASE_GROUPS = ["Core", "Attack"];
const TAIL_GROUPS = ["Rear", "Retreat"];
const FIXED_TAIL = ["System Defenses"];
const STANDING_ORDERS = ["move", "attack", "defend"] as const;
type StandingOrder = typeof STANDING_ORDERS[number];
const ORDER_LABELS: Record<StandingOrder, string> = { move: "Move", attack: "Attack", defend: "Defend" };

const READINESS_LEVELS = [
  { value: 1, label: "Condition 1 – Combat Ready", maintenance: 1.4, effectiveness: 1.2 },
  { value: 2, label: "Condition 2 – Standard", maintenance: 1.0, effectiveness: 1.0 },
  { value: 3, label: "Condition 3 – Routine", maintenance: 0.75, effectiveness: 0.6 },
  { value: 4, label: "Condition 4 – Drydocked", maintenance: 0.25, effectiveness: 0.1 },
];
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
  const [entries, setEntries] = useState<FleetShipEntry[]>([]);
  const [saving, setSaving] = useState(false);
  const [revision, setRevision] = useState(1);
  const [standingOrder, setStandingOrder] = useState<StandingOrder>("move");
  const [readiness, setReadiness] = useState(2);
  const [special1Role, setSpecial1Role] = useState("Flank");
  const [special2Role, setSpecial2Role] = useState("Flank");
  const [filterClass, setFilterClass] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedHull, setExpandedHull] = useState<string | null>(null);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverGroup, setDragOverGroup] = useState<string | null>(null);
  const [remainingGroundUnits, setRemainingGroundUnits] = useState<number | null>(null);

  // Build dynamic GROUPS list: Core, Attack, [role1], [role2], Rear, Retreat
  const GROUPS = useMemo(() => [
    ...BASE_GROUPS,
    special1Role,
    ...(special2Role !== special1Role ? [special2Role] : []),
    ...TAIL_GROUPS,
    ...FIXED_TAIL,
  ], [special1Role, special2Role]);

  const GROUP_LABELS: Record<string, string> = {
    Core: "Core",
    Attack: "Attack",
    Rear: "Rear",
    Retreat: "Retreat",
  };
  // Strategy roles use their own name as label
  for (const role of SPECIAL_ROLES) {
    GROUP_LABELS[role] = role;
  }

  const handleDrop = useCallback((targetGroup: string) => {
    if (dragIdx !== null) {
      setEntries(prev => prev.map((e, i) => i === dragIdx ? { ...e, tactical_group: targetGroup } : e));
    }
    setDragIdx(null);
    setDragOverGroup(null);
  }, [dragIdx]);

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
          setRevision(data.revision);
          setStandingOrder((data.standing_order as StandingOrder) || "move");
          setReadiness(data.readiness ?? 2);
          setSpecial1Role(data.special1_role || "Flank");
          setSpecial2Role(data.special2_role || "Flank");
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

  const baseMaintenance = entries.reduce((sum, e) => {
    const st = shipTypes.find(s => s.id === e.ship_type_id);
    return sum + (st ? st.maintenance * e.quantity : 0);
  }, 0);

  // Fighter & Gunship capacity calculations
  const fighterCapacity = entries.reduce((sum, e) => {
    const st = shipTypes.find(s => s.id === e.ship_type_id);
    return sum + (st ? st.fighter_bay * e.quantity : 0);
  }, 0);

  const fighterUsed = entries.reduce((sum, e) => {
    const st = shipTypes.find(s => s.id === e.ship_type_id);
    if (!st) return sum;
    if (st.class === "FL") return sum + 1 * e.quantity;
    if (st.class === "FH") return sum + 2 * e.quantity;
    return sum;
  }, 0);

  const gunshipCapacity = entries.reduce((sum, e) => {
    const st = shipTypes.find(s => s.id === e.ship_type_id);
    return sum + (st ? st.gun_ship_link * e.quantity : 0);
  }, 0);

  const gunshipUsed = entries.reduce((sum, e) => {
    const st = shipTypes.find(s => s.id === e.ship_type_id);
    if (!st) return sum;
    if (st.class === "GS") return sum + 1 * e.quantity;
    return sum;
  }, 0);

  const fighterOver = fighterUsed > fighterCapacity;
  const gunshipOver = gunshipUsed > gunshipCapacity;

  const maxGroundUnits = entries
    .filter(e => e.tactical_group === "Attack Planet")
    .reduce((sum, e) => {
      const st = shipTypes.find(s => s.id === e.ship_type_id);
      return sum + (st ? st.ground_invasion * e.quantity : 0);
    }, 0);

  // Auto-sync remaining ground units when max changes (unless user has manually set it)
  useEffect(() => {
    setRemainingGroundUnits(prev => prev === null ? maxGroundUnits : Math.min(prev, maxGroundUnits));
  }, [maxGroundUnits]);

  // Per-group capacity calculations
  const groupCapacities = useMemo(() => {
    const caps: Record<string, { fighterCap: number; fighterUsed: number; gunshipCap: number; gunshipUsed: number }> = {};
    for (const group of GROUPS) {
      const groupEntries = entries.filter(e => e.tactical_group === group);
      let fCap = 0, fUsed = 0, gCap = 0, gUsed = 0;
      for (const e of groupEntries) {
        const st = shipTypes.find(s => s.id === e.ship_type_id);
        if (!st) continue;
        fCap += st.fighter_bay * e.quantity;
        gCap += st.gun_ship_link * e.quantity;
        if (st.class === "FL") fUsed += 1 * e.quantity;
        if (st.class === "FH") fUsed += 2 * e.quantity;
        if (st.class === "GS") gUsed += 1 * e.quantity;
      }
      caps[group] = { fighterCap: fCap, fighterUsed: fUsed, gunshipCap: gCap, gunshipUsed: gUsed };
    }
    return caps;
  }, [entries, shipTypes, GROUPS]);

  const groupsOverCapacity = useMemo(() => {
    return GROUPS.filter(g => {
      const c = groupCapacities[g];
      return c && (c.fighterUsed > c.fighterCap || c.gunshipUsed > c.gunshipCap);
    });
  }, [groupCapacities, GROUPS]);

  const readinessData = READINESS_LEVELS.find(l => l.value === readiness)!;
  const totalMaintenance = Math.round(baseMaintenance * readinessData.maintenance * 100) / 100;

  const overCapacity = fighterOver || gunshipOver;
  

  const filteredShips = useMemo(() => {
    let ships = shipTypes;
    if (filterClass !== "all") ships = ships.filter(s => s.class === filterClass);
    if (searchTerm) ships = ships.filter(s => s.name.toLowerCase().includes(searchTerm.toLowerCase()));
    return ships;
  }, [shipTypes, filterClass, searchTerm]);

  const groupedShips = useMemo(() => {
    const groups: Record<string, ShipType[]> = {};
    for (const s of filteredShips) {
      if (!groups[s.class]) groups[s.class] = [];
      groups[s.class].push(s);
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
    if (entries.length === 0) { toast({ title: "Empty fleet", description: "Add at least one ship.", variant: "destructive" }); return; }
    
    // Warn but don't block for capacity issues
    const warnings: string[] = [];
    if (fighterOver) warnings.push(`Fighter capacity exceeded: ${fighterUsed} used / ${fighterCapacity} available`);
    if (gunshipOver) warnings.push(`Gunship capacity exceeded: ${gunshipUsed} used / ${gunshipCapacity} available`);
    for (const g of groupsOverCapacity) {
      const gc = groupCapacities[g];
      const msgs: string[] = [];
      if (gc.fighterUsed > gc.fighterCap) msgs.push(`fighters ${gc.fighterUsed}/${gc.fighterCap}`);
      if (gc.gunshipUsed > gc.gunshipCap) msgs.push(`gunships ${gc.gunshipUsed}/${gc.gunshipCap}`);
      warnings.push(`Group "${g}" over capacity: ${msgs.join(", ")}`);
    }
    if (warnings.length > 0) {
      toast({ title: "⚠️ Fleet saved with warnings", description: warnings.join(". "), variant: "destructive" });
    }
    setSaving(true);

    if (editId) {
      await supabase.from("fleets").update({ name: fleetName, standing_order: standingOrder, readiness, special1_role: special1Role, special2_role: special2Role, revision: revision + 1 }).eq("id", editId);
      await supabase.from("fleet_ships").delete().eq("fleet_id", editId);
      await supabase.from("fleet_ships").insert(entries.map(e => ({ fleet_id: editId, ...e })));
    } else {
      const { data: newFleet, error } = await supabase.from("fleets")
        .insert({ owner_user_id: user!.id, name: fleetName, standing_order: standingOrder, readiness, special1_role: special1Role, special2_role: special2Role })
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

        <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Input placeholder="Fleet name" value={fleetName} onChange={e => setFleetName(e.target.value)} />
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Order:</span>
            <select
              className="h-10 rounded border border-input bg-background px-3 text-sm text-foreground"
              value={standingOrder}
              onChange={e => setStandingOrder(e.target.value as StandingOrder)}
            >
              {STANDING_ORDERS.map(o => <option key={o} value={o}>{ORDER_LABELS[o]}</option>)}
            </select>
          </div>
          <div>
            <select
              className="h-10 w-full rounded border border-input bg-background px-3 text-sm text-foreground"
              value={readiness}
              onChange={e => setReadiness(Number(e.target.value))}
            >
              {READINESS_LEVELS.map(r => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
            <p className="mt-1 text-[10px] text-muted-foreground">
              {(() => { const r = READINESS_LEVELS.find(l => l.value === readiness)!; return `Maint ×${r.maintenance} · Effect ×${r.effectiveness}`; })()}
            </p>
          </div>
          <div>
            <div className="flex items-center gap-2 h-10">
              <span className="text-sm font-semibold text-foreground">{totalCost} pts</span>
            </div>
            <p className="mt-1 text-[10px] text-muted-foreground">
              Maintenance: {totalMaintenance} ({baseMaintenance} base × {readinessData.maintenance})
            </p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-6">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Strategy 1:</span>
            <select className="h-8 rounded border border-input bg-background px-2 text-xs text-foreground" value={special1Role} onChange={e => {
              const oldRole = special1Role;
              const newRole = e.target.value;
              setSpecial1Role(newRole);
              setEntries(prev => prev.map(en => en.tactical_group === oldRole ? { ...en, tactical_group: newRole } : en));
            }}>
              {SPECIAL_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Strategy 2:</span>
            <select className="h-8 rounded border border-input bg-background px-2 text-xs text-foreground" value={special2Role} onChange={e => {
              const oldRole = special2Role;
              const newRole = e.target.value;
              setSpecial2Role(newRole);
              setEntries(prev => prev.map(en => en.tactical_group === oldRole ? { ...en, tactical_group: newRole } : en));
            }}>
              {SPECIAL_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
        </div>

        {(overCapacity || groupsOverCapacity.length > 0) && <p className="mt-2 text-sm text-destructive font-semibold">⚠ Insufficient Fighter/Gunship Capacity</p>}


        {/* Two-panel layout */}
        <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_380px]">
          {/* Left: Fleet Composition - Group Lanes */}
          <div>
            <h2 className="font-heading text-lg font-semibold text-foreground mb-2">Fleet Composition</h2>
            {/* Capacity bars */}
            <div className="flex flex-wrap gap-4 mb-4 p-3 rounded border border-border bg-card">
              <div className={`text-xs ${fighterOver ? "text-destructive font-bold" : "text-foreground"}`}>
                ✈ Fighters: <span className="font-semibold">{fighterUsed}</span> / {fighterCapacity} slots
                {fighterOver && <span className="ml-1">⚠ OVER</span>}
              </div>
              <div className={`text-xs ${gunshipOver ? "text-destructive font-bold" : "text-foreground"}`}>
                🚀 Gunships: <span className="font-semibold">{gunshipUsed}</span> / {gunshipCapacity} slots
                {gunshipOver && <span className="ml-1">⚠ OVER</span>}
              </div>
              <div className="text-xs text-foreground">
                🏴 Max Ground Units: <span className="font-semibold">{maxGroundUnits}</span>
              </div>
              <div className="flex items-center gap-1 text-xs text-foreground">
                <span>🎯 Remaining Ground Units:</span>
                <input
                  type="number"
                  min={0}
                  max={maxGroundUnits}
                  className="w-16 h-6 rounded border border-input bg-background px-1 text-xs text-foreground text-center"
                  value={remainingGroundUnits ?? maxGroundUnits}
                  onChange={e => setRemainingGroundUnits(Math.max(0, Math.min(maxGroundUnits, Number(e.target.value) || 0)))}
                />
              </div>
            </div>
            {entries.length === 0 && <p className="mb-4 text-sm text-muted-foreground">Select ships from the catalog on the right to add them.</p>}
            <div className="space-y-3">
              {GROUPS.map(group => {
                const groupEntries = entries.map((e, idx) => ({ ...e, _idx: idx })).filter(e => e.tactical_group === group);
                const isOver = dragOverGroup === group;
                return (
                  <div
                    key={group}
                    className={`border rounded p-3 transition-colors min-h-[60px] ${isOver ? "border-primary bg-primary/5" : "border-border bg-card"}`}
                    onDragOver={e => { e.preventDefault(); setDragOverGroup(group); }}
                    onDragLeave={() => setDragOverGroup(null)}
                    onDrop={e => { e.preventDefault(); handleDrop(group); }}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        {GROUP_LABELS[group]}
                        {groupEntries.length > 0 && (
                          <span className="ml-2 text-foreground normal-case">
                            ({groupEntries.reduce((s, e) => s + e.quantity, 0)} ships)
                          </span>
                        )}
                      </h3>
                      {(() => {
                        const gc = groupCapacities[group];
                        if (!gc) return null;
                        const hasAny = gc.fighterCap > 0 || gc.gunshipCap > 0 || gc.fighterUsed > 0 || gc.gunshipUsed > 0;
                        if (!hasAny) return null;
                        const fOver = gc.fighterUsed > gc.fighterCap;
                        const gOver = gc.gunshipUsed > gc.gunshipCap;
                        return (
                          <div className="flex gap-3">
                            {(gc.fighterCap > 0 || gc.fighterUsed > 0) && (
                              <span className={`text-[10px] ${fOver ? "text-destructive font-bold" : "text-muted-foreground"}`}>
                                ✈ {gc.fighterUsed}/{gc.fighterCap}{fOver && " ⚠"}
                              </span>
                            )}
                            {(gc.gunshipCap > 0 || gc.gunshipUsed > 0) && (
                              <span className={`text-[10px] ${gOver ? "text-destructive font-bold" : "text-muted-foreground"}`}>
                                🚀 {gc.gunshipUsed}/{gc.gunshipCap}{gOver && " ⚠"}
                              </span>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                    <div className="space-y-1">
                      {groupEntries.map(entry => {
                        const st = shipTypes.find(s => s.id === entry.ship_type_id);
                        if (!st) return null;
                        return (
                          <div
                            key={entry._idx}
                            draggable
                            onDragStart={() => setDragIdx(entry._idx)}
                            onDragEnd={() => { setDragIdx(null); setDragOverGroup(null); }}
                            className={`flex items-center gap-2 rounded px-2 py-1.5 cursor-grab active:cursor-grabbing transition-opacity ${dragIdx === entry._idx ? "opacity-40" : "hover:bg-muted/50"}`}
                          >
                            <GripVertical className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                            <span className="text-xs font-semibold text-foreground flex-1 min-w-0 truncate">{st.name}</span>
                            <span className="text-[10px] text-muted-foreground">{st.class}</span>
                            <span className="text-[10px] text-primary font-semibold">{st.point_cost * entry.quantity}pts</span>
                            <div className="flex items-center gap-0.5">
                              <Input
                                type="number"
                                className="h-6 w-12 text-[10px] px-1"
                                min={1}
                                value={entry.quantity}
                                onChange={e => updateEntry(entry._idx, { quantity: Math.max(1, Number(e.target.value)) })}
                                onClick={e => e.stopPropagation()}
                              />
                            </div>
                            <button
                              onClick={() => removeEntry(entry._idx)}
                              className="text-destructive hover:text-destructive/80 p-0.5"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-6 flex gap-3">
              <Button onClick={save} disabled={saving}>
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
                            {st.flavor_description && (
                              <div className="text-[10px] text-muted-foreground italic mt-1 leading-snug">{st.flavor_description}</div>
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
