import { useEffect, useMemo, useState } from "react";
import { Globe2, ChevronRight, TrendingUp, TrendingDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ImperialCard } from "./ImperialCard";
import { DispatchesCard, type GameMapData } from "./ContextPanel";
import { ownerMatchesFaction } from "@/lib/factionUtils";
import type { MapSelection, NewsStory } from "./gameShellTypes";

interface Props {
  gameData?: GameMapData;
  playerOwnerClassification?: string;
  gameId?: string;
  news: NewsStory[];
  onSelect?: (selection: MapSelection) => void;
}

/**
 * ECONOMY OVERVIEW
 *   - Per-planet NET revenue = last-turn tribute − upkeep (baked on SystemData).
 *   - Non-planet expenses (below) = fleet-by-fleet upkeep (Σ ship.maintenance × qty)
 *     for every non-garrison game_fleet the player owns. Garrison "fleets" are
 *     really planetary defenses and are already priced into planet upkeep, so
 *     they're excluded here to avoid double-counting.
 */
export default function EconomyOverview({
  gameData,
  playerOwnerClassification,
  gameId,
  news,
  onSelect,
}: Props) {
  const owned = useMemo(() => {
    if (!gameData) return [];
    return Array.from(gameData.systems.values())
      .filter((s) => ownerMatchesFaction(s.owner, playerOwnerClassification))
      .sort((a, b) => a.system_name.localeCompare(b.system_name));
  }, [gameData, playerOwnerClassification]);

  const [fleetExpenses, setFleetExpenses] = useState<
    Array<{ id: string; name: string; upkeep: number }>
  >([]);

  useEffect(() => {
    if (!gameId || !playerOwnerClassification) {
      setFleetExpenses([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data: gf } = await (supabase as any)
        .from("game_fleets")
        .select("id, fleet_name, owner_classification, is_garrison")
        .eq("game_id", gameId);
      const mine = (gf || []).filter(
        (f: any) =>
          !f.is_garrison &&
          ownerMatchesFaction(f.owner_classification, playerOwnerClassification),
      );
      if (mine.length === 0) {
        if (!cancelled) setFleetExpenses([]);
        return;
      }
      const ids = mine.map((f: any) => f.id);
      const [{ data: ships }, { data: types }] = await Promise.all([
        (supabase as any)
          .from("game_fleet_ships")
          .select("game_fleet_id, ship_type_id, quantity, tactical_group")
          .in("game_fleet_id", ids),
        (supabase as any).from("ship_types").select("id, maintenance"),
      ]);
      const maint = new Map<string, number>();
      for (const t of types || []) maint.set(t.id, Number(t.maintenance) || 0);
      const rows = mine
        .map((f: any) => {
          const upkeep = (ships || [])
            .filter(
              (s: any) => s.game_fleet_id === f.id && s.tactical_group !== "Scuttle",
            )
            .reduce(
              (sum: number, s: any) =>
                sum + (maint.get(s.ship_type_id) || 0) * (Number(s.quantity) || 0),
              0,
            );
          return { id: f.id, name: f.fleet_name, upkeep: Math.round(upkeep) };
        })
        .filter((r) => r.upkeep > 0)
        .sort((a, b) => b.upkeep - a.upkeep);
      if (!cancelled) setFleetExpenses(rows);
    })();
    return () => {
      cancelled = true;
    };
  }, [gameId, playerOwnerClassification, gameData]);

  const totalFleetUpkeep = fleetExpenses.reduce((s, r) => s + r.upkeep, 0);

  return (
    <>
      <DispatchesCard mode="production" news={news ?? []} onSelect={onSelect} />

      <ImperialCard title={`Planets — Net Revenue (${owned.length})`}>
        {owned.length === 0 ? (
          <p className="text-[10px] text-muted-foreground italic">
            No systems under your control.
          </p>
        ) : (
          <div className="max-h-56 overflow-y-auto space-y-1 pr-1">
            {owned.map((s) => {
              const tribute = Number(s.tribute) || 0;
              const upkeep = Number(s.upkeep) || 0;
              const net = tribute - upkeep;
              const positive = net >= 0;
              return (
                <button
                  key={s.system_id}
                  onClick={() =>
                    onSelect?.({ type: "region", id: `sys-${s.system_id}` })
                  }
                  className="w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-sm border border-border bg-ivory hover:border-bronze/60 bronze-glow-hover transition-colors text-left"
                  title={`Tribute ₡${tribute} − Upkeep ₡${upkeep}`}
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Globe2 className="w-3 h-3 text-bronze shrink-0" />
                    <span className="text-[11px] font-semibold text-senate-dark truncate">
                      {s.system_name}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {positive ? (
                      <TrendingUp className="w-3 h-3 text-emerald-700" />
                    ) : (
                      <TrendingDown className="w-3 h-3 text-destructive" />
                    )}
                    <span
                      className={`text-[10px] font-semibold tabular-nums ${
                        positive ? "text-emerald-800" : "text-destructive"
                      }`}
                    >
                      {positive ? "+" : ""}₡{net.toLocaleString()}
                    </span>
                    <ChevronRight className="w-3 h-3 text-senate-dark/60" />
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </ImperialCard>

      <ImperialCard
        title={`Other Expenses — Fleets (−₡${totalFleetUpkeep.toLocaleString()})`}
      >
        {fleetExpenses.length === 0 ? (
          <p className="text-[10px] text-muted-foreground italic">
            No non-planet upkeep this turn.
          </p>
        ) : (
          <div className="max-h-56 overflow-y-auto space-y-1 pr-1">
            {fleetExpenses.map((f) => (
              <div
                key={f.id}
                className="flex items-center justify-between gap-2 px-2 py-1 rounded-sm border border-border bg-ivory"
              >
                <span className="text-[11px] font-semibold text-senate-dark truncate">
                  {f.name}
                </span>
                <span className="text-[10px] font-semibold tabular-nums text-destructive">
                  −₡{f.upkeep.toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </ImperialCard>
    </>
  );
}
