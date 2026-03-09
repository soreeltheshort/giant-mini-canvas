import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import { Plus, Trash2, Save } from "lucide-react";

interface Phase {
  id: string;
  seq_order: number;
  name: string;
  groups_a: string[];
  groups_b: string[];
  mod_a: number;
  mod_b: number;
  required_group: string | null;
  _dirty?: boolean;
  _new?: boolean;
}

interface GroupMod {
  id: string;
  group_name: string;
  attack_mod: number;
  defense_mod: number;
  _dirty?: boolean;
  _new?: boolean;
}

interface CombatConst {
  id: string;
  key: string;
  value: number;
  description: string;
  _dirty?: boolean;
  _new?: boolean;
}

interface WeaponTargetPref {
  id: string;
  weapon_key: string;
  hull_class: string;
  priority: number;
  _dirty?: boolean;
  _new?: boolean;
}

interface GroundCombatOutcome {
  id: string;
  probability: number;
  damage: number;
  description: string;
  _dirty?: boolean;
  _new?: boolean;
}

const ALL_GROUPS = ["Core", "Attack", "Flank", "Outflank", "Attack Planet", "Cover Retreat", "Skirmish", "Rear", "Retreat", "System Defenses"];

const ALL_HULL_CLASSES = ["FL", "FH", "GS", "DD", "CL", "CM", "CH", "BB", "T", "TT", "Titan"];

const ALL_WEAPON_KEYS = [
  "laser_2_5cm", "laser_4_5cm", "laser_6_5cm", "laser_10cm", "laser_14cm",
  "laser_20cm", "laser_28cm", "laser_50cm",
  "missile_10kg", "missile_50kg", "missile_100kg", "missile_half_kt",
];

const WEAPON_DISPLAY: Record<string, string> = {
  laser_2_5cm: "2.5cm Laser", laser_4_5cm: "4.5cm Laser", laser_6_5cm: "6.5cm Laser",
  laser_10cm: "10cm Laser", laser_14cm: "14cm Laser", laser_20cm: "20cm Laser",
  laser_28cm: "28cm Laser", laser_50cm: "50cm Laser",
  missile_10kg: "10kg Missile", missile_50kg: "50kg Missile", missile_100kg: "100kg Missile",
  missile_half_kt: "½kt Missile",
};

const AdminBattleConfig = () => {
  const { user, loading, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [phases, setPhases] = useState<Phase[]>([]);
  const [groupMods, setGroupMods] = useState<GroupMod[]>([]);
  const [constants, setConstants] = useState<CombatConst[]>([]);
  const [weaponPrefs, setWeaponPrefs] = useState<WeaponTargetPref[]>([]);
  const [groundOutcomes, setGroundOutcomes] = useState<GroundCombatOutcome[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!loading && (!user || !isAdmin)) navigate("/dashboard");
  }, [loading, user, isAdmin, navigate]);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    const [{ data: p }, { data: g }, { data: c }, { data: w }, { data: go }] = await Promise.all([
      supabase.from("battle_phases").select("*").order("seq_order"),
      supabase.from("group_modifiers").select("*").order("group_name"),
      supabase.from("combat_constants").select("*").order("key"),
      supabase.from("weapon_target_preferences").select("*").order("weapon_key").order("priority"),
      supabase.from("ground_combat_outcomes").select("*").order("min_force"),
    ]);
    if (p) setPhases(p.map(r => ({ ...r, mod_a: Number(r.mod_a), mod_b: Number(r.mod_b) })));
    if (g) setGroupMods(g.map(r => ({ ...r, attack_mod: Number(r.attack_mod), defense_mod: Number(r.defense_mod) })));
    if (c) setConstants(c.map(r => ({ ...r, value: Number(r.value) })));
    if (w) setWeaponPrefs(w);
    if (go) setGroundOutcomes(go);
  };

  // --- Phase helpers ---
  const updatePhase = (id: string, field: keyof Phase, value: any) => {
    setPhases(prev => prev.map(p => p.id === id ? { ...p, [field]: value, _dirty: true } : p));
  };

  const toggleGroup = (id: string, field: "groups_a" | "groups_b", group: string) => {
    setPhases(prev => prev.map(p => {
      if (p.id !== id) return p;
      const arr = p[field].includes(group) ? p[field].filter(g => g !== group) : [...p[field], group];
      return { ...p, [field]: arr, _dirty: true };
    }));
  };

  const addPhase = () => {
    const maxSeq = phases.reduce((m, p) => Math.max(m, p.seq_order), 0);
    setPhases(prev => [...prev, {
      id: crypto.randomUUID(), seq_order: maxSeq + 1, name: "New Phase",
      groups_a: [], groups_b: [], mod_a: 0, mod_b: 0, required_group: null, _dirty: true, _new: true,
    }]);
  };

  const deletePhase = async (id: string, isNew?: boolean) => {
    if (!isNew) {
      const { error } = await supabase.from("battle_phases").delete().eq("id", id);
      if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    }
    setPhases(prev => prev.filter(p => p.id !== id));
    toast({ title: "Deleted" });
  };

  // --- Group mod helpers ---
  const updateGroupMod = (id: string, field: keyof GroupMod, value: any) => {
    setGroupMods(prev => prev.map(g => g.id === id ? { ...g, [field]: value, _dirty: true } : g));
  };

  const addGroupMod = () => {
    setGroupMods(prev => [...prev, {
      id: crypto.randomUUID(), group_name: "NewGroup", attack_mod: 0, defense_mod: 0,
      _dirty: true, _new: true,
    }]);
  };

  const deleteGroupMod = async (id: string, isNew?: boolean) => {
    if (!isNew) {
      const { error } = await supabase.from("group_modifiers").delete().eq("id", id);
      if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    }
    setGroupMods(prev => prev.filter(g => g.id !== id));
    toast({ title: "Deleted" });
  };

  // --- Combat constants helpers ---
  const updateConst = (id: string, field: keyof CombatConst, value: any) => {
    setConstants(prev => prev.map(c => c.id === id ? { ...c, [field]: value, _dirty: true } : c));
  };

  const addConst = () => {
    setConstants(prev => [...prev, {
      id: crypto.randomUUID(), key: "new_constant", value: 0, description: "",
      _dirty: true, _new: true,
    }]);
  };

  const deleteConst = async (id: string, isNew?: boolean) => {
    if (!isNew) {
      const { error } = await supabase.from("combat_constants").delete().eq("id", id);
      if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    }
    setConstants(prev => prev.filter(c => c.id !== id));
    toast({ title: "Deleted" });
  };

  // --- Weapon target preference helpers ---
  const updateWeaponPref = (id: string, field: keyof WeaponTargetPref, value: any) => {
    setWeaponPrefs(prev => prev.map(w => w.id === id ? { ...w, [field]: value, _dirty: true } : w));
  };

  const addWeaponPref = () => {
    setWeaponPrefs(prev => [...prev, {
      id: crypto.randomUUID(), weapon_key: "laser_2_5cm", hull_class: "FL", priority: 0,
      _dirty: true, _new: true,
    }]);
  };

  const deleteWeaponPref = async (id: string, isNew?: boolean) => {
    if (!isNew) {
      const { error } = await supabase.from("weapon_target_preferences").delete().eq("id", id);
      if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    }
    setWeaponPrefs(prev => prev.filter(w => w.id !== id));
    toast({ title: "Deleted" });
  };

  // --- Ground combat outcome helpers ---
  const updateGroundOutcome = (id: string, field: keyof GroundCombatOutcome, value: any) => {
    setGroundOutcomes(prev => prev.map(o => o.id === id ? { ...o, [field]: value, _dirty: true } : o));
  };

  const addGroundOutcome = () => {
    setGroundOutcomes(prev => [...prev, {
      id: crypto.randomUUID(), probability: 0, damage: 0, description: "",
      _dirty: true, _new: true,
    }]);
  };

  const deleteGroundOutcome = async (id: string, isNew?: boolean) => {
    if (!isNew) {
      const { error } = await supabase.from("ground_combat_outcomes").delete().eq("id", id);
      if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    }
    setGroundOutcomes(prev => prev.filter(o => o.id !== id));
    toast({ title: "Deleted" });
  };

  const saveAll = async () => {
    setSaving(true);
    let errors = 0;

    for (const p of phases.filter(p => p._dirty)) {
      const payload = { id: p.id, seq_order: p.seq_order, name: p.name, groups_a: p.groups_a, groups_b: p.groups_b, mod_a: p.mod_a, mod_b: p.mod_b, required_group: p.required_group };
      const { error } = p._new
        ? await supabase.from("battle_phases").insert(payload)
        : await supabase.from("battle_phases").update(payload).eq("id", p.id);
      if (error) { errors++; console.error(error); }
    }

    for (const g of groupMods.filter(g => g._dirty)) {
      const payload = { id: g.id, group_name: g.group_name, attack_mod: g.attack_mod, defense_mod: g.defense_mod };
      const { error } = g._new
        ? await supabase.from("group_modifiers").insert(payload)
        : await supabase.from("group_modifiers").update(payload).eq("id", g.id);
      if (error) { errors++; console.error(error); }
    }

    for (const c of constants.filter(c => c._dirty)) {
      const payload = { id: c.id, key: c.key, value: c.value, description: c.description };
      const { error } = c._new
        ? await supabase.from("combat_constants").insert(payload)
        : await supabase.from("combat_constants").update(payload).eq("id", c.id);
      if (error) { errors++; console.error(error); }
    }

    for (const w of weaponPrefs.filter(w => w._dirty)) {
      const payload = { id: w.id, weapon_key: w.weapon_key, hull_class: w.hull_class, priority: w.priority };
      const { error } = w._new
        ? await supabase.from("weapon_target_preferences").insert(payload as any)
        : await supabase.from("weapon_target_preferences").update(payload as any).eq("id", w.id);
      if (error) { errors++; console.error(error); }
    }

    for (const o of groundOutcomes.filter(o => o._dirty)) {
      const payload = { id: o.id, min_force: o.min_force, max_force: o.max_force, casualties_inflicted: o.casualties_inflicted, description: o.description };
      const { error } = o._new
        ? await supabase.from("ground_combat_outcomes").insert(payload)
        : await supabase.from("ground_combat_outcomes").update(payload).eq("id", o.id);
      if (error) { errors++; console.error(error); }
    }

    if (errors) toast({ title: "Some saves failed", description: `${errors} error(s)`, variant: "destructive" });
    else toast({ title: "Saved" });

    await loadData();
    setSaving(false);
  };

  const hasDirty = phases.some(p => p._dirty) || groupMods.some(g => g._dirty) || constants.some(c => c._dirty) || weaponPrefs.some(w => w._dirty) || groundOutcomes.some(o => o._dirty);

  if (loading) return <div className="min-h-screen bg-background"><Header /><div className="container py-20 text-center text-muted-foreground">Loading...</div><Footer /></div>;

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="container py-16">
        <div className="flex items-center justify-between mb-6">
          <h1 className="font-heading text-2xl font-bold text-foreground">Battle Config (Admin)</h1>
          <Button size="sm" onClick={saveAll} disabled={saving || !hasDirty}>
            <Save className="mr-1 h-4 w-4" /> {saving ? "Saving..." : "Save All"}
          </Button>
        </div>

        {/* PHASES */}
        <div className="mb-10">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-heading text-lg font-semibold text-foreground">Battle Phases (order of engagement)</h2>
            <Button size="sm" variant="outline" onClick={addPhase}><Plus className="mr-1 h-4 w-4" /> Add Phase</Button>
          </div>
          <div className="overflow-x-auto border border-border rounded">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground w-14">#</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Name</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Groups A</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Groups B</th>
                   <th className="px-3 py-2 text-left font-medium text-muted-foreground w-20">Mod A</th>
                   <th className="px-3 py-2 text-left font-medium text-muted-foreground w-20">Mod B</th>
                   <th className="px-3 py-2 text-left font-medium text-muted-foreground w-32">Required Group</th>
                   <th className="px-3 py-2 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {phases.map(p => (
                  <tr key={p.id} className={`border-b border-border ${p._dirty ? "bg-primary/5" : ""}`}>
                    <td className="px-1 py-1">
                      <Input className="h-8 w-14 text-xs" type="number" value={p.seq_order} onChange={e => updatePhase(p.id, "seq_order", parseInt(e.target.value) || 0)} />
                    </td>
                    <td className="px-1 py-1">
                      <Input className="h-8 text-xs" value={p.name} onChange={e => updatePhase(p.id, "name", e.target.value)} />
                    </td>
                    <td className="px-1 py-1">
                      <div className="flex flex-wrap gap-1">
                        {ALL_GROUPS.map(g => (
                          <button key={g} onClick={() => toggleGroup(p.id, "groups_a", g)}
                            className={`px-1.5 py-0.5 text-xs rounded border ${p.groups_a.includes(g) ? "bg-primary text-primary-foreground border-primary" : "bg-background text-muted-foreground border-border"}`}>
                            {g}
                          </button>
                        ))}
                      </div>
                    </td>
                    <td className="px-1 py-1">
                      <div className="flex flex-wrap gap-1">
                        {ALL_GROUPS.map(g => (
                          <button key={g} onClick={() => toggleGroup(p.id, "groups_b", g)}
                            className={`px-1.5 py-0.5 text-xs rounded border ${p.groups_b.includes(g) ? "bg-primary text-primary-foreground border-primary" : "bg-background text-muted-foreground border-border"}`}>
                            {g}
                          </button>
                        ))}
                      </div>
                    </td>
                    <td className="px-1 py-1">
                      <Input className="h-8 w-20 text-xs" type="number" step="0.05" value={p.mod_a} onChange={e => updatePhase(p.id, "mod_a", parseFloat(e.target.value) || 0)} />
                    </td>
                     <td className="px-1 py-1">
                       <Input className="h-8 w-20 text-xs" type="number" step="0.05" value={p.mod_b} onChange={e => updatePhase(p.id, "mod_b", parseFloat(e.target.value) || 0)} />
                     </td>
                     <td className="px-1 py-1">
                       <select className="h-8 w-32 text-xs rounded border border-border bg-background text-foreground px-1"
                         value={p.required_group || ""}
                         onChange={e => updatePhase(p.id, "required_group", e.target.value || null)}>
                         <option value="">None</option>
                         {ALL_GROUPS.map(g => <option key={g} value={g}>{g}</option>)}
                       </select>
                     </td>
                     <td className="px-1 py-1">
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => deletePhase(p.id, p._new)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* GROUP MODIFIERS */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-heading text-lg font-semibold text-foreground">Group Modifiers (per-group attack/defense bonuses)</h2>
            <Button size="sm" variant="outline" onClick={addGroupMod}><Plus className="mr-1 h-4 w-4" /> Add Group</Button>
          </div>
          <div className="overflow-x-auto border border-border rounded">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Group Name</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground w-24">Attack Mod</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground w-24">Defense Mod</th>
                  <th className="px-3 py-2 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {groupMods.map(g => (
                  <tr key={g.id} className={`border-b border-border ${g._dirty ? "bg-primary/5" : ""}`}>
                    <td className="px-1 py-1">
                      <Input className="h-8 text-xs" value={g.group_name} onChange={e => updateGroupMod(g.id, "group_name", e.target.value)} />
                    </td>
                    <td className="px-1 py-1">
                      <Input className="h-8 w-24 text-xs" type="number" step="0.05" value={g.attack_mod} onChange={e => updateGroupMod(g.id, "attack_mod", parseFloat(e.target.value) || 0)} />
                    </td>
                    <td className="px-1 py-1">
                      <Input className="h-8 w-24 text-xs" type="number" step="0.05" value={g.defense_mod} onChange={e => updateGroupMod(g.id, "defense_mod", parseFloat(e.target.value) || 0)} />
                    </td>
                    <td className="px-1 py-1">
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => deleteGroupMod(g.id, g._new)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* COMBAT CONSTANTS */}
        <div className="mt-10">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-heading text-lg font-semibold text-foreground">Combat Constants (hit chance & critical formula)</h2>
            <Button size="sm" variant="outline" onClick={addConst}><Plus className="mr-1 h-4 w-4" /> Add Constant</Button>
          </div>
          <div className="overflow-x-auto border border-border rounded">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Key</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground w-28">Value</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Description</th>
                  <th className="px-3 py-2 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {constants.map(c => (
                  <tr key={c.id} className={`border-b border-border ${c._dirty ? "bg-primary/5" : ""}`}>
                    <td className="px-1 py-1">
                      <Input className="h-8 text-xs" value={c.key} onChange={e => updateConst(c.id, "key", e.target.value)} />
                    </td>
                    <td className="px-1 py-1">
                      <Input className="h-8 w-28 text-xs" type="number" step="0.01" value={c.value} onChange={e => updateConst(c.id, "value", parseFloat(e.target.value) || 0)} />
                    </td>
                    <td className="px-1 py-1">
                      <Input className="h-8 text-xs" value={c.description} onChange={e => updateConst(c.id, "description", e.target.value)} />
                    </td>
                    <td className="px-1 py-1">
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => deleteConst(c.id, c._new)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* WEAPON TARGET PREFERENCES */}
        <div className="mt-10">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-heading text-lg font-semibold text-foreground">Weapon Target Preferences</h2>
            <Button size="sm" variant="outline" onClick={addWeaponPref}><Plus className="mr-1 h-4 w-4" /> Add Preference</Button>
          </div>
          <p className="text-xs text-muted-foreground mb-3">Configure per-weapon targeting priority. Lower priority number = higher preference. Weapons without entries default to the ship's target preference.</p>
          <div className="overflow-x-auto border border-border rounded">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Weapon</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Target Hull Class</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground w-20">Priority</th>
                  <th className="px-3 py-2 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {weaponPrefs.map(w => (
                  <tr key={w.id} className={`border-b border-border ${w._dirty ? "bg-primary/5" : ""}`}>
                    <td className="px-1 py-1">
                      <select className="h-8 w-40 text-xs rounded border border-input bg-background text-foreground px-1"
                        value={w.weapon_key} onChange={e => updateWeaponPref(w.id, "weapon_key", e.target.value)}>
                        {ALL_WEAPON_KEYS.map(k => <option key={k} value={k}>{WEAPON_DISPLAY[k]}</option>)}
                      </select>
                    </td>
                    <td className="px-1 py-1">
                      <select className="h-8 w-24 text-xs rounded border border-input bg-background text-foreground px-1"
                        value={w.hull_class} onChange={e => updateWeaponPref(w.id, "hull_class", e.target.value)}>
                        {ALL_HULL_CLASSES.map(h => <option key={h} value={h}>{h}</option>)}
                      </select>
                    </td>
                    <td className="px-1 py-1">
                      <Input className="h-8 w-20 text-xs" type="number" value={w.priority} onChange={e => updateWeaponPref(w.id, "priority", parseInt(e.target.value) || 0)} />
                    </td>
                    <td className="px-1 py-1">
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => deleteWeaponPref(w.id, w._new)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* GROUND COMBAT OUTCOMES */}
        <div className="mt-10">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-heading text-lg font-semibold text-foreground">Ground Combat Outcomes (casualties by force size)</h2>
            <Button size="sm" variant="outline" onClick={addGroundOutcome}><Plus className="mr-1 h-4 w-4" /> Add Outcome</Button>
          </div>
          <p className="text-xs text-muted-foreground mb-3">Define how many casualties a ground force inflicts based on its size. In phases with "System Defenses", a ground combat sub-phase runs after ship combat. Each side looks up their force size in this table to determine casualties inflicted on the opponent.</p>
          <div className="overflow-x-auto border border-border rounded">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground w-24">Min Force</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground w-24">Max Force</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground w-28">Casualties Inflicted</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Description</th>
                  <th className="px-3 py-2 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {groundOutcomes.map(o => (
                  <tr key={o.id} className={`border-b border-border ${o._dirty ? "bg-primary/5" : ""}`}>
                    <td className="px-1 py-1">
                      <Input className="h-8 w-24 text-xs" type="number" value={o.min_force} onChange={e => updateGroundOutcome(o.id, "min_force", parseInt(e.target.value) || 0)} />
                    </td>
                    <td className="px-1 py-1">
                      <Input className="h-8 w-24 text-xs" type="number" value={o.max_force} onChange={e => updateGroundOutcome(o.id, "max_force", parseInt(e.target.value) || 0)} />
                    </td>
                    <td className="px-1 py-1">
                      <Input className="h-8 w-28 text-xs" type="number" value={o.casualties_inflicted} onChange={e => updateGroundOutcome(o.id, "casualties_inflicted", parseInt(e.target.value) || 0)} />
                    </td>
                    <td className="px-1 py-1">
                      <Input className="h-8 text-xs" value={o.description} onChange={e => updateGroundOutcome(o.id, "description", e.target.value)} />
                    </td>
                    <td className="px-1 py-1">
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => deleteGroundOutcome(o.id, o._new)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default AdminBattleConfig;
