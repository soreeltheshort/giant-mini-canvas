/**
 * TurnLogViewer
 *
 * Shared component used by:
 *   - Admin games panel (full read/write context)
 *   - Player game shell (read-only personal view)
 *
 * Groups logs by turn → phase. Phases come from the new `phase` column on
 * game_logs (Economy, Movement, Visibility, Combat, summary). Legacy logs
 * with empty phase are bucketed into "Other".
 */
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronRight, ExternalLink } from "lucide-react";

interface LogRow {
  id: string;
  turn_number: number;
  phase: string;
  log_type: string;
  message: string;
  created_at: string;
  details_json: any;
}

interface Props {
  gameId: string;
  /** Show details_json under each entry (admin only). */
  showDetails?: boolean;
  /** Limit number of recent turns shown. */
  recentTurnsLimit?: number;
  /** Bump this value to force a reload (e.g. after running a turn). */
  refreshKey?: number;
}

const PHASE_LABELS: Record<string, string> = {
  summary: "Summary",
  economy: "Economy",
  movement: "Movement",
  visibility: "Visibility",
  combat: "Combat",
  "": "Other",
};

const PHASE_ORDER = ["summary", "economy", "movement", "visibility", "combat", ""];

export default function TurnLogViewer({ gameId, showDetails = false, recentTurnsLimit = 5, refreshKey = 0 }: Props) {
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [openTurns, setOpenTurns] = useState<Set<number>>(new Set());

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const { data } = await (supabase as any)
        .from("game_logs")
        .select("id, turn_number, phase, log_type, message, created_at, details_json")
        .eq("game_id", gameId)
        .order("turn_number", { ascending: false })
        .order("created_at", { ascending: true })
        .limit(500);
      if (cancelled) return;
      setLogs(data || []);
      // Auto-open the most recent turn
      if (data && data.length > 0) {
        const maxTurn = Math.max(...data.map((l: LogRow) => l.turn_number));
        setOpenTurns(new Set([maxTurn]));
      }
      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [gameId, refreshKey]);

  const grouped = useMemo(() => {
    const byTurn = new Map<number, Map<string, LogRow[]>>();
    for (const l of logs) {
      const phase = l.phase || "";
      if (!byTurn.has(l.turn_number)) byTurn.set(l.turn_number, new Map());
      const phaseMap = byTurn.get(l.turn_number)!;
      if (!phaseMap.has(phase)) phaseMap.set(phase, []);
      phaseMap.get(phase)!.push(l);
    }
    const turns = Array.from(byTurn.keys()).sort((a, b) => b - a).slice(0, recentTurnsLimit);
    return turns.map(t => ({
      turn: t,
      phases: PHASE_ORDER
        .map(p => ({ phase: p, label: PHASE_LABELS[p] || p, entries: byTurn.get(t)?.get(p) || [] }))
        .filter(g => g.entries.length > 0),
    }));
  }, [logs, recentTurnsLimit]);

  const toggle = (turn: number) => {
    setOpenTurns(prev => {
      const next = new Set(prev);
      if (next.has(turn)) next.delete(turn); else next.add(turn);
      return next;
    });
  };

  if (loading) return <p className="text-sm text-muted-foreground italic">Loading turn log…</p>;
  if (grouped.length === 0) return <p className="text-sm text-muted-foreground italic">No turn log entries yet.</p>;

  return (
    <div className="space-y-3">
      {grouped.map(({ turn, phases }) => {
        const open = openTurns.has(turn);
        const total = phases.reduce((s, p) => s + p.entries.length, 0);
        return (
          <div key={turn} className="border border-border rounded-md">
            <button
              onClick={() => toggle(turn)}
              className="w-full flex items-center justify-between px-3 py-2 hover:bg-accent/30 transition-colors"
            >
              <div className="flex items-center gap-2">
                {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                <span className="font-heading font-semibold text-sm">Turn {turn}</span>
                <Badge variant="outline" className="text-[10px]">{total} entries</Badge>
              </div>
              <span className="text-xs text-muted-foreground">{phases.map(p => p.label).join(" · ")}</span>
            </button>
            {open && (
              <div className="border-t border-border divide-y divide-border">
                {phases.map(({ phase, label, entries }) => (
                  <div key={phase} className="px-3 py-2">
                    <div className="flex items-center gap-2 mb-1.5">
                      <Badge className="text-[10px]">{label}</Badge>
                      <span className="text-[10px] text-muted-foreground">{entries.length} entries</span>
                    </div>
                    <ul className="space-y-1 text-xs">
                      {entries.map(e => {
                        const battleRunId = e.details_json?.battle_run_id as string | undefined;
                        return (
                          <li key={e.id} className="flex gap-2 flex-wrap">
                            <span className="text-muted-foreground shrink-0 font-mono text-[10px]">
                              {new Date(e.created_at).toLocaleTimeString()}
                            </span>
                            <span className="text-foreground">{e.message}</span>
                            {battleRunId && (
                              <Link
                                to={`/battle-replay/${battleRunId}`}
                                className="inline-flex items-center gap-0.5 text-[10px] text-bronze-dark hover:text-primary underline"
                              >
                                view full combat log <ExternalLink className="w-2.5 h-2.5" />
                              </Link>
                            )}
                            {showDetails && e.details_json && Object.keys(e.details_json).length > 0 && (
                              <details className="ml-1">
                                <summary className="cursor-pointer text-[10px] text-bronze-dark">json</summary>
                                <pre className="text-[10px] bg-muted/50 p-2 rounded mt-1 overflow-x-auto">
                                  {JSON.stringify(e.details_json, null, 2)}
                                </pre>
                              </details>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
