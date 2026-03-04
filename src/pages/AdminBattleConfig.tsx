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

const ALL_GROUPS = ["Core", "Attack", "Special1", "Special2", "Rear", "Retreat"];

const AdminBattleConfig = () => {
  const { user, loading, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [phases, setPhases] = useState<Phase[]>([]);
  const [groupMods, setGroupMods] = useState<GroupMod[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!loading && (!user || !isAdmin)) navigate("/dashboard");
  }, [loading, user, isAdmin, navigate]);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    const [{ data: p }, { data: g }] = await Promise.all([
      supabase.from("battle_phases").select("*").order("seq_order"),
      supabase.from("group_modifiers").select("*").order("group_name"),
    ]);
    if (p) setPhases(p.map(r => ({ ...r, mod_a: Number(r.mod_a), mod_b: Number(r.mod_b) })));
    if (g) setGroupMods(g.map(r => ({ ...r, attack_mod: Number(r.attack_mod), defense_mod: Number(r.defense_mod) })));
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
      groups_a: [], groups_b: [], mod_a: 0, mod_b: 0, _dirty: true, _new: true,
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

  const saveAll = async () => {
    setSaving(true);
    let errors = 0;

    for (const p of phases.filter(p => p._dirty)) {
      const payload = { id: p.id, seq_order: p.seq_order, name: p.name, groups_a: p.groups_a, groups_b: p.groups_b, mod_a: p.mod_a, mod_b: p.mod_b };
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

    if (errors) toast({ title: "Some saves failed", description: `${errors} error(s)`, variant: "destructive" });
    else toast({ title: "Saved" });

    await loadData();
    setSaving(false);
  };

  const hasDirty = phases.some(p => p._dirty) || groupMods.some(g => g._dirty);

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
      </div>
      <Footer />
    </div>
  );
};

export default AdminBattleConfig;
