import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { ImperialCard } from "./ImperialCard";
import FleetCompositionEditor, { type FleetShipRow } from "./FleetCompositionEditor";
import type { MapFleet } from "@/lib/mapTypes";
import type { ShipTypeLookup } from "./ContextPanel";

const READINESS_LEVELS = [
  { value: 1, label: "Readiness 1 – Combat Ready", maintenance: 1.4 },
  { value: 2, label: "Readiness 2 – Standard", maintenance: 1.0 },
  { value: 3, label: "Readiness 3 – Routine", maintenance: 0.75 },
  { value: 4, label: "Readiness 4 – Drydocked", maintenance: 0.25 },
];

function readinessMaintMult(level: number): number {
  return READINESS_LEVELS.find(r => r.value === level)?.maintenance ?? 1;
}

const STRATEGY_OPTIONS = [
  "Flank", "Outflank", "Skirmish", "Cover Retreat", "Rear", "Attack Planet",
];

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
  onStartTargeting?: (
    t: { mode: "hex"; orderType: "fleet_move"; fleetId: string }
      | { mode: "fleet"; orderType: "attack"; fleetId: string }
  ) => void;
  /** Combat points the player can still spend on new fleet orders. */
  combatPointsAvailable?: number;
  /** Notify parent when orders change so it can recompute remaining combat points. */
  onOrdersChanged?: () => void;
}

interface PendingOrder {
  id: string;
  order_type: string;
  order_json: any;
}

export default function FleetDetailContent({ fleet, shipTypes = [], canEdit, orderContext, onStartTargeting, combatPointsAvailable, onOrdersChanged }: Props) {
  const { toast } = useToast();
  const [detail, setDetail] = useState<FleetDetail | null>(null);
  const [ships, setShips] = useState<FleetShipRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingOrders, setPendingOrders] = useState<PendingOrder[]>([]);

  const sourceId = fleet.source_fleet_id;

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      if (!sourceId) {
        setDetail(null);
        setShips([]);
        setPendingOrders([]);
        setLoading(false);
        return;
      }
      const ordersPromise = orderContext
        ? (supabase as any).from("player_orders")
            .select("id, order_type, order_json")
            .eq("game_id", orderContext.gameId)
            .eq("player_id", orderContext.playerId)
            .eq("turn_number", orderContext.turnNumber)
            .filter("order_json->>fleet_id", "eq", fleet.fleet_id)
        : Promise.resolve({ data: [] as any[] });
      const [{ data: f }, { data: fs }, { data: po }] = await Promise.all([
        supabase
          .from("fleets")
          .select("id, name, readiness, next_readiness, special1_role, special2_role")
          .eq("id", sourceId)
          .maybeSingle(),
        supabase
          .from("fleet_ships")
          .select("id, ship_type_id, quantity, tactical_group")
          .eq("fleet_id", sourceId),
        ordersPromise,
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
          ship_display_id: st?.ship_id || "",
          hull_class: st?.hull_class || "",
        };
      });
      setShips(rows);
      setPendingOrders(((po as any[]) || []) as PendingOrder[]);
      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [sourceId, shipTypes, orderContext, fleet.fleet_id]);

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

  // ── Aggregate stats ──
  const totalShips = ships.reduce((sum, s) => sum + (s.quantity || 0), 0);
  let totalMaintenance = 0;
  let totalRepair = 0;
  let totalSupply = 0;
  let minMapSpeed = Infinity;
  for (const s of ships) {
    const st = shipTypes.find(t => t.id === s.ship_type_id);
    if (!st) continue;
    totalMaintenance += (st.maintenance ?? 0) * s.quantity;
    totalRepair += (st.repair_pod ?? 0) * s.quantity;
    totalSupply += (st.supply_pod ?? 0) * s.quantity;
    if ((st.map_speed ?? 0) > 0 && st.map_speed! < minMapSpeed) minMapSpeed = st.map_speed!;
  }
  const mapSpeedDisplay = minMapSpeed === Infinity ? 0 : minMapSpeed;

  // ── Pending move/attack orders ──
  const moveOrder = pendingOrders.find(o => o.order_type === "fleet_move");
  const attackOrder = pendingOrders.find(o => o.order_type === "other" && o.order_json?.kind === "fleet_attack");

  const cancelMoveOrder = async () => {
    if (!moveOrder) return;
    await (supabase as any).from("player_orders").delete().eq("id", moveOrder.id);
    setPendingOrders(prev => prev.filter(o => o.id !== moveOrder.id));
    onOrdersChanged?.();
  };
  const cancelAttackOrder = async () => {
    if (!attackOrder) return;
    await (supabase as any).from("player_orders").delete().eq("id", attackOrder.id);
    setPendingOrders(prev => prev.filter(o => o.id !== attackOrder.id));
    onOrdersChanged?.();
  };

  const targetFleetName = attackOrder
    ? attackOrder.order_json?.target_fleet_id ?? "Unknown"
    : null;

  // Only one active order per fleet
  const activeOrder: "move" | "attack" | null = moveOrder ? "move" : attackOrder ? "attack" : null;
  const noPointsLeft = (combatPointsAvailable ?? Infinity) <= 0;

  return (
    <>
      <ImperialCard title={fleet.fleet_name}>
        <div className="space-y-2">
          <Row label="Maintenance" value={`₡${totalMaintenance}`} />
          <Row label="Repair" value={`${totalRepair}`} />
          <Row label="Supply" value={`${totalSupply}`} />
          <Row label="Map Speed" value={`${mapSpeedDisplay}`} />
          <Row label="Ships" value={`${totalShips}`} />
          <Row label="Position" value={`(${fleet.hex_x}, ${fleet.hex_y})`} />
        </div>
      </ImperialCard>

      <ImperialCard title="Orders">
        <div className="space-y-2.5">
          {!activeOrder && (
            <p className="text-xs text-bronze-dark font-semibold">No active order.</p>
          )}
          {moveOrder && (
            <div className="text-xs text-bronze-dark font-bold">
              Move → ({moveOrder.order_json?.dest_x}, {moveOrder.order_json?.dest_y})
            </div>
          )}
          {attackOrder && (
            <div className="text-xs text-bronze-dark font-bold">
              Attack → {targetFleetName}
            </div>
          )}

          {canEdit && onStartTargeting && (
            <div className="pt-2 border-t border-border space-y-1.5">
              {activeOrder ? (
                <button
                  onClick={activeOrder === "move" ? cancelMoveOrder : cancelAttackOrder}
                  className="w-full h-8 rounded-sm border border-crimson/60 bg-background px-2 text-xs text-crimson font-heading font-bold uppercase tracking-wider hover:bg-crimson/10"
                >
                  Cancel Order
                </button>
              ) : (
                <>
                  <label className="text-[10px] font-heading uppercase tracking-wider text-bronze-dark font-bold block">
                    Issue Order {noPointsLeft && <span className="text-crimson">(no combat points)</span>}
                  </label>
                  <div className="flex gap-1.5">
                    <button
                      disabled={noPointsLeft}
                      onClick={() => onStartTargeting({ mode: "hex", orderType: "fleet_move", fleetId: fleet.fleet_id })}
                      className="flex-1 h-8 rounded-sm border border-input bg-background px-2 text-xs text-foreground font-semibold hover:border-bronze/60 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:border-input"
                    >
                      Move
                    </button>
                    <button
                      disabled={noPointsLeft}
                      onClick={() => onStartTargeting({ mode: "fleet", orderType: "attack", fleetId: fleet.fleet_id })}
                      className="flex-1 h-8 rounded-sm border border-input bg-background px-2 text-xs text-foreground font-semibold hover:border-bronze/60 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:border-input"
                    >
                      Attack
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </ImperialCard>

      <ImperialCard title="Readiness">
        <div className="space-y-2.5">
          <div className="text-xs font-bold text-bronze-dark">{readinessLabel(detail.readiness)}</div>
          {nextReadiness !== detail.readiness && (
            <Row label="Order Pending">
              <span className="text-sm font-bold text-crimson">→ {readinessLabel(nextReadiness)}</span>
            </Row>
          )}

          {canEdit && (
            <div className="pt-2 space-y-2 border-t border-border">
              <label className="text-[10px] font-heading uppercase tracking-wider text-bronze-dark font-bold block mb-1">
                Change Readiness Order
              </label>
              <select
                value={detail.next_readiness ?? detail.readiness}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (v === detail.readiness) cancelOrder();
                  else updateNextReadiness(v);
                }}
                className="h-8 w-full rounded-sm border border-input bg-background px-2 text-xs text-foreground"
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
                  className="w-full px-2 py-1 rounded-sm text-[11px] font-heading uppercase tracking-wider border border-border text-[hsl(20_25%_10%)] font-bold hover:border-bronze/60 transition-colors"
                >
                  Cancel Order
                </button>
              )}
            </div>
          )}
        </div>
      </ImperialCard>

      <ImperialCard title="Strategy">
        <div className="space-y-2">
          <div>
            <label className="text-[10px] font-heading uppercase tracking-wider text-bronze-dark font-bold block mb-1">Strategy 1</label>
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
            <label className="text-[10px] font-heading uppercase tracking-wider text-bronze-dark font-bold block mb-1">Strategy 2</label>
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
        <FleetCompositionEditor
          ships={ships}
          setShips={setShips}
          shipTypes={shipTypes}
          canEdit={canEdit}
          special1Role={detail.special1_role}
          special2Role={detail.special2_role}
        />
      </ImperialCard>
    </>
  );
}

function readinessLabel(level: number): string {
  return READINESS_LEVELS.find(r => r.value === level)?.label || `Readiness ${level}`;
}

function Row({ label, value, children }: { label: string; value?: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-[hsl(20_25%_10%)] font-bold">{label}</span>
      {children ? children : <span className="font-bold text-[hsl(20_25%_10%)]">{value}</span>}
    </div>
  );
}
