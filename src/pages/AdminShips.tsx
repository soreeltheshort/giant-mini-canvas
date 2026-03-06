import { useEffect, useState, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import { Plus, Trash2, Save, Upload } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

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
  // Virtual speeds
  virtual_atk_speed_attack: number;
  virtual_atk_speed_core: number;
  virtual_atk_speed_rear: number;
  virtual_atk_speed_retreat: number;
  virtual_atk_speed_attack_planet: number;
  virtual_atk_speed_outflank: number;
  virtual_atk_speed_skirmish: number;
  virtual_atk_speed_cover_retreat: number;
  virtual_atk_speed_flank: number;
  virtual_def_speed_attack: number;
  virtual_def_speed_core: number;
  virtual_def_speed_rear: number;
  virtual_def_speed_retreat: number;
  virtual_def_speed_attack_planet: number;
  virtual_def_speed_outflank: number;
  virtual_def_speed_skirmish: number;
  virtual_def_speed_cover_retreat: number;
  virtual_def_speed_flank: number;
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
  { key: "flavor_description", label: "Flavor", type: "text", width: "w-48" },
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

const VIRTUAL_SPEED_GROUPS = ["Attack", "Core", "Rear", "Retreat", "Attack Planet", "Outflank", "Skirmish", "Cover Retreat", "Flank"] as const;

const VIRTUAL_ATK_FIELDS: { key: keyof ShipType; label: string }[] = VIRTUAL_SPEED_GROUPS.map(g => ({
  key: `virtual_atk_speed_${g.toLowerCase().replace(/ /g, "_")}` as keyof ShipType,
  label: g,
}));

const VIRTUAL_DEF_FIELDS: { key: keyof ShipType; label: string }[] = VIRTUAL_SPEED_GROUPS.map(g => ({
  key: `virtual_def_speed_${g.toLowerCase().replace(/ /g, "_")}` as keyof ShipType,
  label: g,
}));

const AdminShips = () => {
  const { user, loading, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [ships, setShips] = useState<ShipType[]>([]);
  const [saving, setSaving] = useState(false);
  const [filterClass, setFilterClass] = useState<string>("all");
  const [csvPending, setCsvPending] = useState<Record<string, string | number | null>[] | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const CSV_FIELD_MAP: Record<string, keyof ShipType> = {
    name: "name", class: "class", hull_class: "hull_class", hull: "hull", armor: "armor",
    point_cost: "point_cost", maintenance: "maintenance", cbt_speed: "cbt_speed", map_speed: "map_speed",
    sensor_rating: "sensor_rating", target_preference: "target_preference", flavor_description: "flavor_description",
    ship_id: "ship_id",
    laser_2_5cm: "laser_2_5cm", "laser_2.5cm": "laser_2_5cm",
    laser_4_5cm: "laser_4_5cm", "laser_4.5cm": "laser_4_5cm",
    laser_6_5cm: "laser_6_5cm", "laser_6.5cm": "laser_6_5cm",
    laser_10cm: "laser_10cm", laser_14cm: "laser_14cm", laser_20cm: "laser_20cm",
    laser_28cm: "laser_28cm", laser_50cm: "laser_50cm",
    missile_10kg: "missile_10kg", missile_50kg: "missile_50kg",
    missile_100kg: "missile_100kg", missile_half_kt: "missile_half_kt",
    fighter_bay: "fighter_bay", fighter_storage: "fighter_storage",
    gun_ship_link: "gun_ship_link", gunship_storage: "gunship_storage",
    scout_sensors: "scout_sensors", supply_pod: "supply_pod",
    repair_pod: "repair_pod", ground_invasion: "ground_invasion",
    // Virtual speed CSV header mappings
    virtual_attack_speed_attack: "virtual_atk_speed_attack",
    virtual_attack_speed_core: "virtual_atk_speed_core",
    "virtual_attack_speed_core_": "virtual_atk_speed_core",
    virtual_attack_speed_rear: "virtual_atk_speed_rear",
    virtual_attack_speed_retreat: "virtual_atk_speed_retreat",
    virtual_attack_speed_attack_planet: "virtual_atk_speed_attack_planet",
    virtual_attack_speed_outflank: "virtual_atk_speed_outflank",
    virtual_attack_speed_skirmish: "virtual_atk_speed_skirmish",
    virtual_attack_speed_cover_retreat: "virtual_atk_speed_cover_retreat",
    virtual_attack_speed_flank: "virtual_atk_speed_flank",
    virtual_defense_speed_attack: "virtual_def_speed_attack",
    virtual_defense_speed_core: "virtual_def_speed_core",
    "virtual_defense_speed_core_": "virtual_def_speed_core",
    virtual_defense_speed_rear: "virtual_def_speed_rear",
    virtual_defense_speed_retreat: "virtual_def_speed_retreat",
    virtual_defense_speed_attack_planet: "virtual_def_speed_attack_planet",
    virtual_defense_speed_outflank: "virtual_def_speed_outflank",
    virtual_defense_speed_skirmish: "virtual_def_speed_skirmish",
    virtual_defense_speed_cover_retreat: "virtual_def_speed_cover_retreat",
    virtual_defense_speed_flank: "virtual_def_speed_flank",
  };

  const FLOAT_FIELDS = new Set<string>([
    "maintenance",
    "virtual_atk_speed_attack", "virtual_atk_speed_core", "virtual_atk_speed_rear",
    "virtual_atk_speed_retreat", "virtual_atk_speed_attack_planet", "virtual_atk_speed_outflank",
    "virtual_atk_speed_skirmish", "virtual_atk_speed_cover_retreat", "virtual_atk_speed_flank",
    "virtual_def_speed_attack", "virtual_def_speed_core", "virtual_def_speed_rear",
    "virtual_def_speed_retreat", "virtual_def_speed_attack_planet", "virtual_def_speed_outflank",
    "virtual_def_speed_skirmish", "virtual_def_speed_cover_retreat", "virtual_def_speed_flank",
  ]);

  const NUM_FIELDS = new Set<string>([
    "hull", "armor", "point_cost", "cbt_speed", "map_speed", "sensor_rating",
    "laser_2_5cm", "laser_4_5cm", "laser_6_5cm", "laser_10cm", "laser_14cm",
    "laser_20cm", "laser_28cm", "laser_50cm", "missile_10kg", "missile_50kg",
    "missile_100kg", "missile_half_kt", "fighter_bay", "fighter_storage",
    "gun_ship_link", "gunship_storage", "scout_sensors", "supply_pod",
    "repair_pod", "ground_invasion",
  ]);

  const parseCSV = (text: string) => {
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) return [];
    const headers = lines[0].split(",").map(h => h.trim().toLowerCase().replace(/\s+/g, "_"));
    return lines.slice(1).map(line => {
      // Handle quoted fields with commas
      const values: string[] = [];
      let current = "";
      let inQuotes = false;
      for (const ch of line) {
        if (ch === '"') { inQuotes = !inQuotes; continue; }
        if (ch === ',' && !inQuotes) { values.push(current.trim()); current = ""; continue; }
        current += ch;
      }
      values.push(current.trim());

      const row: Record<string, string | number | null> = {};
      headers.forEach((h, i) => {
        const mapped = CSV_FIELD_MAP[h];
        if (!mapped) return;
        const val = values[i] ?? "";
        if (FLOAT_FIELDS.has(mapped)) {
          row[mapped] = parseFloat(val) || 0;
        } else if (NUM_FIELDS.has(mapped)) {
          row[mapped] = parseInt(val) || 0;
        } else if (mapped === "ship_id") {
          row[mapped] = val || null;
        } else {
          row[mapped] = val;
        }
      });
      return row;
    }).filter(r => r.name);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const parsed = parseCSV(text);
      if (parsed.length === 0) {
        toast({ title: "Error", description: "No valid ship rows found in CSV", variant: "destructive" });
        return;
      }
      setCsvPending(parsed);
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const confirmUpload = async () => {
    if (!csvPending) return;
    setUploading(true);
    // Delete all existing ships
    const { error: delErr } = await supabase.from("ship_types").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    if (delErr) {
      toast({ title: "Error deleting old ships", description: delErr.message, variant: "destructive" });
      setUploading(false);
      setCsvPending(null);
      return;
    }
    // Insert in batches of 50
    let errors = 0;
    for (let i = 0; i < csvPending.length; i += 50) {
      const batch = csvPending.slice(i, i + 50);
      const { error } = await supabase.from("ship_types").insert(batch as any);
      if (error) { errors++; console.error(error); }
    }
    if (errors) {
      toast({ title: "Upload partially failed", description: `${errors} batch error(s)`, variant: "destructive" });
    } else {
      toast({ title: "Upload complete", description: `${csvPending.length} ships imported` });
    }
    setCsvPending(null);
    setUploading(false);
    await loadShips();
  };

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
      virtual_atk_speed_attack: 0, virtual_atk_speed_core: 0, virtual_atk_speed_rear: 0,
      virtual_atk_speed_retreat: 0, virtual_atk_speed_attack_planet: 0, virtual_atk_speed_outflank: 0,
      virtual_atk_speed_skirmish: 0, virtual_atk_speed_cover_retreat: 0, virtual_atk_speed_flank: 0,
      virtual_def_speed_attack: 0, virtual_def_speed_core: 0, virtual_def_speed_rear: 0,
      virtual_def_speed_retreat: 0, virtual_def_speed_attack_planet: 0, virtual_def_speed_outflank: 0,
      virtual_def_speed_skirmish: 0, virtual_def_speed_cover_retreat: 0, virtual_def_speed_flank: 0,
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
            <input ref={fileInputRef} type="file" accept=".csv" className="hidden" onChange={handleFileSelect} />
            <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()}>
              <Upload className="mr-1 h-4 w-4" /> Upload CSV
            </Button>
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
        </div>

        <div className="overflow-auto border border-border rounded max-h-[70vh]">
          <table className="text-sm border-collapse">
            <thead className="sticky top-0 z-20 bg-muted">
              <tr className="border-b border-border">
                {CORE_FIELDS.map((f, i) => (
                  <th key={f.key} className={`px-2 py-2 text-left font-medium text-muted-foreground text-xs whitespace-nowrap bg-muted ${i < 2 ? `sticky left-0 z-30 ${i === 1 ? 'left-[160px] border-r border-border' : ''}` : ''}`}
                    style={i === 0 ? { left: 0, minWidth: 160 } : i === 1 ? { left: 160, minWidth: 80 } : undefined}>
                    {f.label}
                  </th>
                ))}
                {WEAPON_FIELDS.map(f => (
                  <th key={f.key} className="px-1 py-2 text-left font-medium text-muted-foreground text-xs whitespace-nowrap bg-muted">{f.label}</th>
                ))}
                {UTILITY_FIELDS.map(f => (
                  <th key={f.key} className="px-1 py-2 text-left font-medium text-muted-foreground text-xs whitespace-nowrap bg-muted">{f.label}</th>
                ))}
                <th className="px-2 py-2 w-10 bg-muted"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(s => (
                <tr key={s.id} className={`border-b border-border ${s._dirty ? "bg-primary/5" : ""}`}>
                  {CORE_FIELDS.map((f, i) => (
                    <td key={f.key} className={`px-1 py-1 ${i < 2 ? `sticky z-10 bg-background ${i === 1 ? 'left-[160px] border-r border-border' : 'left-0'}` : ''} ${s._dirty && i < 2 ? '!bg-primary/5' : ''}`}
                      style={i === 0 ? { left: 0, minWidth: 160 } : i === 1 ? { left: 160, minWidth: 80 } : undefined}>
                      {f.type === "select" ? (
                        <select className={`h-7 rounded border border-input bg-background px-1 text-xs text-foreground ${i === 1 ? 'w-20' : 'w-full'}`}
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
                  {WEAPON_FIELDS.map(f => (
                    <td key={f.key} className="px-1 py-1">
                      <Input className="h-7 w-12 text-xs" type="number" value={s[f.key] as number}
                        onChange={e => updateField(s.id, f.key, parseInt(e.target.value) || 0)} />
                    </td>
                  ))}
                  {UTILITY_FIELDS.map(f => (
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

      <AlertDialog open={!!csvPending} onOpenChange={(open) => { if (!open) setCsvPending(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Replace All Ships?</AlertDialogTitle>
            <AlertDialogDescription>
              This will <strong>delete all {ships.length} existing ships</strong> and replace them with <strong>{csvPending?.length ?? 0} ships</strong> from the CSV. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={uploading}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmUpload} disabled={uploading}>
              {uploading ? "Uploading..." : "Replace All Ships"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AdminShips;
