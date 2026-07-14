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

interface BattleDetails {
  battle_run_id?: string;
  seed?: string;
  attacker_name?: string;
  target_name?: string;
  winner?: string;
  attacker_survivors?: number;
  target_survivors?: number;
  attacker_wiped?: boolean;
  target_wiped?: boolean;
  attacker_losses?: Record<string, number>;
  target_losses?: Record<string, number>;
}

const PHASE_LABELS: Record<string, string> = {
  summary: "Summary",
  economy: "Economy",
  movement: "Movement",
  visibility: "Visibility",
  combat: "Combat",
  ground_combat: "Ground Combat",
  "": "Other",
};

const PHASE_ORDER = ["summary", "economy", "movement", "visibility", "combat", "ground_combat", ""];

const isObjectRecord = (value: unknown): value is Record<string, any> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isBattleDetails = (log: LogRow): log is LogRow & { details_json: BattleDetails } =>
  log.log_type === "battle_resolved" && isObjectRecord(log.details_json);

const prettifyLossKey = (key: string) => {
  const suffix = key.includes(":") ? key.split(":").slice(1).join(":") : key;
  return suffix.replace(/_/g, " ");
};

const renderLossSummary = (losses?: Record<string, number>) => {
  if (!losses || Object.keys(losses).length === 0) {
    return <span className="text-muted-foreground">None</span>;
  }

  return (
    <ul className="space-y-1">
      {Object.entries(losses).map(([key, value]) => (
        <li key={key} className="flex items-center justify-between gap-3">
          <span className="text-muted-foreground">{prettifyLossKey(key)}</span>
          <span className="font-medium text-foreground">{value}</span>
        </li>
      ))}
    </ul>
  );
};

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
                    <ul className="space-y-2 text-xs">
                      {entries.map(e => {
                        const battleRunId = e.details_json?.battle_run_id as string | undefined;
                        const hasDetails = showDetails && isObjectRecord(e.details_json) && Object.keys(e.details_json).length > 0;
                        const hasBattleDetails = hasDetails && isBattleDetails(e);

                        return (
                          <li key={e.id} className="space-y-1.5 rounded-sm">
                            <div className="flex gap-2 flex-wrap items-start">
                              <span className="text-muted-foreground shrink-0 font-mono text-[10px]">
                                {new Date(e.created_at).toLocaleTimeString()}
                              </span>
                              <span className="text-foreground">{e.message}</span>
                              {battleRunId && (
                                <Link
                                  to={`/battle-replay/${battleRunId}`}
                                  className="inline-flex items-center gap-0.5 text-[10px] text-primary hover:text-primary/80 underline"
                                >
                                  view full combat log <ExternalLink className="w-2.5 h-2.5" />
                                </Link>
                              )}
                            </div>

                            {hasBattleDetails && (
                              <details className="ml-6 rounded border border-border bg-muted/20" open>
                                <summary className="cursor-pointer px-2 py-1 text-[10px] font-medium uppercase tracking-[0.12em] text-foreground">
                                  Battle details
                                </summary>
                                <div className="space-y-3 border-t border-border px-3 py-2">
                                  <div className="grid gap-2 md:grid-cols-2">
                                    <div className="space-y-1">
                                      <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Outcome</p>
                                      <p className="text-foreground">
                                        Winner: <span className="font-medium">{e.details_json.winner === "draw" ? "Draw" : e.details_json.winner === "A" ? "Attacker" : e.details_json.winner === "B" ? "Defender" : "Unknown"}</span>
                                      </p>
                                      <p className="text-foreground">Attacker: {e.details_json.attacker_name ?? "Unknown"}</p>
                                      <p className="text-foreground">Defender: {e.details_json.target_name ?? "Unknown"}</p>
                                      <p className="text-foreground">Attacker survivors: {e.details_json.attacker_survivors ?? "—"}</p>
                                      <p className="text-foreground">Defender survivors: {e.details_json.target_survivors ?? "—"}</p>
                                    </div>
                                    <div className="space-y-1">
                                      <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Fleet status</p>
                                      <p className="text-foreground">Attacker destroyed: {e.details_json.attacker_wiped ? "Yes" : "No"}</p>
                                      <p className="text-foreground">Defender destroyed: {e.details_json.target_wiped ? "Yes" : "No"}</p>
                                      {e.details_json.seed && (
                                        <p className="break-all text-muted-foreground">
                                          Seed: <span className="font-mono text-[10px]">{e.details_json.seed}</span>
                                        </p>
                                      )}
                                      {!battleRunId && (
                                        <p className="text-muted-foreground">
                                          Full replay unavailable for this older battle log.
                                        </p>
                                      )}
                                    </div>
                                  </div>

                                  <div className="grid gap-3 md:grid-cols-2">
                                    <div>
                                      <p className="mb-1 text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Attacker losses</p>
                                      {renderLossSummary(e.details_json.attacker_losses)}
                                    </div>
                                    <div>
                                      <p className="mb-1 text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Defender losses</p>
                                      {renderLossSummary(e.details_json.target_losses)}
                                    </div>
                                  </div>
                                </div>
                              </details>
                            )}

                            {!hasBattleDetails && hasDetails && Array.isArray(e.details_json?.debug_lines) && (
                              <details className="ml-6 rounded border border-border bg-muted/20" open>
                                <summary className="cursor-pointer px-2 py-1 text-[10px] font-medium uppercase tracking-[0.12em] text-foreground">
                                  Ground combat transcript
                                </summary>
                                <pre className="overflow-x-auto border-t border-border px-3 py-2 font-mono text-[10px] leading-relaxed text-foreground whitespace-pre">
{(e.details_json.debug_lines as string[]).join("\n")}
                                </pre>
                                <details className="border-t border-border">
                                  <summary className="cursor-pointer px-2 py-1 text-[10px] text-muted-foreground">raw payload</summary>
                                  <pre className="mt-1 overflow-x-auto rounded bg-muted/50 p-2 text-[10px] text-foreground">
                                    {JSON.stringify(e.details_json, null, 2)}
                                  </pre>
                                </details>
                              </details>
                            )}

                            {!hasBattleDetails && hasDetails && !Array.isArray(e.details_json?.debug_lines) && (
                              <details className="ml-6">
                                <summary className="cursor-pointer text-[10px] text-foreground">details</summary>
                                <pre className="mt-1 overflow-x-auto rounded bg-muted/50 p-2 text-[10px] text-foreground">
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
