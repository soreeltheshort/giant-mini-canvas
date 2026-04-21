/**
 * BattleReplay — read-only viewer for a saved battle (battle_runs + battle_events).
 *
 * Used by both:
 *   - Turn-log "View full combat log" links (in-game battles)
 *   - Direct deep links to /battle-replay/:runId
 *
 * Mirrors the result section of /battle (Battle Simulator) so admins/players
 * see identical information for any past engagement.
 */
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import {
  eventsToJSON,
  eventsToCSV,
  eventsToTXT,
  type BattleEvent,
  type BattleResult,
  type FleetSnapshot,
} from "@/lib/battleEngine";

interface BattleRunRow {
  id: string;
  seed: string;
  created_at: string;
  fleet_a_snapshot_json: any;
  fleet_b_snapshot_json: any;
  result_json: any;
}

const download = (content: string, filename: string, type: string) => {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

const BattleReplay = () => {
  const { runId } = useParams<{ runId: string }>();
  const navigate = useNavigate();
  const { isAdmin, isTester } = useAuth();
  const [run, setRun] = useState<BattleRunRow | null>(null);
  const [events, setEvents] = useState<BattleEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!runId) return;
      setLoading(true);
      const { data: runRow, error: runErr } = await supabase
        .from("battle_runs")
        .select("*")
        .eq("id", runId)
        .maybeSingle();
      if (cancelled) return;
      if (runErr || !runRow) {
        setError("Battle log not found.");
        setLoading(false);
        return;
      }
      const { data: evRows } = await supabase
        .from("battle_events")
        .select("*")
        .eq("battle_run_id", runId)
        .order("seq");
      if (cancelled) return;
      setRun(runRow as BattleRunRow);
      setEvents(
        (evRows || []).map(d => ({
          seq: d.seq,
          tick: d.tick,
          event_type: d.event_type,
          payload_json: d.payload_json as Record<string, unknown>,
          public_summary_text: d.public_summary_text,
          admin_explain_text: d.admin_explain_text,
        })),
      );
      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [runId]);

  const toggle = (seq: number) => {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(seq) ? next.delete(seq) : next.add(seq);
      return next;
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="container py-20 text-center text-muted-foreground">Loading battle log…</div>
        <Footer />
      </div>
    );
  }

  if (error || !run) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="container py-20 text-center text-muted-foreground">
          {error || "Battle log not found."}
          <div className="mt-4">
            <Button variant="ghost" onClick={() => navigate(-1)}>← Back</Button>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  const snapA = run.fleet_a_snapshot_json as FleetSnapshot;
  const snapB = run.fleet_b_snapshot_json as FleetSnapshot;
  const winner = (run.result_json as any)?.winner ?? "draw";
  const gameId = (run.result_json as any)?.game_id;
  const turnNumber = (run.result_json as any)?.turn_number;

  // Reconstruct per-ship instances from snapshots (matches battleEngine expandFleet
  // ordering: stable per-fleet counter, one row per individual hull). Then replay
  // damage events to derive final hull / crippled state.
  type ReplayShip = {
    instanceId: string;
    name: string;
    tacticalGroup: string;
    maxHull: number;
    currentHull: number;
    crippled: boolean;
    fleet: "A" | "B";
  };

  const buildInstances = (snap: FleetSnapshot | undefined, fleet: "A" | "B"): ReplayShip[] => {
    const out: ReplayShip[] = [];
    if (!snap?.ships) return out;
    let counter = 0;
    // battleEngine uses a single counter shared across both fleets, but instanceIds
    // are namespaced by `${fleet}-N` and the counter is incremented for both fleets
    // in sequence (A first, then B). We mirror that by starting B's counter where A left off.
    // We cannot know A's count here without computing it — so callers pass the right offset.
    for (const fs of snap.ships as any[]) {
      const qty = fs.quantity ?? 1;
      for (let i = 0; i < qty; i++) {
        out.push({
          instanceId: `${fleet}-${counter++}`,
          name: `${fs.ship_type?.name ?? "Ship"} #${i + 1}`,
          tacticalGroup: fs.tactical_group ?? "Core",
          maxHull: fs.ship_type?.hull ?? 0,
          currentHull: fs.ship_type?.hull ?? 0,
          crippled: false,
          fleet,
        });
      }
    }
    return out;
  };

  // Match battleEngine: idCounter is shared, A first then B.
  const shipsARaw = buildInstances(snapA, "A");
  const offsetB = shipsARaw.length;
  const shipsBRaw = buildInstances(snapB, "B").map((s, idx) => ({
    ...s,
    instanceId: `B-${offsetB + idx}`,
  }));

  const byId = new Map<string, ReplayShip>();
  [...shipsARaw, ...shipsBRaw].forEach(s => byId.set(s.instanceId, { ...s }));

  for (const ev of events) {
    if (ev.event_type !== "fire_hit") continue;
    const p = ev.payload_json as any;
    const tgt = byId.get(p?.target);
    if (!tgt) continue;
    const dmg = Number(p?.actualDmg ?? 0);
    tgt.currentHull = Math.max(0, tgt.currentHull - dmg);
    if (p?.crippled || tgt.currentHull <= 0) tgt.crippled = true;
  }

  const finalShipsA = shipsARaw.map(s => byId.get(s.instanceId)!);
  const finalShipsB = shipsBRaw.map(s => byId.get(s.instanceId)!);

  // Reconstruct a minimal BattleResult shape for export utilities.
  const fakeResult: BattleResult = {
    seed: run.seed,
    winner,
    events,
    finalState: { fleetA: finalShipsA as any, fleetB: finalShipsB as any },
  } as any;

  const showDebug = isAdmin || isTester;

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="container py-16">
        <Button variant="ghost" onClick={() => navigate(-1)} className="mb-4">← Back</Button>
        <h1 className="font-heading text-2xl font-bold text-foreground">Battle Log</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {snapA?.name} vs {snapB?.name}
          {turnNumber !== undefined && <> · Turn {turnNumber}</>}
          {" · "}Seed: {run.seed}
        </p>

        <div className="mt-6 border border-border p-4 rounded">
          <h2 className="font-heading text-lg font-bold text-foreground">
            {winner === "draw" ? "Draw" : `${winner === "A" ? "Attacker" : "Defender"} wins`}
          </h2>
          <p className="text-sm text-muted-foreground">
            {events.length} event(s) · Recorded {new Date(run.created_at).toLocaleString()}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => download(eventsToJSON(fakeResult, snapA, snapB), `battle-${run.seed}.json`, "application/json")}>JSON</Button>
            <Button size="sm" variant="outline" onClick={() => download(eventsToCSV(events), `battle-${run.seed}.csv`, "text/csv")}>CSV</Button>
            <Button size="sm" variant="outline" onClick={() => download(eventsToTXT(events), `battle-${run.seed}.txt`, "text/plain")}>TXT</Button>
            {gameId && (
              <Button size="sm" variant="outline" onClick={() => navigate(`/play/${gameId}`)}>
                Back to game
              </Button>
            )}
          </div>
        </div>

        {/* Per-ship final status reconstructed from snapshots + events */}
        <div className="mt-6 grid gap-6 md:grid-cols-2">
          {[
            { label: "Attacker", snap: snapA, ships: finalShipsA },
            { label: "Defender", snap: snapB, ships: finalShipsB },
          ].map(({ label, snap, ships }) => (
            <div key={label} className="border border-border rounded p-4">
              <h3 className="font-heading text-sm font-bold text-foreground mb-2">
                {label}: {snap?.name}
              </h3>
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

        <h3 className="mt-8 font-heading text-sm font-bold text-foreground">Event timeline</h3>
        <div className="mt-2 space-y-1">
          {events.map(event => (
            <div key={event.seq} className="border-l-2 border-border pl-3">
              <button
                onClick={() => toggle(event.seq)}
                className="w-full text-left text-sm text-foreground hover:text-primary"
              >
                <span className="text-xs text-muted-foreground">[{event.seq}]</span> {event.public_summary_text}
              </button>
              {(showDebug || expanded.has(event.seq)) && (
                <p className="mt-1 text-xs text-muted-foreground">{event.admin_explain_text}</p>
              )}
            </div>
          ))}
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default BattleReplay;
