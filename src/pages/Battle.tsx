import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { runBattle, eventsToJSON, eventsToCSV, eventsToTXT, FleetSnapshot, BattleResult, BattleEvent, PhaseConfig, GroupModConfig } from "@/lib/battleEngine";

interface FleetOption {
  id: string;
  name: string;
  owner_user_id: string;
  points_budget: number;
}

const Battle = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [fleets, setFleets] = useState<FleetOption[]>([]);
  const [fleetAId, setFleetAId] = useState("");
  const [fleetBId, setFleetBId] = useState("");
  const [seed, setSeed] = useState("");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<BattleResult | null>(null);
  const [fleetASnap, setFleetASnap] = useState<FleetSnapshot | null>(null);
  const [fleetBSnap, setFleetBSnap] = useState<FleetSnapshot | null>(null);
  const [expandedEvents, setExpandedEvents] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (!loading && !user) navigate("/login");
  }, [loading, user, navigate]);

  useEffect(() => {
    supabase.from("fleets").select("id, name, owner_user_id, points_budget").then(({ data }) => {
      if (data) setFleets(data);
    });
  }, []);

  const loadFleetSnapshot = async (fleetId: string): Promise<FleetSnapshot | null> => {
    const { data: fleet } = await supabase.from("fleets").select("*").eq("id", fleetId).single();
    if (!fleet) return null;
    const { data: ships } = await supabase.from("fleet_ships").select("*, ship_types(*)").eq("fleet_id", fleetId);
    if (!ships) return null;
    return {
      id: fleet.id,
      name: fleet.name,
      points_budget: fleet.points_budget,
      ships: ships.map((s: any) => ({
        ship_type: s.ship_types,
        quantity: s.quantity,
        tactical_group: s.tactical_group,
      })),
    };
  };

  const runSim = async () => {
    if (!fleetAId || !fleetBId) { toast({ title: "Select both fleets", variant: "destructive" }); return; }
    setRunning(true);
    const snapA = await loadFleetSnapshot(fleetAId);
    const snapB = await loadFleetSnapshot(fleetBId);
    if (!snapA || !snapB) { toast({ title: "Failed to load fleets", variant: "destructive" }); setRunning(false); return; }

    // Load battle config from DB
    const [{ data: phasesData }, { data: modsData }] = await Promise.all([
      supabase.from("battle_phases").select("*").order("seq_order"),
      supabase.from("group_modifiers").select("*"),
    ]);
    const phases: PhaseConfig[] | undefined = phasesData?.map(p => ({
      name: p.name, groupsA: p.groups_a, groupsB: p.groups_b, modA: Number(p.mod_a), modB: Number(p.mod_b),
    }));
    const groupMods: GroupModConfig[] | undefined = modsData?.map(g => ({
      group_name: g.group_name, attack_mod: Number(g.attack_mod), defense_mod: Number(g.defense_mod),
    }));

    const usedSeed = seed || Math.random().toString(36).substring(2, 10);
    if (!seed) setSeed(usedSeed);

    const battleResult = runBattle(snapA, snapB, usedSeed, phases, groupMods);
    setFleetASnap(snapA);
    setFleetBSnap(snapB);
    setResult(battleResult);

    // Save to DB
    const { data: battleRun } = await supabase.from("battle_runs").insert({
      fleet_a_snapshot_json: snapA as any,
      fleet_b_snapshot_json: snapB as any,
      seed: usedSeed,
      result_json: { winner: battleResult.winner } as any,
      created_by_user_id: user!.id,
    }).select().single();

    if (battleRun) {
      const eventRows = battleResult.events.map(e => ({
        battle_run_id: battleRun.id,
        seq: e.seq,
        tick: e.tick,
        event_type: e.event_type,
        payload_json: e.payload_json as any,
        public_summary_text: e.public_summary_text,
        admin_explain_text: e.admin_explain_text,
      }));
      await supabase.from("battle_events").insert(eventRows);
    }

    setRunning(false);
  };

  const download = (content: string, filename: string, type: string) => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const toggleEvent = (seq: number) => {
    setExpandedEvents(prev => {
      const next = new Set(prev);
      next.has(seq) ? next.delete(seq) : next.add(seq);
      return next;
    });
  };

  if (loading) return <div className="min-h-screen bg-background"><Header /><div className="container py-20 text-center text-muted-foreground">Loading...</div><Footer /></div>;

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="container py-16">
        <Button variant="ghost" onClick={() => navigate("/dashboard")} className="mb-4">← Back</Button>
        <h1 className="font-heading text-2xl font-bold text-foreground">Battle Simulator</h1>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <div>
            <label className="text-xs text-muted-foreground">Fleet A</label>
            <select className="mt-1 w-full rounded border border-input bg-background p-2 text-sm text-foreground" value={fleetAId} onChange={e => setFleetAId(e.target.value)}>
              <option value="">Select fleet...</option>
              {fleets.map(f => <option key={f.id} value={f.id}>{f.name} ({f.points_budget}pts)</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Fleet B</label>
            <select className="mt-1 w-full rounded border border-input bg-background p-2 text-sm text-foreground" value={fleetBId} onChange={e => setFleetBId(e.target.value)}>
              <option value="">Select fleet...</option>
              {fleets.map(f => <option key={f.id} value={f.id}>{f.name} ({f.points_budget}pts)</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Seed (optional)</label>
            <Input className="mt-1" placeholder="Random if empty" value={seed} onChange={e => setSeed(e.target.value)} />
          </div>
        </div>

        <Button className="mt-4" onClick={runSim} disabled={running}>
          {running ? "Running..." : "Run Battle"}
        </Button>

        {result && (
          <div className="mt-8">
            <div className="border border-border p-4">
              <h2 className="font-heading text-lg font-bold text-foreground">
                {result.winner === "draw" ? "Draw!" : `Fleet ${result.winner} Wins!`}
              </h2>
              <p className="text-sm text-muted-foreground">Seed: {result.seed} · {result.events.length} events</p>
              <div className="mt-3 flex gap-2">
                <Button size="sm" variant="outline" onClick={() => download(eventsToJSON(result, fleetASnap!, fleetBSnap!), `battle-${result.seed}.json`, "application/json")}>JSON</Button>
                <Button size="sm" variant="outline" onClick={() => download(eventsToCSV(result.events), `battle-${result.seed}.csv`, "text/csv")}>CSV</Button>
                <Button size="sm" variant="outline" onClick={() => download(eventsToTXT(result.events), `battle-${result.seed}.txt`, "text/plain")}>TXT</Button>
              </div>
            </div>

            <div className="mt-4 space-y-1">
              {result.events.map(event => (
                <div key={event.seq} className="border-l-2 border-border pl-3">
                  <button onClick={() => toggleEvent(event.seq)} className="w-full text-left text-sm text-foreground hover:text-primary">
                    <span className="text-xs text-muted-foreground">[{event.seq}]</span> {event.public_summary_text}
                  </button>
                  {expandedEvents.has(event.seq) && (
                    <p className="mt-1 text-xs text-muted-foreground">{event.admin_explain_text}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      <Footer />
    </div>
  );
};

export default Battle;
