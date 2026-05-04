import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { eventsToJSON, eventsToCSV, eventsToTXT, BattleEvent } from "@/lib/battleEngine";
import AiOraclePanel from "@/components/admin/AiOraclePanel";

interface BattleRun {
  id: string;
  seed: string;
  created_at: string;
  fleet_a_snapshot_json: any;
  fleet_b_snapshot_json: any;
  result_json: any;
}

const AdminBattleDebug = () => {
  const { user, loading, isAdmin, isTester } = useAuth();
  const navigate = useNavigate();
  const [battles, setBattles] = useState<BattleRun[]>([]);
  const [selectedBattle, setSelectedBattle] = useState<BattleRun | null>(null);
  const [events, setEvents] = useState<BattleEvent[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<BattleEvent | null>(null);
  const [playerContext, setPlayerContext] = useState<"admin" | "playerA" | "playerB">("admin");
  const [filterPhase, setFilterPhase] = useState("");
  const [filterType, setFilterType] = useState("");

  useEffect(() => {
    if (!loading && (!user || (!isAdmin && !isTester))) navigate("/dashboard");
  }, [loading, user, isAdmin, navigate]);

  useEffect(() => {
    supabase.from("battle_runs").select("*").order("created_at", { ascending: false }).limit(50).then(({ data }) => {
      if (data) setBattles(data);
    });
  }, []);

  const loadBattle = async (battle: BattleRun) => {
    setSelectedBattle(battle);
    setSelectedEvent(null);
    const { data } = await supabase.from("battle_events").select("*").eq("battle_run_id", battle.id).order("seq");
    if (data) setEvents(data.map(d => ({
      seq: d.seq,
      tick: d.tick,
      event_type: d.event_type,
      payload_json: d.payload_json as Record<string, unknown>,
      public_summary_text: d.public_summary_text,
      admin_explain_text: d.admin_explain_text,
    })));
  };

  const redact = (event: BattleEvent): { summary: string; detail: string } => {
    if (playerContext === "admin") {
      return { summary: event.public_summary_text, detail: event.admin_explain_text };
    }
    // Player view: hide RNG rolls and exact hull values
    const detail = event.admin_explain_text
      .replace(/roll=[\d.]+/g, "roll=???")
      .replace(/Hull: \d+\/\d+/g, "Hull: ???/???");
    return { summary: event.public_summary_text, detail };
  };

  const filteredEvents = events.filter(e => {
    if (filterType && e.event_type !== filterType) return false;
    if (filterPhase && !(e.payload_json as any)?.phase?.includes(filterPhase)) return false;
    return true;
  });

  const eventTypes = [...new Set(events.map(e => e.event_type))];

  const download = (content: string, filename: string, type: string) => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) return <div className="min-h-screen bg-background"><Header /><div className="container py-20 text-center text-muted-foreground">Loading...</div><Footer /></div>;

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="container py-16">
        <h1 className="font-heading text-2xl font-bold text-foreground">Battle Debug (Admin)</h1>

        <div className="mt-6">
          <AiOraclePanel />
        </div>

        {!selectedBattle ? (
          <div className="mt-8 space-y-2">
            {battles.length === 0 && <p className="text-muted-foreground">No battles yet.</p>}
            {battles.map(b => (
              <button key={b.id} onClick={() => loadBattle(b)} className="block w-full border border-border p-3 text-left hover:border-primary">
                <p className="text-sm font-semibold text-accent">
                  {(b.fleet_a_snapshot_json as any)?.name} vs {(b.fleet_b_snapshot_json as any)?.name}
                </p>
                <p className="text-xs text-muted-foreground">Seed: {b.seed} · {new Date(b.created_at).toLocaleString()}</p>
              </button>
            ))}
          </div>
        ) : (
          <div className="mt-6">
            <Button variant="ghost" onClick={() => setSelectedBattle(null)}>← Back to battles</Button>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <div>
                <label className="text-xs text-muted-foreground">Player Context</label>
                <select className="ml-2 rounded border border-input bg-background p-1 text-sm text-foreground" value={playerContext} onChange={e => setPlayerContext(e.target.value as any)}>
                  <option value="admin">Admin (full)</option>
                  <option value="playerA">Player A (redacted)</option>
                  <option value="playerB">Player B (redacted)</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Event type</label>
                <select className="ml-2 rounded border border-input bg-background p-1 text-sm text-foreground" value={filterType} onChange={e => setFilterType(e.target.value)}>
                  <option value="">All</option>
                  {eventTypes.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => {
                  const j = JSON.stringify({ seed: selectedBattle.seed, fleetA: selectedBattle.fleet_a_snapshot_json, fleetB: selectedBattle.fleet_b_snapshot_json, events }, null, 2);
                  download(j, `debug-${selectedBattle.seed}.json`, "application/json");
                }}>JSON</Button>
                <Button size="sm" variant="outline" onClick={() => download(eventsToCSV(events), `debug-${selectedBattle.seed}.csv`, "text/csv")}>CSV</Button>
                <Button size="sm" variant="outline" onClick={() => download(eventsToTXT(events), `debug-${selectedBattle.seed}.txt`, "text/plain")}>TXT</Button>
              </div>
            </div>

            <div className="mt-6 grid gap-4 lg:grid-cols-2">
              {/* Timeline */}
              <div className="max-h-[600px] overflow-y-auto border border-border p-3">
                <h3 className="font-heading text-sm font-semibold text-accent mb-2">Timeline ({filteredEvents.length} events)</h3>
                <div className="space-y-1">
                  {filteredEvents.map(event => {
                    const { summary } = redact(event);
                    const isSelected = selectedEvent?.seq === event.seq;
                    return (
                      <button
                        key={event.seq}
                        onClick={() => setSelectedEvent(event)}
                        className={`block w-full text-left px-2 py-1 text-xs transition-colors ${
                          isSelected ? "bg-primary/20 text-foreground" : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        <span className="text-muted-foreground">[{event.seq}]</span> {summary}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Explain Panel */}
              <div className="border border-border p-4">
                {selectedEvent ? (() => {
                  const { summary, detail } = redact(selectedEvent);
                  return (
                    <>
                      <h3 className="font-heading text-sm font-semibold text-accent">What happened</h3>
                      <p className="mt-1 text-sm text-foreground">{summary}</p>
                      <h3 className="mt-4 font-heading text-sm font-semibold text-accent">Why it happened</h3>
                      <p className="mt-1 text-sm text-muted-foreground">{detail}</p>
                      <h3 className="mt-4 font-heading text-sm font-semibold text-accent">Raw Payload</h3>
                      <pre className="mt-1 max-h-48 overflow-auto rounded bg-muted p-2 text-xs text-foreground">
                        {JSON.stringify(selectedEvent.payload_json, null, 2)}
                      </pre>
                    </>
                  );
                })() : (
                  <p className="text-sm text-muted-foreground">Select an event from the timeline to see details.</p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
      <Footer />
    </div>
  );
};

export default AdminBattleDebug;
