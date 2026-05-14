import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { ShipTypeLookup } from "./ContextPanel";

interface QueueRow {
  id: string;
  ship_type_id: string;
  quantity: number;
  destination_fleet_id: string | null;
  points_remaining: number;
  position: number;
}

interface Props {
  gameId?: string;
  systemId?: number | string;
  ownerClassification?: string;
  shipTypes: ShipTypeLookup[];
  shipBuildCapacity: number;
  /** Bumped to force a refetch (e.g., after enqueueing). */
  refreshKey?: number;
}

export default function ShipProductionList({
  gameId,
  systemId,
  ownerClassification,
  shipTypes,
  shipBuildCapacity,
  refreshKey = 0,
}: Props) {
  const [rows, setRows] = useState<QueueRow[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!gameId || systemId === undefined || systemId === null) {
      setRows([]);
      return;
    }
    (async () => {
      let q = (supabase as any)
        .from("system_ship_production")
        .select("id, ship_type_id, quantity, destination_fleet_id, points_remaining, position")
        .eq("game_id", gameId)
        .eq("system_id", systemId)
        .order("position", { ascending: true });
      if (ownerClassification) q = q.eq("owner_classification", ownerClassification);
      const { data } = await q;
      if (!cancelled) setRows((data as QueueRow[]) || []);
    })();
    return () => { cancelled = true; };
  }, [gameId, systemId, ownerClassification, refreshKey]);

  if (rows === null) {
    return <p className="text-[10px] text-muted-foreground italic">Loading queue…</p>;
  }
  if (rows.length === 0) {
    return <p className="text-[10px] text-muted-foreground italic">No ships under construction.</p>;
  }

  let pointsAhead = 0;
  return (
    <div className="space-y-1">
      {rows.map((r, idx) => {
        const st = shipTypes.find((s) => s.id === r.ship_type_id);
        pointsAhead += r.points_remaining;
        const eta = shipBuildCapacity > 0 ? Math.max(1, Math.ceil(pointsAhead / shipBuildCapacity)) : null;
        return (
          <div key={r.id} className="flex items-center justify-between text-[10px] py-1 border-b border-border last:border-0 gap-2">
            <span className="truncate">
              <span className="text-muted-foreground mr-1">{idx + 1}.</span>
              <span className="text-accent font-semibold">{st?.name || r.ship_type_id}</span>
              <span className="text-bronze"> ×{r.quantity}</span>
            </span>
            <span className="text-muted-foreground shrink-0">
              {r.points_remaining} pts{eta ? ` · ${eta}T` : ""}
            </span>
          </div>
        );
      })}
    </div>
  );
}
