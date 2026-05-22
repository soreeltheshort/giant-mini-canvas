import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Label } from "@/components/ui/label";

/**
 * Read-only inspector that shows what the deterministic AI did on a given
 * turn for a given AI player. In Phase 1 all tables are empty — every
 * section renders an explicit empty state so testers can confirm wiring
 * before later phases populate the data.
 */

interface Game {
  id: string;
  name: string;
  turn_number: number;
}
interface AIPlayer {
  id: string;
  player_slot: number;
  game_id: string;
}


export default function AIInspector() {
  const [games, setGames] = useState<Game[]>([]);
  const [players, setPlayers] = useState<AIPlayer[]>([]);
  const [gameId, setGameId] = useState<string>("");
  const [playerId, setPlayerId] = useState<string>("");
  const [turn, setTurn] = useState<number>(0);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("games")
        .select("id, name, turn_number")
        .order("updated_at", { ascending: false });
      setGames((data ?? []) as any);
    })();
  }, []);

  useEffect(() => {
    if (!gameId) {
      setPlayers([]);
      setPlayerId("");
      return;
    }
    (async () => {
      const { data } = await supabase
        .from("game_players")
        .select("id, player_slot, game_id, is_ai")
        .eq("game_id", gameId)
        .eq("is_ai", true);
      setPlayers(((data ?? []) as any[]) as any);
      const g = games.find((g) => g.id === gameId);
      if (g) setTurn(g.turn_number);
    })();

  }, [gameId, games]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div>
          <Label className="text-[10px] text-muted-foreground">Game</Label>
          <select
            value={gameId}
            onChange={(e) => setGameId(e.target.value)}
            className="h-9 w-full rounded border border-border bg-background px-2 text-sm"
          >
            <option value="">— pick game —</option>
            {games.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name} (turn {g.turn_number})
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label className="text-[10px] text-muted-foreground">AI player</Label>
          <select
            value={playerId}
            onChange={(e) => setPlayerId(e.target.value)}
            disabled={!gameId}
            className="h-9 w-full rounded border border-border bg-background px-2 text-sm"
          >
            <option value="">— pick player —</option>
            {players.map((p) => (
              <option key={p.id} value={p.id}>
                Slot {p.player_slot}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label className="text-[10px] text-muted-foreground">Turn</Label>
          <input
            type="number"
            value={turn}
            min={0}
            onChange={(e) => setTurn(Number(e.target.value))}
            className="h-9 w-full rounded border border-border bg-background px-2 text-sm font-mono"
          />
        </div>
      </div>

      {!gameId || !playerId ? (
        <p className="text-xs text-muted-foreground">Pick a game and AI player to inspect.</p>
      ) : (
        <div className="space-y-6">
          <InspectorSection
            title="Decision log"
            table="ai_decision_log"
            filter={{ game_id: gameId, player_id: playerId, turn_number: turn }}
            columns={["phase", "summary"]}
          />
          <InspectorSection
            title="Goals"
            table="ai_goals"
            filter={{ game_id: gameId, player_id: playerId }}
            columns={["goal_type", "priority", "status", "created_turn"]}
          />
          <InspectorSection
            title="Plans"
            table="ai_plans"
            filter={{ game_id: gameId, player_id: playerId }}
            columns={["status", "created_turn", "target_completion_turn", "rationale"]}
          />
          <InspectorSection
            title="World beliefs (latest)"
            table="ai_world_beliefs"
            filter={{ game_id: gameId, player_id: playerId }}
            columns={["belief_key", "confidence", "turn_number"]}
          />
          <InspectorSection
            title="Relationships"
            table="ai_relationships"
            filter={{ game_id: gameId, player_id: playerId }}
            columns={["target_player_id", "opinion", "trust", "fear", "last_interaction_turn"]}
          />
        </div>
      )}
    </div>
  );
}

function InspectorSection({
  title,
  table,
  filter,
  columns,
}: {
  title: string;
  table: string;
  filter: Record<string, any>;
  columns: string[];
}) {
  const [rows, setRows] = useState<any[] | null>(null);
  const filterKey = useMemo(() => JSON.stringify(filter), [filter]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let q = supabase.from(table as any).select("*").limit(200);
      for (const [k, v] of Object.entries(filter)) {
        if (v === "" || v === null || v === undefined) continue;
        q = (q as any).eq(k, v);
      }
      const { data, error } = await q;
      if (cancelled) return;
      if (error) {
        setRows([]);
        return;
      }
      setRows((data ?? []) as any[]);
    })();
    return () => {
      cancelled = true;
    };
  }, [table, filterKey]);

  return (
    <div className="rounded border border-border">
      <div className="border-b border-border bg-muted/40 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </div>
      {rows === null ? (
        <p className="p-3 text-xs text-muted-foreground">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="p-3 text-xs text-muted-foreground">No rows. (Empty until later phases ship.)</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/20">
                {columns.map((c) => (
                  <th key={c} className="px-2 py-1 text-left font-medium text-muted-foreground">{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.id ?? i} className="border-b border-border/50">
                  {columns.map((c) => (
                    <td key={c} className="px-2 py-1 align-top font-mono">
                      {formatCell(r[c])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function formatCell(v: any): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}
