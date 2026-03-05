import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import { Plus, Trash2, Save, ChevronDown, ChevronRight } from "lucide-react";

interface ShipType {
  id: string;
  name: string;
  class: string;
  hull_class: string;
  hull: number;
  armor: number;
  point_cost: number;
  maintenance: number;
  cbt_speed: number;
  map_speed: number;
  sensor_rating: number;
  target_preference: string;
  flavor_description: string;
  ship_id: string | null;
  // Weapons
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
  // Bays & storage
  fighter_bay: number;
  fighter_storage: number;
  gun_ship_link: number;
  gunship_storage: number;
  // Utility
  scout_sensors: number;
  supply_pod: number;
  repair_pod: number;
  ground_invasion: number;
  _dirty?: boolean;
  _new?: boolean;
}

const HULL_CLASSES = ["Capital", "Cruiser", "Escort", "Strikecraft"];
const CLASS_CODES = ["BB", "CH", "CL", "CM", "DD", "FH", "FL", "GS", "T"];

const CORE_FIELDS: { key: keyof ShipType; label: string; type: "text" | "number" | "select"; options?: string[]; width?: string }[] = [
  { key: "name", label: "Name", type: "text", width: "w-40" },
  { key: "class", label: "Class", type: "select", options: CLASS_CODES },
  { key: "hull_class", label: "Hull Class", type: "select", options: HULL_CLASSES },
  { key: "hull", label: "Hull", type: "number", width: "w-16" },
  { key: "armor", label: "Armor", type: "number", width: "w-16" },
  { key: "point_cost", label: "Cost", type: "number", width: "w-16" },
  { key: "maintenance", label: "Maint", type: "number", width: "w-16" },
  { key: "cbt_speed", label: "Cbt Spd", type: "number", width: "w-16" },
  { key: "map_speed", label: "Map Spd", type: "number", width: "w-16" },
  { key: "sensor_rating", label: "Sensor", type: "number", width: "w-16" },
];

const WEAPON_FIELDS: { key: keyof ShipType; label: string }[] = [
  { key: "laser_2_5cm", label: "L2.5" },
  { key: "laser_4_5cm", label: "L4.5" },
  { key: "laser_6_5cm", label: "L6.5" },
  { key: "laser_10cm", label: "L10" },
  { key: "laser_14cm", label: "L14" },
  { key: "laser_20cm", label: "L20" },
  { key: "laser_28cm", label: "L28" },
  { key: "laser_50cm", label: "L50" },
  { key: "missile_10kg", label: "M10" },
  { key: "missile_50kg", label: "M50" },
  { key: "missile_100kg", label: "M100" },
  { key: "missile_half_kt", label: "M½kt" },
];

const UTILITY_FIELDS: { key: keyof ShipType; label: string }[] = [
  { key: "fighter_bay", label: "F.Bay" },
  { key: "fighter_storage", label: "F.Stor" },
  { key: "gun_ship_link", label: "GS.Link" },
  { key: "gunship_storage", label: "GS.Stor" },
  { key: "scout_sensors", label: "Scout" },
  { key: "supply_pod", label: "Supply" },
  { key: "repair_pod", label: "Repair" },
  { key: "ground_invasion", label: "Ground" },
];

const AdminShips = () => {
  const { user, loading, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [ships, setShips] = useState<ShipType[]>([]);
  const [saving, setSaving] = useState(false);
  const [showWeapons, setShowWeapons] = useState(false);
  const [showUtility, setShowUtility] = useState(false);
  const [filterClass, setFilterClass] = useState<string>("all");

  useEffect(() => {
    if (!loading && (!user || !isAdmin)) navigate("/dashboard");
  }, [loading, user, isAdmin, navigate]);

  useEffect(() => { loadShips(); }, []);

  const loadShips = async () => {
    const { data } = await supabase.from("ship_types").select("*").order("class").order("point_cost");
    if (data) setShips(data.map(s => ({ ...s, maintenance: Number(s.maintenance) })));
  };

  const updateField = (id: string, field: keyof ShipType, value: string | number) => {
    setShips(prev => prev.map(s => s.id === id ? { ...s, [field]: value, _dirty: true } : s));
  };

  const addShip = () => {
    const ns: ShipType = {
      id: crypto.randomUUID(),
      name: "New Ship", class: "DD", hull_class: "Escort", hull: 10, armor: 0,
      point_cost: 1, maintenance: 0, cbt_speed: 0, map_speed: 0, sensor_rating: 0,
      target_preference: "", flavor_description: "", ship_id: null,
      laser_2_5cm: 0, laser_4_5cm: 0, laser_6_5cm: 0, laser_10cm: 0,
      laser_14cm: 0, laser_20cm: 0, laser_28cm: 0, laser_50cm: 0,
      missile_10kg: 0, missile_50kg: 0, missile_100kg: 0, missile_half_kt: 0,
      fighter_bay: 0, fighter_storage: 0, gun_ship_link: 0, gunship_storage: 0,
      scout_sensors: 0, supply_pod: 0, repair_pod: 0, ground_invasion: 0,
      _dirty: true, _new: true,
    };
    setShips(prev => [...prev, ns]);
  };

  const deleteShip = async (id: string, isNew?: boolean) => {
    if (!isNew) {
      const { error } = await supabase.from("ship_types").delete().eq("id", id);
      if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    }
    setShips(prev => prev.filter(s => s.id !== id));
    toast({ title: "Deleted" });
  };

  const saveAll = async () => {
    setSaving(true);
    const dirty = ships.filter(s => s._dirty);
    let errors = 0;

    for (const s of dirty) {
      const { _dirty, _new, ...payload } = s;
      if (_new) {
        const { error } = await supabase.from("ship_types").insert(payload as any);
        if (error) { errors++; console.error(error); }
      } else {
        const { error } = await supabase.from("ship_types").update(payload as any).eq("id", s.id);
        if (error) { errors++; console.error(error); }
      }
    }

    if (errors) {
      toast({ title: "Some saves failed", description: `${errors} error(s)`, variant: "destructive" });
    } else {
      toast({ title: "Saved", description: `${dirty.length} ship(s) updated` });
    }
    await loadShips();
    setSaving(false);
  };

  const filtered = useMemo(() =>
    filterClass === "all" ? ships : ships.filter(s => s.class === filterClass),
    [ships, filterClass]
  );

  if (loading) return <div className="min-h-screen bg-background"><Header /><div className="container py-20 text-center text-muted-foreground">Loading...</div><Footer /></div>;

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="container py-16">
        <div className="flex items-center justify-between mb-4">
          <h1 className="font-heading text-2xl font-bold text-foreground">Ship Catalog (Admin)</h1>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={addShip}><Plus className="mr-1 h-4 w-4" /> Add Ship</Button>
            <Button size="sm" onClick={saveAll} disabled={saving || !ships.some(s => s._dirty)}>
              <Save className="mr-1 h-4 w-4" /> {saving ? "Saving..." : "Save All"}
            </Button>
          </div>
        </div>

        <div className="flex gap-2 mb-4 flex-wrap">
          <select className="h-8 rounded border border-input bg-background px-2 text-xs text-foreground"
            value={filterClass} onChange={e => setFilterClass(e.target.value)}>
            <option value="all">All Classes ({ships.length})</option>
            {CLASS_CODES.map(c => <option key={c} value={c}>{c} ({ships.filter(s => s.class === c).length})</option>)}
          </select>
          <Button size="sm" variant="ghost" onClick={() => setShowWeapons(!showWeapons)}>
            {showWeapons ? <ChevronDown className="mr-1 h-3 w-3" /> : <ChevronRight className="mr-1 h-3 w-3" />} Weapons
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setShowUtility(!showUtility)}>
            {showUtility ? <ChevronDown className="mr-1 h-3 w-3" /> : <ChevronRight className="mr-1 h-3 w-3" />} Utility
          </Button>
        </div>

        <div className="overflow-x-auto border border-border rounded">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                {CORE_FIELDS.map(f => (
                  <th key={f.key} className="px-2 py-2 text-left font-medium text-muted-foreground text-xs whitespace-nowrap">{f.label}</th>
                ))}
                {showWeapons && WEAPON_FIELDS.map(f => (
                  <th key={f.key} className="px-1 py-2 text-left font-medium text-muted-foreground text-xs whitespace-nowrap">{f.label}</th>
                ))}
                {showUtility && UTILITY_FIELDS.map(f => (
                  <th key={f.key} className="px-1 py-2 text-left font-medium text-muted-foreground text-xs whitespace-nowrap">{f.label}</th>
                ))}
                <th className="px-2 py-2 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(s => (
                <tr key={s.id} className={`border-b border-border ${s._dirty ? "bg-primary/5" : ""}`}>
                  {CORE_FIELDS.map(f => (
                    <td key={f.key} className="px-1 py-1">
                      {f.type === "select" ? (
                        <select className="h-7 w-full rounded border border-input bg-background px-1 text-xs text-foreground"
                          value={s[f.key] as string} onChange={e => updateField(s.id, f.key, e.target.value)}>
                          {f.options!.map(o => <option key={o} value={o}>{o}</option>)}
                        </select>
                      ) : f.type === "number" ? (
                        <Input className={`h-7 ${f.width || "w-16"} text-xs`} type="number"
                          value={s[f.key] as number}
                          onChange={e => updateField(s.id, f.key, f.key === "maintenance" ? parseFloat(e.target.value) || 0 : parseInt(e.target.value) || 0)} />
                      ) : (
                        <Input className={`h-7 ${f.width || ""} text-xs`} value={s[f.key] as string}
                          onChange={e => updateField(s.id, f.key, e.target.value)} />
                      )}
                    </td>
                  ))}
                  {showWeapons && WEAPON_FIELDS.map(f => (
                    <td key={f.key} className="px-1 py-1">
                      <Input className="h-7 w-12 text-xs" type="number" value={s[f.key] as number}
                        onChange={e => updateField(s.id, f.key, parseInt(e.target.value) || 0)} />
                    </td>
                  ))}
                  {showUtility && UTILITY_FIELDS.map(f => (
                    <td key={f.key} className="px-1 py-1">
                      <Input className="h-7 w-12 text-xs" type="number" value={s[f.key] as number}
                        onChange={e => updateField(s.id, f.key, parseInt(e.target.value) || 0)} />
                    </td>
                  ))}
                  <td className="px-1 py-1">
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => deleteShip(s.id, s._new)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">Showing {filtered.length} of {ships.length} ships</p>
      </div>
      <Footer />
    </div>
  );
};

export default AdminShips;
