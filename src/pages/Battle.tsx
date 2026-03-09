import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { runBattle, eventsToJSON, eventsToCSV, eventsToTXT, FleetSnapshot, BattleResult, BattleEvent, PhaseConfig, GroupModConfig, CombatConstants, WeaponTargetPref } from "@/lib/battleEngine";

interface FleetOption {
  id: string;
  name: string;
  owner_user_id: string;
  capacityWarnings?: string[];
}

const Battle = () => {
  const { user, loading, isAdmin, isTester } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [fleets, setFleets] = useState<FleetOption[]>([]);
  const [fleetAId, setFleetAId] = useState("");
  const [fleetBId, setFleetBId] = useState("");
  const [seed, setSeed] = useState("");
  const [admiralA, setAdmiralA] = useState(4);
  const [admiralB, setAdmiralB] = useState(4);
  const [groundDefense, setGroundDefense] = useState(0);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<BattleResult | null>(null);
  const [fleetASnap, setFleetASnap] = useState<FleetSnapshot | null>(null);
  const [fleetBSnap, setFleetBSnap] = useState<FleetSnapshot | null>(null);
  const [expandedEvents, setExpandedEvents] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (!loading && !user) navigate("/login");
  }, [loading, user, navigate]);

  useEffect(() => {
    const loadFleets = async () => {
      const { data: fleetsData } = await supabase.from("fleets").select("id, name, owner_user_id");
      if (!fleetsData) return;

      // Load all fleet ships with ship types to check capacity
      const { data: allFleetShips } = await supabase
        .from("fleet_ships")
        .select("fleet_id, quantity, ship_type_id, ship_types(class, fighter_bay, gun_ship_link)")
        .in("fleet_id", fleetsData.map(f => f.id));

      const enriched: FleetOption[] = fleetsData.map(f => {
        const ships = allFleetShips?.filter(s => s.fleet_id === f.id) || [];
        const warnings: string[] = [];

        let fighterCap = 0, fighterUsed = 0, gunshipCap = 0, gunshipUsed = 0;
        for (const s of ships) {
          const st = s.ship_types as any;
          if (!st) continue;
          fighterCap += (st.fighter_bay || 0) * s.quantity;
          gunshipCap += (st.gun_ship_link || 0) * s.quantity;
          if (st.class === "FL") fighterUsed += 1 * s.quantity;
          if (st.class === "FH") fighterUsed += 2 * s.quantity;
          if (st.class === "GS") gunshipUsed += 1 * s.quantity;
        }

        if (fighterUsed > fighterCap) warnings.push(`Fighters: ${fighterUsed}/${fighterCap}`);
        if (gunshipUsed > gunshipCap) warnings.push(`Gunships: ${gunshipUsed}/${gunshipCap}`);

        return { ...f, capacityWarnings: warnings };
      });

      setFleets(enriched);
    };
    loadFleets();
  }, []);

  const loadFleetSnapshot = async (fleetId: string): Promise<FleetSnapshot | null> => {
    const { data: fleet } = await supabase.from("fleets").select("*").eq("id", fleetId).single();
    if (!fleet) return null;
    const { data: ships } = await supabase.from("fleet_ships").select("*, ship_types(*)").eq("fleet_id", fleetId);
    if (!ships) return null;
    return {
      id: fleet.id,
      name: fleet.name,
      readiness: fleet.readiness ?? 2,
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
    const [{ data: phasesData }, { data: modsData }, { data: constsData }, { data: weaponPrefsData }] = await Promise.all([
      supabase.from("battle_phases").select("*").order("seq_order"),
      supabase.from("group_modifiers").select("*"),
      supabase.from("combat_constants").select("*"),
      supabase.from("weapon_target_preferences").select("*").order("priority"),
    ]);
    const phases: PhaseConfig[] | undefined = phasesData?.map(p => ({
      name: p.name, groupsA: p.groups_a, groupsB: p.groups_b, modA: Number(p.mod_a), modB: Number(p.mod_b), requiredGroup: p.required_group ?? null,
    }));
    const groupMods: GroupModConfig[] | undefined = modsData?.map(g => ({
      group_name: g.group_name, attack_mod: Number(g.attack_mod), defense_mod: Number(g.defense_mod),
    }));
    const combatConsts: CombatConstants | undefined = constsData ? constsData.reduce((acc, row) => {
      (acc as any)[row.key] = Number(row.value);
      return acc;
    }, {} as CombatConstants) : undefined;
    const weaponPrefs: WeaponTargetPref[] | undefined = weaponPrefsData?.map(w => ({
      weapon_key: w.weapon_key, hull_class: w.hull_class, priority: w.priority,
    }));

    const usedSeed = seed || Math.random().toString(36).substring(2, 10);
    if (!seed) setSeed(usedSeed);

    const battleResult = runBattle(snapA, snapB, usedSeed, phases, groupMods, combatConsts, weaponPrefs, admiralA, admiralB);
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
              {fleets.map(f => <option key={f.id} value={f.id}>{f.name}{f.capacityWarnings?.length ? " ⚠️" : ""}</option>)}
            </select>
            {fleetAId && (() => {
              const f = fleets.find(fl => fl.id === fleetAId);
              return f?.capacityWarnings?.length ? (
                <div className="mt-1 text-xs text-yellow-500 font-medium">⚠️ {f.capacityWarnings.join(", ")}</div>
              ) : null;
            })()}
            <label className="mt-2 block text-xs text-muted-foreground">Admiral A Rating</label>
            <select className="mt-1 w-full rounded border border-input bg-background p-2 text-sm text-foreground" value={admiralA} onChange={e => setAdmiralA(Number(e.target.value))}>
              {Array.from({ length: 11 }, (_, i) => <option key={i} value={i}>{i}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Fleet B</label>
            <select className="mt-1 w-full rounded border border-input bg-background p-2 text-sm text-foreground" value={fleetBId} onChange={e => setFleetBId(e.target.value)}>
              <option value="">Select fleet...</option>
              {fleets.map(f => <option key={f.id} value={f.id}>{f.name}{f.capacityWarnings?.length ? " ⚠️" : ""}</option>)}
            </select>
            {fleetBId && (() => {
              const f = fleets.find(fl => fl.id === fleetBId);
              return f?.capacityWarnings?.length ? (
                <div className="mt-1 text-xs text-yellow-500 font-medium">⚠️ {f.capacityWarnings.join(", ")}</div>
              ) : null;
            })()}
            <label className="mt-2 block text-xs text-muted-foreground">Admiral B Rating</label>
            <select className="mt-1 w-full rounded border border-input bg-background p-2 text-sm text-foreground" value={admiralB} onChange={e => setAdmiralB(Number(e.target.value))}>
              {Array.from({ length: 11 }, (_, i) => <option key={i} value={i}>{i}</option>)}
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

            {/* Final ship status */}
            <div className="mt-6 grid gap-6 md:grid-cols-2">
              {[
                { label: "Fleet A", ships: result.finalState.fleetA, snap: fleetASnap },
                { label: "Fleet B", ships: result.finalState.fleetB, snap: fleetBSnap },
              ].map(({ label, ships, snap }) => (
                <div key={label} className="border border-border rounded p-4">
                  <h3 className="font-heading text-sm font-bold text-foreground mb-2">{label}: {snap?.name}</h3>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="py-1 text-left text-muted-foreground">Ship</th>
                        <th className="py-1 text-left text-muted-foreground">Group</th>
                        <th className="py-1 text-right text-muted-foreground">Hull</th>
                        <th className="py-1 text-left pl-2 text-muted-foreground">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ships.map(s => {
                        const status = s.crippled
                          ? "Destroyed"
                          : s.currentHull <= s.maxHull / 2
                          ? "Crippled"
                          : "Operational";
                        const statusColor = status === "Destroyed"
                          ? "text-destructive"
                          : status === "Crippled"
                          ? "text-yellow-500"
                          : "text-green-500";
                        return (
                          <tr key={s.instanceId} className="border-b border-border/50">
                            <td className="py-1 text-foreground">{s.name}</td>
                            <td className="py-1 text-muted-foreground">{s.tacticalGroup}</td>
                            <td className="py-1 text-right text-foreground">{s.currentHull}/{s.maxHull}</td>
                            <td className={`py-1 pl-2 font-medium ${statusColor}`}>{status}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>

            <div className="mt-4 space-y-1">
              {result.events.map(event => {
                const showDebug = isAdmin || isTester;
                return (
                  <div key={event.seq} className="border-l-2 border-border pl-3">
                    <button onClick={() => toggleEvent(event.seq)} className="w-full text-left text-sm text-foreground hover:text-primary">
                      <span className="text-xs text-muted-foreground">[{event.seq}]</span> {event.public_summary_text}
                    </button>
                    {showDebug ? (
                      <p className="mt-1 text-xs text-muted-foreground">{event.admin_explain_text}</p>
                    ) : expandedEvents.has(event.seq) ? (
                      <p className="mt-1 text-xs text-muted-foreground">{event.admin_explain_text}</p>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
      <Footer />
    </div>
  );
};

export default Battle;
