import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { seedFactionPlayers } from "@/lib/gameLifecycle";

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
  is_test_mode: boolean;
  enable_ai_slates?: boolean;
}

interface PlayerRow {
  id: string;
  player_slot: number | null;
  game_id: string;
  is_ai: boolean;
  user_id: string | null;
  faction_id: string | null;
  faction_name: string | null;
  faction_code_name: string | null;
  has_ai_persona: boolean;
}

const PROVINCE_NAMES: Record<number, string> = {
  1: "Valerian", 2: "Aurelian", 3: "Cassian",
  4: "Dravian", 5: "Marcellan", 6: "Octavian",
};

function labelForPlayer(p: PlayerRow): string {
  const fname = p.faction_code_name || p.faction_name || (p.player_slot != null ? PROVINCE_NAMES[p.player_slot] : null) || "(unassigned)";
  const tag = p.is_ai ? "AI" : p.user_id ? "Player" : "Neutral";
  const slot = p.player_slot != null ? ` · slot ${p.player_slot}` : "";
  return `${fname} — ${tag}${slot}`;
}

export default function AIInspector() {
  const [games, setGames] = useState<Game[]>([]);
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [gameId, setGameId] = useState<string>("");
  const [playerId, setPlayerId] = useState<string>("");
  const [turn, setTurn] = useState<number>(0);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("games")
        .select("id, name, turn_number, is_test_mode, enable_ai_slates")
        .order("updated_at", { ascending: false });
      setGames((data ?? []) as any);
    })();
  }, []);

  const currentGame = games.find((g) => g.id === gameId);
  const isTestMode = !!currentGame?.is_test_mode;


  useEffect(() => {
    if (!gameId) {
      setPlayers([]);
      setPlayerId("");
      return;
    }
    (async () => {
      const { data } = await supabase
        .from("game_factions")
        .select("id, player_slot, game_id, is_ai, user_id, faction_id, factions:faction_id(name, code_name, ai_persona_id)")
        .eq("game_id", gameId);
      const rows: PlayerRow[] = ((data ?? []) as any[]).map((r) => ({
        id: r.id,
        player_slot: r.player_slot,
        game_id: r.game_id,
        is_ai: r.is_ai,
        user_id: r.user_id,
        faction_id: r.faction_id,
        faction_name: r.factions?.name ?? null,
        faction_code_name: r.factions?.code_name ?? null,
        has_ai_persona: !!r.factions?.ai_persona_id,
      }));
      // Sort: factions with AI persona first, then other player factions, then neutrals.
      rows.sort((a, b) => {
        const ra = a.has_ai_persona ? 0 : a.user_id ? 1 : 2;
        const rb = b.has_ai_persona ? 0 : b.user_id ? 1 : 2;
        if (ra !== rb) return ra - rb;
        return labelForPlayer(a).localeCompare(labelForPlayer(b));
      });
      setPlayers(rows);
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
          <Label className="text-[10px] text-muted-foreground">Faction</Label>
          <select
            value={playerId}
            onChange={(e) => setPlayerId(e.target.value)}
            disabled={!gameId}
            className="h-9 w-full rounded border border-border bg-background px-2 text-sm"
          >
            <option value="">— pick faction —</option>
            {players.map((p) => (
              <option key={p.id} value={p.id}>
                {labelForPlayer(p)}
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
            disabled={!isTestMode && !!gameId}
            onChange={(e) => setTurn(Number(e.target.value))}
            className="h-9 w-full rounded border border-border bg-background px-2 text-sm font-mono disabled:opacity-60"
          />
        </div>
      </div>

      {gameId && (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3 rounded border border-border/60 bg-muted/30 px-3 py-2">
            <div className="text-xs">
              <span className="font-semibold">Test mode:</span>{" "}
              {isTestMode
                ? "ON — AI beliefs are recorded for every processed turn. You can scrub the Turn field to inspect history."
                : "OFF — only the current/most-recent AI belief snapshot is retained. Turn selector is locked."}
            </div>
            <Button
              size="sm"
              variant={isTestMode ? "secondary" : "outline"}
              onClick={async () => {
                const next = !isTestMode;
                const { error } = await supabase.from("games").update({ is_test_mode: next } as any).eq("id", gameId);
                if (error) { toast.error(error.message); return; }
                setGames((gs) => gs.map((g) => g.id === gameId ? { ...g, is_test_mode: next } : g));
                toast.success(`Test mode ${next ? "enabled" : "disabled"}`);
              }}
            >
              {isTestMode ? "Disable test mode" : "Enable test mode"}
            </Button>
          </div>
          <div className="flex items-center justify-between gap-3 rounded border border-border/60 bg-muted/30 px-3 py-2 text-xs">
            <div>
              <span className="font-semibold">AI engine (slates / plans / actions):</span>{" "}
              {currentGame?.enable_ai_slates
                ? "ON — every processed turn recomputes goal slates, binds plans and executes AI actions."
                : "OFF — all AI phases skip this game and log an ai_skip entry."}
            </div>
            <Button
              size="sm"
              variant={currentGame?.enable_ai_slates ? "secondary" : "outline"}
              onClick={async () => {
                const next = !currentGame?.enable_ai_slates;
                const { error } = await supabase.from("games").update({ enable_ai_slates: next } as any).eq("id", gameId);
                if (error) { toast.error(error.message); return; }
                setGames((gs) => gs.map((g) => g.id === gameId ? { ...g, enable_ai_slates: next } : g));
                toast.success(`AI engine ${next ? "enabled" : "disabled"}`);
              }}
            >
              {currentGame?.enable_ai_slates ? "Disable AI" : "Enable AI"}
            </Button>
          </div>

        </div>
      )}


      {gameId && players.filter((p) => p.has_ai_persona).length === 0 && (
        <div className="rounded border border-dashed border-border p-3 text-xs text-muted-foreground flex items-center justify-between gap-3">
          <span>No AI faction rows for this game. Click to insert one for every faction in Map Testing Config that has an AI persona assigned.</span>
          <Button size="sm" variant="outline" onClick={async () => {
            try {
              const { data: g } = await supabase.from("games").select("map_data_json").eq("id", gameId).single();
              if (!g?.map_data_json) { toast.error("Game has no map"); return; }
              const { deserializeMapState } = await import("@/lib/gameLifecycle");
              const ms = deserializeMapState(g.map_data_json as any);
              const r = await seedFactionPlayers(supabase as any, gameId, ms);
              toast.success(`Seeded — inserted ${r.inserted}, back-filled ${r.backfilled}, skipped ${r.skipped}`);
              // refresh players
              setGameId((id) => id);
              const { data } = await supabase
                .from("game_factions")
                .select("id, player_slot, game_id, is_ai, user_id, faction_id, factions:faction_id(name, code_name, ai_persona_id)")
                .eq("game_id", gameId);
              const rows: PlayerRow[] = ((data ?? []) as any[]).map((r) => ({
                id: r.id, player_slot: r.player_slot, game_id: r.game_id, is_ai: r.is_ai, user_id: r.user_id,
                faction_id: r.faction_id, faction_name: r.factions?.name ?? null,
                faction_code_name: r.factions?.code_name ?? null, has_ai_persona: !!r.factions?.ai_persona_id,
              }));
              rows.sort((a, b) => {
                const ra = a.has_ai_persona ? 0 : a.user_id ? 1 : 2;
                const rb = b.has_ai_persona ? 0 : b.user_id ? 1 : 2;
                return ra !== rb ? ra - rb : labelForPlayer(a).localeCompare(labelForPlayer(b));
              });
              setPlayers(rows);
            } catch (e: any) {
              toast.error(e?.message ?? "Seed failed");
            }
          }}>Seed faction players</Button>
        </div>
      )}

      {!gameId || !playerId ? (
        <p className="text-xs text-muted-foreground">Pick a game and faction to inspect.</p>
      ) : (
        <div className="space-y-6">
          <ThreatAssessmentSection gameId={gameId} playerId={playerId} turn={turn} isTestMode={isTestMode} />
          <GoalSlateSection gameId={gameId} playerId={playerId} turn={turn} onTurnChange={setTurn} />
          <BoundPlansSection gameId={gameId} playerId={playerId} />

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
            title="Relationships (this faction's view of others)"
            table="ai_relationships"
            filter={{ game_id: gameId, player_id: playerId }}
            columns={["target_player_id", "derived_class", "class_source", "opinion", "trust", "fear", "class_updated_turn"]}
          />
          <PersonaFollowthroughSection playerId={playerId} />
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

function PersonaFollowthroughSection({ playerId }: { playerId: string }) {
  const [rows, setRows] = useState<any[] | null>(null);
  const [personaName, setPersonaName] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setRows(null);
      setPersonaName("");
      const { data: pf } = await supabase
        .from("game_factions")
        .select("ai_persona_id, factions:faction_id(ai_persona_id)")
        .eq("id", playerId)
        .maybeSingle();
      const personaId = ((pf as any)?.ai_persona_id || (pf as any)?.factions?.ai_persona_id) as string | undefined;
      if (cancelled) return;
      if (!personaId) { setRows([]); return; }
      const { data: persona } = await supabase
        .from("ai_personas")
        .select("name")
        .eq("id", personaId)
        .maybeSingle();
      if (cancelled) return;
      setPersonaName(((persona as any)?.name as string | undefined) ?? "");
      const { data } = await supabase
        .from("ai_persona_followthrough" as any)
        .select("step_order, activity_code, enabled, params_json")
        .eq("persona_id", personaId)
        .order("step_order");
      if (!cancelled) setRows((data as any[]) ?? []);
    })();
    return () => { cancelled = true; };
  }, [playerId]);

  return (
    <div className="rounded border border-border">
      <div className="border-b border-border bg-muted/40 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center justify-between">
        <span>Persona follow-through queue</span>
        {personaName && <span className="font-mono normal-case tracking-normal text-[10px]">{personaName}</span>}
      </div>
      {rows === null ? (
        <p className="p-3 text-xs text-muted-foreground">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="p-3 text-xs text-muted-foreground">No follow-through queue defined for this faction's persona.</p>
      ) : (
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border bg-muted/20">
              <th className="px-2 py-1 text-left font-medium text-muted-foreground">#</th>
              <th className="px-2 py-1 text-left font-medium text-muted-foreground">activity_code</th>
              <th className="px-2 py-1 text-left font-medium text-muted-foreground">enabled</th>
              <th className="px-2 py-1 text-left font-medium text-muted-foreground">params_json</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.step_order} className="border-b border-border/50">
                <td className="px-2 py-1 font-mono">{r.step_order}</td>
                <td className="px-2 py-1 font-mono">{r.activity_code}</td>
                <td className="px-2 py-1 font-mono">{r.enabled ? "yes" : "no"}</td>
                <td className="px-2 py-1 font-mono">{JSON.stringify(r.params_json ?? {})}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function ThreatAssessmentSection({ gameId, playerId, turn, isTestMode }: { gameId: string; playerId: string; turn: number; isTestMode: boolean }) {
  const [rows, setRows] = useState<any[] | null>(null);
  const [tol, setTol] = useState<{ total: number; nearby: number } | null>(null);
  const [noDataForTurn, setNoDataForTurn] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setRows(null);
      setNoDataForTurn(false);

      const beliefKeys = [
        "enemy_strength_total",
        "enemy_strength_nearby",
        "enemy_strength_total_baseline",
        "enemy_strength_nearby_baseline",
      ];

      if (isTestMode) {
        // Exact-turn rows: live values for that turn + most recent baseline ≤ turn.
        const liveKeys = ["enemy_strength_total", "enemy_strength_nearby"];
        const baselineKeys = ["enemy_strength_total_baseline", "enemy_strength_nearby_baseline"];

        const [liveRes, baseRes] = await Promise.all([
          supabase
            .from("ai_world_beliefs")
            .select("belief_key, value_json, turn_number")
            .eq("game_id", gameId)
            .eq("player_id", playerId)
            .in("belief_key", liveKeys)
            .eq("turn_number", turn),
          supabase
            .from("ai_world_beliefs")
            .select("belief_key, value_json, turn_number")
            .eq("game_id", gameId)
            .eq("player_id", playerId)
            .in("belief_key", baselineKeys)
            .lte("turn_number", turn)
            .order("turn_number", { ascending: false })
            .limit(20),
        ]);
        if (cancelled) return;
        const merged = [...((liveRes.data as any[]) ?? []), ...((baseRes.data as any[]) ?? [])];
        setRows(merged);
        setNoDataForTurn(((liveRes.data as any[]) ?? []).length === 0);
      } else {
        // Snapshot mode: there's only one row per (player, belief_key) per game.
        const { data } = await supabase
          .from("ai_world_beliefs")
          .select("belief_key, value_json, turn_number")
          .eq("game_id", gameId)
          .eq("player_id", playerId)
          .in("belief_key", beliefKeys)
          .order("turn_number", { ascending: false })
          .limit(40);
        if (cancelled) return;
        setRows((data as any[]) ?? []);
      }

      // Persona tolerances
      const { data: pf } = await supabase
        .from("game_factions")
        .select("ai_persona_id, factions:faction_id(ai_persona_id)")
        .eq("id", playerId)
        .maybeSingle();
      const pid = (pf as any)?.ai_persona_id || (pf as any)?.factions?.ai_persona_id;
      if (!pid) { setTol(null); return; }
      const { data: persona } = await supabase
        .from("ai_personas")
        .select("enemy_strength_total_tolerance_pct, enemy_strength_nearby_tolerance_pct")
        .eq("id", pid)
        .maybeSingle();
      if (!cancelled && persona) {
        setTol({
          total: Number((persona as any).enemy_strength_total_tolerance_pct) || 0,
          nearby: Number((persona as any).enemy_strength_nearby_tolerance_pct) || 0,
        });
      }
    })();
    return () => { cancelled = true; };
  }, [gameId, playerId, turn, isTestMode]);


  const latest = (key: string) => (rows || []).find((r) => r.belief_key === key);
  const total = latest("enemy_strength_total");
  const nearby = latest("enemy_strength_nearby");
  const totalBase = latest("enemy_strength_total_baseline");
  const nearbyBase = latest("enemy_strength_nearby_baseline");

  const pct = (cur: number, base: number) => {
    if (!base) return cur > 0 ? Infinity : 0;
    return Math.abs(cur - base) / base;
  };
  const totalCur = Number(total?.value_json?.points) || 0;
  const nearbyCur = Number(nearby?.value_json?.points) || 0;
  const totalBaseVal = Number(totalBase?.value_json?.points) || 0;
  const nearbyBaseVal = Number(nearbyBase?.value_json?.points) || 0;
  const totalDelta = pct(totalCur, totalBaseVal);
  const nearbyDelta = pct(nearbyCur, nearbyBaseVal);

  const cell = (cur: number, base: number, baseTurn: number | undefined, delta: number, tolPct: number | undefined, fleetCount: number) => {
    const over = tolPct !== undefined && delta >= tolPct;
    return (
      <div className="space-y-1">
        <div className="text-2xl font-mono font-semibold">{cur.toLocaleString()}<span className="ml-1 text-xs font-normal text-muted-foreground">pts</span></div>
        <div className="text-[11px] text-muted-foreground font-mono">
          {fleetCount} fleet{fleetCount === 1 ? "" : "s"} · baseline {base.toLocaleString()}{baseTurn != null ? ` @ t${baseTurn}` : ""}
        </div>
        <div className={`text-[11px] font-mono ${over ? "text-destructive font-semibold" : "text-muted-foreground"}`}>
          Δ {isFinite(delta) ? `${(delta * 100).toFixed(1)}%` : "n/a"}
          {tolPct !== undefined ? ` / tol ${(tolPct * 100).toFixed(0)}%` : ""}
          {over ? " — RECOMPUTE" : ""}
        </div>
      </div>
    );
  };

  return (
    <div className="rounded border border-border">
      <div className="border-b border-border bg-muted/40 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Threat assessment
      </div>
      {rows === null ? (
        <p className="p-3 text-xs text-muted-foreground">Loading…</p>
      ) : isTestMode && noDataForTurn ? (
        <p className="p-3 text-xs text-muted-foreground">No threat-assessment beliefs recorded for turn {turn}. Pick another turn, or process this turn to populate it.</p>
      ) : !total && !nearby ? (
        <p className="p-3 text-xs text-muted-foreground">No threat-assessment beliefs recorded yet. Process a turn for this game.</p>

      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Known enemy strength (total, fog-aware)</div>
            {cell(totalCur, totalBaseVal, totalBase?.value_json?.baseline_turn, totalDelta, tol?.total, Number(total?.value_json?.fleet_count) || 0)}
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Enemy strength within 8 hexes of an owned planet (current)</div>
            {cell(nearbyCur, nearbyBaseVal, nearbyBase?.value_json?.baseline_turn, nearbyDelta, tol?.nearby, Number(nearby?.value_json?.fleet_count) || 0)}
          </div>
        </div>
      )}
    </div>
  );
}


function GoalSlateSection({ gameId, playerId, turn, onTurnChange }: { gameId: string; playerId: string; turn: number; onTurnChange?: (t: number) => void }) {
  const [slate, setSlate] = useState<any | null>(null);
  const [goalMap, setGoalMap] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<any | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const { data } = await supabase
      .from("ai_goal_slates" as any)
      .select("*")
      .eq("game_id", gameId)
      .eq("player_id", playerId)
      .maybeSingle();
    setSlate(data ?? null);
    const ids = [(data as any)?.slot1_goal_id, (data as any)?.slot2_goal_id, (data as any)?.slot3_goal_id].filter(Boolean) as string[];
    if (ids.length) {
      const { data: gs } = await supabase.from("ai_goals" as any).select("id, goal_type").in("id", ids);
      const m: Record<string, string> = {};
      (gs as any[] | null)?.forEach((g) => { m[g.id] = g.goal_type; });
      setGoalMap(m);
    } else {
      setGoalMap({});
    }
  };
  useEffect(() => { load(); setPreview(null); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [gameId, playerId, turn]);


  const runTick = async (commit: boolean) => {
    setBusy(true);
    try {
      const [{ computeSlate }, { buildPlansForFaction }, { loadGameContext }] = await Promise.all([
        import("@/lib/ai/goalSlate"),
        import("@/lib/ai/buildPlans"),
        import("@/lib/gameLifecycle"),
      ]);
      const ctx = await loadGameContext(supabase as any, gameId);
      const res = await computeSlate({
        supabase: supabase as any,
        gameId,
        currentTurn: ctx.game.turn_number,
        mapState: ctx.mapState,
        playerFactionId: playerId,
        commit,
      });
      if (!res) { toast.error("No persona for faction"); return; }
      // Chain plan build so preview + commit exercise the full pipeline.
      const plans = await buildPlansForFaction({
        supabase: supabase as any,
        gameId,
        currentTurn: ctx.game.turn_number,
        mapState: ctx.mapState,
        playerFactionId: playerId,
        commit,
      });
      setPreview({ ...res, plans: plans?.plans ?? [] });
      if (commit) { toast.success(`Slate ${res.reason} · ${plans?.plans.length ?? 0} plan(s) bound`); load(); onTurnChange?.(ctx.game.turn_number); }
      else { toast.success(`Dry-run: ${res.reason} · ${plans?.plans.length ?? 0} plan preview(s)`); onTurnChange?.(ctx.game.turn_number); }
    } catch (e: any) {
      toast.error(e?.message ?? "Tick failed");
    } finally {
      setBusy(false);
    }
  };


  const GOAL_INTENT: Record<string, string> = {
    conquer: "Conquer — take enemy systems",
    bolster_defense: "Bolster defense — reinforce owned systems",
    degrade_enemy: "Degrade enemy — weaken rival fleets/planets",
    enhance_offense: "Enhance offense — build up strike power",
  };
  const slotLabel = (goalId: string | null) => {
    if (!goalId) return "— empty —";
    const t = goalMap[goalId];
    return t ? (GOAL_INTENT[t] || t) : goalId.slice(0, 8);
  };

  return (
    <div className="rounded border border-border">
      <div className="border-b border-border bg-muted/40 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center justify-between">
        <span>Goal slate</span>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" disabled={busy} onClick={() => runTick(false)}>Dry-run tick</Button>
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => runTick(true)}>Commit tick</Button>
        </div>
      </div>
      <div className="p-3 text-xs space-y-3">
        {!slate ? (
          <p className="text-muted-foreground">No slate committed yet. Run a Commit tick to create one.</p>
        ) : (
          <div className="space-y-1">
            <div><span className="text-muted-foreground">Committed turn:</span> <span className="font-mono">{slate.committed_turn}</span></div>
            <div><span className="text-muted-foreground">Next mandatory review:</span> <span className="font-mono">{slate.next_mandatory_review_turn}</span></div>
            <div><span className="text-muted-foreground">Last reason:</span> <span className="font-mono">{slate.last_revision_reason}</span></div>
            <div className="grid grid-cols-3 gap-2 pt-1">
              <div className="rounded border border-border/60 p-2"><div className="text-[10px] text-muted-foreground">P1</div><div className="font-mono">{slotLabel(slate.slot1_goal_id)}</div></div>
              <div className="rounded border border-border/60 p-2"><div className="text-[10px] text-muted-foreground">P2</div><div className="font-mono">{slotLabel(slate.slot2_goal_id)}</div></div>
              <div className="rounded border border-border/60 p-2"><div className="text-[10px] text-muted-foreground">P3</div><div className="font-mono">{slotLabel(slate.slot3_goal_id)}</div></div>
            </div>
          </div>
        )}
        {preview && (
          <div className="mt-3 rounded border border-dashed border-border p-2 space-y-2">
            <div className="font-semibold text-[11px] uppercase tracking-wider text-muted-foreground">Last tick trace</div>
            <div><span className="text-muted-foreground">Reason:</span> <span className="font-mono">{preview.reason}</span> {preview.committed && <span className="text-emerald-600">(committed)</span>}</div>
            {preview.breaches?.length > 0 && (
              <div><span className="text-muted-foreground">Breaches:</span> <span className="font-mono">{preview.breaches.map((b: any) => `${b.dim}(${JSON.stringify(b.from)}→${JSON.stringify(b.to)})`).join(", ")}</span></div>
            )}
            <div>
              <div className="text-muted-foreground mb-1">Proposed slate:</div>
              <table className="w-full font-mono">
                <thead><tr className="text-muted-foreground text-[10px]"><th className="text-left">slot</th><th className="text-left">goal</th><th className="text-right">score</th><th className="text-right">base</th><th className="text-right">urg</th><th className="text-right">trait</th><th className="text-right">rel</th><th className="text-right">belief</th></tr></thead>
                <tbody>
                  {preview.slate.map((g: any, i: number) => (
                    <tr key={i}><td>{i + 1}</td><td>{g.goal_code}</td><td className="text-right">{g.score.toFixed(2)}</td><td className="text-right">{g.breakdown.base.toFixed(2)}</td><td className="text-right">{g.breakdown.urgency.toFixed(2)}</td><td className="text-right">{g.breakdown.trait.toFixed(2)}</td><td className="text-right">{g.breakdown.relationship.toFixed(2)}</td><td className="text-right">{g.breakdown.belief.toFixed(2)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
            <details><summary className="cursor-pointer text-muted-foreground">Worldview dims</summary><pre className="mt-1 whitespace-pre-wrap text-[10px]">{JSON.stringify(preview.worldview, null, 2)}</pre></details>
          </div>
        )}
      </div>
    </div>
  );
}

const PLAN_GOAL_INTENT: Record<string, string> = {
  conquer: "Conquer — take enemy systems",
  bolster_defense: "Bolster defense — reinforce owned systems",
  degrade_enemy: "Degrade enemy — weaken rival fleets/planets",
  enhance_offense: "Enhance offense — build up strike power",
};
const PLAN_FEAS_REASON: Record<string, string> = {
  ok: "Ready to execute",
  no_target: "No valid target this turn",
  insufficient_credits: "Not enough treasury",
  insufficient_fleet: "No suitable fleet available",
  out_of_range: "Target out of range",
  blocked: "Blocked by another condition",
};

function BoundPlansSection({ gameId, playerId }: { gameId: string; playerId: string }) {
  const [plans, setPlans] = useState<any[]>([]);
  const [goalMap, setGoalMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("ai_plans" as any)
      .select("*")
      .eq("game_id", gameId)
      .eq("player_id", playerId)
      .eq("status", "active")
      .order("slate_slot", { ascending: true });
    const rows = (data as any[]) ?? [];
    setPlans(rows);
    const ids = Array.from(new Set(rows.map((r) => r.goal_id).filter(Boolean))) as string[];
    if (ids.length) {
      const { data: gs } = await supabase.from("ai_goals" as any).select("id, goal_type").in("id", ids);
      const m: Record<string, string> = {};
      (gs as any[] | null)?.forEach((g) => { m[g.id] = g.goal_type; });
      setGoalMap(m);
    } else {
      setGoalMap({});
    }
    setLoading(false);
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [gameId, playerId]);

  const feasColor = (f: number) => f >= 0.75 ? "bg-emerald-500" : f >= 0.4 ? "bg-amber-500" : "bg-red-500";


  return (
    <div className="rounded border border-border">
      <div className="border-b border-border bg-muted/40 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center justify-between">
        <span>Bound plans</span>
        <Button size="sm" variant="ghost" onClick={load} disabled={loading}>Refresh</Button>
      </div>
      <div className="p-3 text-xs">
        {plans.length === 0 ? (
          <p className="text-muted-foreground">No active plans. Run a Commit tick after the slate exists.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            {[1, 2, 3].map((slot) => {
              const p = plans.find((x) => x.slate_slot === slot);
              if (!p) return (
                <div key={slot} className="rounded border border-dashed border-border/60 p-2">
                  <div className="text-[10px] text-muted-foreground">P{slot}</div>
                  <div className="font-mono text-muted-foreground">— empty —</div>
                </div>
              );
              const feas = Number(p.feasibility) || 0;
              const goalType = p.goal_id ? goalMap[p.goal_id] : null;
              const intent = goalType ? (PLAN_GOAL_INTENT[goalType] || goalType) : "— no goal —";
              const reasonHuman = PLAN_FEAS_REASON[p.feasibility_reason] || p.feasibility_reason || "unknown";
              return (
                <div key={slot} className="rounded border border-border/60 p-2 space-y-1">
                  <div className="flex items-center justify-between">
                    <div className="text-[10px] text-muted-foreground">P{p.slate_slot}</div>
                    <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${p.feasibility_reason === "ok" ? "bg-emerald-500/15 text-emerald-700" : "bg-amber-500/15 text-amber-700"}`} title={reasonHuman}>{p.feasibility_reason}</span>
                  </div>
                  <div className="text-[11px] font-semibold">{intent}</div>
                  <div className="text-[10px] text-muted-foreground">{reasonHuman}</div>
                  <div className="font-mono text-sm">{p.target_label || "—"}</div>
                  <div className="text-[10px] text-muted-foreground">{p.target_kind}{p.target_id ? ` · ${String(p.target_id).slice(0, 8)}` : ""}</div>
                  <div className="h-1.5 rounded bg-muted overflow-hidden">
                    <div className={`h-full ${feasColor(feas)}`} style={{ width: `${Math.round(feas * 100)}%` }} />
                  </div>
                  <div className="grid grid-cols-2 gap-1 text-[10px] text-muted-foreground pt-0.5">
                    <div>cost: <span className="font-mono text-foreground">{p.estimated_cost_credits}</span></div>
                    <div>turns: <span className="font-mono text-foreground">{p.estimated_cost_turns}</span></div>
                  </div>
                  <details className="mt-1">
                    <summary className="cursor-pointer text-[10px] text-muted-foreground">why this target</summary>
                    <pre className="mt-1 whitespace-pre-wrap text-[10px]">{JSON.stringify(p.scoring_breakdown_json, null, 2)}</pre>
                  </details>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

