import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import { Plus, Trash2, Save, Undo2 } from "lucide-react";

interface Weapon {
  id: string;
  name: string;
  type: string;
  damage: number;
  hit_chance: number;
  armor_penetration: number;
  range: string;
  rate_of_fire: number;
  special_notes: string;
  point_cost: number;
  _dirty?: boolean;
  _new?: boolean;
  _deleted?: boolean;
}

const WEAPON_TYPES = ["Laser", "Missile", "Kinetic", "Energy"];
const RANGES = ["Short", "Medium", "Long"];

const AdminWeapons = () => {
  const { user, loading, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [weapons, setWeapons] = useState<Weapon[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!loading && (!user || !isAdmin)) navigate("/dashboard");
  }, [loading, user, isAdmin, navigate]);

  useEffect(() => {
    loadWeapons();
  }, []);

  const loadWeapons = async () => {
    const { data } = await supabase.from("weapons").select("*").order("type").order("point_cost");
    if (data) setWeapons(data.map(w => ({ ...w, hit_chance: Number(w.hit_chance), armor_penetration: Number(w.armor_penetration), special_notes: w.special_notes ?? "" })));
  };

  const updateField = (id: string, field: keyof Weapon, value: string | number) => {
    setWeapons(prev => prev.map(w => w.id === id ? { ...w, [field]: value, _dirty: true } : w));
  };

  const addWeapon = () => {
    const newWeapon: Weapon = {
      id: crypto.randomUUID(),
      name: "New Weapon",
      type: "Laser",
      damage: 1,
      hit_chance: 0.5,
      armor_penetration: 0,
      range: "Medium",
      rate_of_fire: 1,
      special_notes: "",
      point_cost: 1,
      _dirty: true,
      _new: true,
    };
    setWeapons(prev => [...prev, newWeapon]);
  };

  const deleteWeapon = (id: string, isNew?: boolean) => {
    if (isNew) {
      setWeapons(prev => prev.filter(w => w.id !== id));
    } else {
      setWeapons(prev => prev.map(w => w.id === id ? { ...w, _deleted: true } : w));
    }
  };

  const undoDelete = (id: string) => {
    setWeapons(prev => prev.map(w => w.id === id ? { ...w, _deleted: false } : w));
  };

  const saveAll = async () => {
    setSaving(true);
    const dirty = weapons.filter(w => w._dirty && !w._deleted);
    const toDelete = weapons.filter(w => w._deleted && !w._new);
    let errors = 0;

    for (const w of toDelete) {
      const { error } = await supabase.from("weapons").delete().eq("id", w.id);
      if (error) { errors++; console.error(error); }
    }

    for (const w of dirty) {
      const payload = {
        id: w.id,
        name: w.name,
        type: w.type,
        damage: w.damage,
        hit_chance: w.hit_chance,
        armor_penetration: w.armor_penetration,
        range: w.range,
        rate_of_fire: w.rate_of_fire,
        special_notes: w.special_notes,
        point_cost: w.point_cost,
      };

      if (w._new) {
        const { error } = await supabase.from("weapons").insert(payload);
        if (error) { errors++; console.error(error); }
      } else {
        const { error } = await supabase.from("weapons").update(payload).eq("id", w.id);
        if (error) { errors++; console.error(error); }
      }
    }

    if (errors) {
      toast({ title: "Some saves failed", description: `${errors} error(s)`, variant: "destructive" });
    } else {
      toast({ title: "Saved", description: `${dirty.length} updated, ${toDelete.length} deleted` });
    }

    await loadWeapons();
    setSaving(false);
  };

  if (loading) return <div className="min-h-screen bg-background"><Header /><div className="container py-20 text-center text-muted-foreground">Loading...</div><Footer /></div>;

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="container py-16">
        <div className="flex items-center justify-between mb-6">
          <h1 className="font-heading text-2xl font-bold text-foreground">Weapons Catalog (Admin)</h1>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={addWeapon}><Plus className="mr-1 h-4 w-4" /> Add Weapon</Button>
            <Button size="sm" onClick={saveAll} disabled={saving || !weapons.some(w => w._dirty || w._deleted)}>
              <Save className="mr-1 h-4 w-4" /> {saving ? "Saving..." : "Save All"}
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto border border-border rounded">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Name</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Type</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Damage</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Hit %</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">AP</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Range</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">RoF</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Cost</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Notes</th>
                <th className="px-3 py-2 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {weapons.map(w => (
                <tr key={w.id} className={`border-b border-border ${w._dirty ? "bg-primary/5" : ""}`}>
                  <td className="px-1 py-1">
                    <Input className="h-8 text-xs" value={w.name} onChange={e => updateField(w.id, "name", e.target.value)} />
                  </td>
                  <td className="px-1 py-1">
                    <select className="h-8 w-full rounded border border-input bg-background px-2 text-xs text-foreground" value={w.type} onChange={e => updateField(w.id, "type", e.target.value)}>
                      {WEAPON_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </td>
                  <td className="px-1 py-1">
                    <Input className="h-8 w-16 text-xs" type="number" value={w.damage} onChange={e => updateField(w.id, "damage", parseInt(e.target.value) || 0)} />
                  </td>
                  <td className="px-1 py-1">
                    <Input className="h-8 w-16 text-xs" type="number" step="0.05" min="0" max="1" value={w.hit_chance} onChange={e => updateField(w.id, "hit_chance", parseFloat(e.target.value) || 0)} />
                  </td>
                  <td className="px-1 py-1">
                    <Input className="h-8 w-14 text-xs" type="number" value={w.armor_penetration} onChange={e => updateField(w.id, "armor_penetration", parseInt(e.target.value) || 0)} />
                  </td>
                  <td className="px-1 py-1">
                    <select className="h-8 w-full rounded border border-input bg-background px-2 text-xs text-foreground" value={w.range} onChange={e => updateField(w.id, "range", e.target.value)}>
                      {RANGES.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </td>
                  <td className="px-1 py-1">
                    <Input className="h-8 w-14 text-xs" type="number" value={w.rate_of_fire} onChange={e => updateField(w.id, "rate_of_fire", parseInt(e.target.value) || 1)} />
                  </td>
                  <td className="px-1 py-1">
                    <Input className="h-8 w-14 text-xs" type="number" value={w.point_cost} onChange={e => updateField(w.id, "point_cost", parseInt(e.target.value) || 1)} />
                  </td>
                  <td className="px-1 py-1">
                    <Input className="h-8 text-xs" value={w.special_notes} onChange={e => updateField(w.id, "special_notes", e.target.value)} />
                  </td>
                  <td className="px-1 py-1">
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => deleteWeapon(w.id, w._new)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default AdminWeapons;
