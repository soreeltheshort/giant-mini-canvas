import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { ImperialCard } from "./ImperialCard";
import type { MapFleet } from "@/lib/mapTypes";
import type { ShipTypeLookup } from "./ContextPanel";

const READINESS_LEVELS = [
  { value: 1, label: "Readiness 1 – Combat Ready" },
  { value: 2, label: "Readiness 2 – Standard" },
  { value: 3, label: "Readiness 3 – Routine" },
  { value: 4, label: "Readiness 4 – Drydocked" },
];

const STRATEGY_OPTIONS = [
  "Flank", "Outflank", "Skirmish", "Cover Retreat", "Rear", "Attack Planet",
];

interface FleetShipRow {
  id: string;
  ship_type_id: string;
  quantity: number;
  tactical_group: string;
  ship_name: string;
  hull_class: string;
}

interface FleetDetail {
  id: string;
  name: string;
  readiness: number;
  next_readiness: number | null;
  special1_role: string;
  special2_role: string;
}

export interface FleetOrderContext {
  gameId: string;
  playerId: string;
  turnNumber: number;
}

interface Props {
  fleet: MapFleet;
  shipTypes?: ShipTypeLookup[];
  /** Whether this player owns / can edit this fleet */
  canEdit: boolean;
  /** When provided, readiness/strategy changes are written as player_orders. */
  orderContext?: FleetOrderContext;
}

export default function FleetDetailContent({ fleet, shipTypes = [], canEdit, orderContext }: Props) {
  const { toast } = useToast();
  const [detail, setDetail] = useState<FleetDetail | null>(null);
  const [ships, setShips] = useState<FleetShipRow[]>([]);
  const [loading, setLoading] = useState(true);

  const sourceId = fleet.source_fleet_id;

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      if (!sourceId) {
        setDetail(null);
        setShips([]);
        setLoading(false);
        return;
      }
      const [{ data: f }, { data: fs }] = await Promise.all([
        supabase
          .from("fleets")
          .select("id, name, readiness, next_readiness, special1_role, special2_role")
          .eq("id", sourceId)
          .maybeSingle(),
        supabase
          .from("fleet_ships")
          .select("id, ship_type_id, quantity, tactical_group")
          .eq("fleet_id", sourceId),
      ]);
      if (cancelled) return;
      if (f) {
        setDetail({
          id: f.id,
          name: f.name,
          readiness: f.readiness ?? 2,
          next_readiness: (f as any).next_readiness ?? null,
          special1_role: f.special1_role || "Flank",
          special2_role: f.special2_role || "Flank",
        });
      } else {
        setDetail(null);
      }
      const rows: FleetShipRow[] = (fs || []).map((r: any) => {
        const st = shipTypes.find(s => s.id === r.ship_type_id);
        return {
          id: r.id,
          ship_type_id: r.ship_type_id,
          quantity: r.quantity,
          tactical_group: r.tactical_group,
          ship_name: st?.name || r.ship_type_id,
          hull_class: st?.hull_class || "",
        };
      });
      setShips(rows);
      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [sourceId, shipTypes]);

  if (loading) {
    return (
      <ImperialCard title={fleet.fleet_name}>
        <p className="text-[10px] text-muted-foreground italic">Loading fleet detail…</p>
      </ImperialCard>
    );
  }

  if (!detail) {
    return (
      <ImperialCard title={fleet.fleet_name}>
        <p className="text-[10px] text-muted-foreground italic">Fleet record not found.</p>
      </ImperialCard>
    );
  }

  // Effective "next turn" readiness — what current orders dictate
  const nextReadiness = detail.next_readiness ?? detail.readiness;

  const upsertOrder = async (orderType: string, payload: any) => {
    if (!orderContext) return;
    const { gameId, playerId, turnNumber } = orderContext;
    // Delete any prior order of this type for this fleet+turn, then insert
    await (supabase as any).from("player_orders")
      .delete()
      .eq("game_id", gameId).eq("player_id", playerId).eq("turn_number", turnNumber)
      .eq("order_type", orderType)
      .filter("order_json->>fleet_id", "eq", fleet.fleet_id);
    await (supabase as any).from("player_orders").insert({
      game_id: gameId, player_id: playerId, turn_number: turnNumber,
      order_type: orderType, order_json: { fleet_id: fleet.fleet_id, ...payload },
    });
  };

  const updateNextReadiness = async (newVal: number) => {
    const clamped = Math.max(1, Math.min(4, newVal));
    setDetail(d => d ? { ...d, next_readiness: clamped } : d);
    if (orderContext) {
      await upsertOrder("set_readiness", { next_readiness: clamped });
    } else {
      const { error } = await supabase.from("fleets").update({ next_readiness: clamped } as any).eq("id", detail.id);
      if (error) toast({ title: "Failed to save readiness order", description: error.message, variant: "destructive" });
    }
  };

  const cancelOrder = async () => {
    setDetail(d => d ? { ...d, next_readiness: null } : d);
    if (orderContext) {
      const { gameId, playerId, turnNumber } = orderContext;
      await (supabase as any).from("player_orders")
        .delete()
        .eq("game_id", gameId).eq("player_id", playerId).eq("turn_number", turnNumber)
        .eq("order_type", "set_readiness")
        .filter("order_json->>fleet_id", "eq", fleet.fleet_id);
    } else {
      const { error } = await supabase.from("fleets").update({ next_readiness: null } as any).eq("id", detail.id);
      if (error) toast({ title: "Failed to cancel order", description: error.message, variant: "destructive" });
    }
  };


  const updateRole = async (which: "special1_role" | "special2_role", value: string) => {
    setDetail(d => d ? { ...d, [which]: value } : d);
    if (orderContext) {
      const otherKey = which === "special1_role" ? "special2_role" : "special1_role";
      const otherVal = (detail as any)[otherKey];
      await upsertOrder("set_strategy", { special1_role: which === "special1_role" ? value : otherVal, special2_role: which === "special2_role" ? value : otherVal });
    }
    // Always mirror to fleets table so UI shows the change immediately
    const { error } = await supabase.from("fleets").update({ [which]: value }).eq("id", detail.id);
    if (error) toast({ title: "Failed to save strategy", description: error.message, variant: "destructive" });
  };

  const handleQtyChange = async (rowId: string, qty: number) => {
    const safe = Math.max(0, Math.floor(qty));
    setShips(prev => prev.map(s => s.id === rowId ? { ...s, quantity: safe } : s));
    if (safe <= 0) {
      await supabase.from("fleet_ships").delete().eq("id", rowId);
      setShips(prev => prev.filter(s => s.id !== rowId));
    } else {
      await supabase.from("fleet_ships").update({ quantity: safe }).eq("id", rowId);
    }
  };


  return (
    <>
      <ImperialCard title="Readiness">
        <div className="space-y-2.5">
          <Row label="Current">
            <span className="text-xs font-bold text-foreground">{readinessLabel(detail.readiness)}</span>
          </Row>
          {nextReadiness !== detail.readiness && (
            <Row label="Order Pending">
              <span className="text-xs font-bold text-crimson">→ {readinessLabel(nextReadiness)}</span>
            </Row>
          )}

          {canEdit && (
            <div className="pt-2 space-y-2 border-t border-border">
              <label className="text-[10px] font-heading uppercase tracking-wider text-foreground font-bold block">
                Change Readiness Order
              </label>
              <select
                value={detail.next_readiness ?? detail.readiness}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (v === detail.readiness) cancelOrder();
                  else updateNextReadiness(v);
                }}
                className="h-8 w-full rounded-sm border border-input bg-background px-2 text-xs font-semibold text-foreground"
              >
                {READINESS_LEVELS.map(r => {
                  const isRaiseTooMuch = r.value < detail.readiness - 1;
                  return (
                    <option key={r.value} value={r.value} disabled={isRaiseTooMuch}>
                      {r.label}
                      {r.value === detail.readiness ? " (no change)" : ""}
                      {isRaiseTooMuch ? " (max +1 per turn)" : ""}
                    </option>
                  );
                })}
              </select>
              {detail.next_readiness !== null && (
                <button
                  onClick={cancelOrder}
                  className="w-full px-2 py-1 rounded-sm text-[10px] font-heading uppercase tracking-wider border border-border text-foreground hover:border-bronze/60 transition-colors"
                >
                  Cancel Order
                </button>
              )}
              <p className="text-[10px] text-foreground/80 italic">
                May lower by any amount; raising is limited to +1 per turn. Applied at end of economics phase.
              </p>
            </div>
          )}
        </div>
      </ImperialCard>

      <ImperialCard title="Strategy">
        <div className="space-y-2">
          <div>
            <label className="text-[10px] font-heading uppercase tracking-wider text-bronze-dark block mb-1">Strategy 1</label>
            <select
              disabled={!canEdit}
              value={detail.special1_role}
              onChange={(e) => updateRole("special1_role", e.target.value)}
              className="h-8 w-full rounded-sm border border-input bg-background px-2 text-xs text-foreground disabled:opacity-60"
            >
              {STRATEGY_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-heading uppercase tracking-wider text-bronze-dark block mb-1">Strategy 2</label>
            <select
              disabled={!canEdit}
              value={detail.special2_role}
              onChange={(e) => updateRole("special2_role", e.target.value)}
              className="h-8 w-full rounded-sm border border-input bg-background px-2 text-xs text-foreground disabled:opacity-60"
            >
              {STRATEGY_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
        </div>
      </ImperialCard>

      <ImperialCard title="Composition">
        {ships.length === 0 ? (
          <p className="text-[10px] text-muted-foreground italic">No ships in this fleet.</p>
        ) : (
          <div className="space-y-1.5">
            {ships.map(s => (
              <div key={s.id} className="flex items-center justify-between gap-2 text-xs py-1 border-b border-border last:border-0">
                <div className="flex-1 min-w-0">
                  <div className="truncate font-bold text-foreground">{s.ship_name}</div>
                  <div className="text-[10px] text-foreground/70 uppercase tracking-wider font-medium">{s.hull_class} · {s.tactical_group}</div>
                </div>
                {canEdit ? (
                  <input
                    type="number"
                    min={0}
                    value={s.quantity}
                    onChange={(e) => handleQtyChange(s.id, Number(e.target.value))}
                    className="w-14 h-7 rounded-sm border border-input bg-background px-1.5 text-xs text-right"
                  />
                ) : (
                  <span className="font-semibold text-bronze">×{s.quantity}</span>
                )}
              </div>
            ))}
          </div>
        )}
      </ImperialCard>
    </>
  );
}

function readinessLabel(level: number): string {
  return READINESS_LEVELS.find(r => r.value === level)?.label || `Readiness ${level}`;
}

function Row({ label, value, children }: { label: string; value?: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-foreground/80 font-medium">{label}</span>
      {children ? children : <span className="font-bold text-foreground">{value}</span>}
    </div>
  );
}
