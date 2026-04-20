import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { playOrderPlaced } from "@/lib/uiSounds";
import { ImperialCard } from "./ImperialCard";
import FleetCompositionEditor, { type FleetShipRow } from "./FleetCompositionEditor";
import type { MapFleet, SystemData } from "@/lib/mapTypes";
import type { ShipTypeLookup } from "./ContextPanel";

const PROVINCE_FACTION_NAMES: Record<string, string> = {
  PROVINCE_1: "Valerian",
  PROVINCE_2: "Aurelian",
  PROVINCE_3: "Cassian",
  PROVINCE_4: "Dravian",
  PROVINCE_5: "Marcellan",
  PROVINCE_6: "Octavian",
};
const PROVINCE_FACTION_COLORS: Record<string, string> = {
  PROVINCE_1: "#f97316",
  PROVINCE_2: "#06b6d4",
  PROVINCE_3: "#eab308",
  PROVINCE_4: "#a855f7",
  PROVINCE_5: "#f472b6",
  PROVINCE_6: "#14b8a6",
};

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
  /** All fleets in the game (for resolving target fleet names in attack orders). */
  allFleets?: MapFleet[];
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

export default function FleetDetailContent({ fleet, shipTypes = [], allFleets = [], canEdit, orderContext, onStartTargeting, combatPointsAvailable, onOrdersChanged }: Props) {
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

  // ── Enemy fleet view ──
  // When the player does not own this fleet, render a stripped-down intel card:
  //   prominent faction + fleet name, fleet-size descriptor (from points),
  //   and a list of any ship types the player has personally encountered in combat.
  if (!canEdit) {
    return (
      <EnemyFleetView
        fleet={fleet}
        ships={ships}
        shipTypes={shipTypes}
        observerPlayerId={orderContext?.playerId}
      />
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
    const { error } = await (supabase as any).from("player_orders").insert({
      game_id: gameId, player_id: playerId, turn_number: turnNumber,
      order_type: orderType, order_json: { fleet_id: fleet.fleet_id, ...payload },
    });
    if (!error) playOrderPlaced();
  };

  const updateNextReadiness = async (newVal: number) => {
    const clamped = Math.max(1, Math.min(4, newVal));
    // Issuing a *new* readiness order costs 1 combat point. Changing an existing pending
    // order does not cost extra (we already debited it the first time).
    const hasExistingOrder = (detail?.next_readiness ?? null) !== null;
    if (!hasExistingOrder && (combatPointsAvailable ?? Infinity) <= 0) {
      toast({
        title: "No combat points",
        description: "Cancel another fleet order first.",
        variant: "destructive",
      });
      return;
    }
    setDetail(d => d ? { ...d, next_readiness: clamped } : d);
    if (orderContext) {
      await upsertOrder("set_readiness", { next_readiness: clamped });
      if (!hasExistingOrder) onOrdersChanged?.();
    } else {
      const { error } = await supabase.from("fleets").update({ next_readiness: clamped } as any).eq("id", detail!.id);
      if (error) toast({ title: "Failed to save readiness order", description: error.message, variant: "destructive" });
    }
  };

  const cancelOrder = async () => {
    const hadOrder = (detail?.next_readiness ?? null) !== null;
    setDetail(d => d ? { ...d, next_readiness: null } : d);
    if (orderContext) {
      const { gameId, playerId, turnNumber } = orderContext;
      await (supabase as any).from("player_orders")
        .delete()
        .eq("game_id", gameId).eq("player_id", playerId).eq("turn_number", turnNumber)
        .eq("order_type", "set_readiness")
        .filter("order_json->>fleet_id", "eq", fleet.fleet_id);
      if (hadOrder) onOrdersChanged?.();
    } else {
      const { error } = await supabase.from("fleets").update({ next_readiness: null } as any).eq("id", detail!.id);
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
  // Maintenance scales with readiness. We show the *current* readiness cost by default
  // and italicize the value when a readiness order would change it next turn.
  const totalShips = ships.reduce((sum, s) => sum + (s.quantity || 0), 0);
  let baseMaintenance = 0;
  let totalRepair = 0;
  let totalSupply = 0;
  let minMapSpeed = Infinity;
  for (const s of ships) {
    const st = shipTypes.find(t => t.id === s.ship_type_id);
    if (!st) continue;
    baseMaintenance += (st.maintenance ?? 0) * s.quantity;
    totalRepair += (st.repair_pod ?? 0) * s.quantity;
    totalSupply += (st.supply_pod ?? 0) * s.quantity;
    if ((st.map_speed ?? 0) > 0 && st.map_speed! < minMapSpeed) minMapSpeed = st.map_speed!;
  }
  const mapSpeedDisplay = minMapSpeed === Infinity ? 0 : minMapSpeed;
  const previewReadiness = detail.next_readiness ?? detail.readiness;
  const readinessChanged = detail.next_readiness !== null && detail.next_readiness !== detail.readiness;
  const previewMaintenance = Math.round(baseMaintenance * readinessMaintMult(previewReadiness) * 100) / 100;

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
    ? (allFleets.find(f => f.fleet_id === attackOrder.order_json?.target_fleet_id)?.fleet_name
        ?? attackOrder.order_json?.target_fleet_id
        ?? "Unknown")
    : null;

  // Only one active order per fleet
  const activeOrder: "move" | "attack" | null = moveOrder ? "move" : attackOrder ? "attack" : null;
  const noPointsLeft = (combatPointsAvailable ?? Infinity) <= 0;

  return (
    <>
      <ImperialCard title={fleet.fleet_name}>
        <div className="space-y-2">
          <Row
            label="Maintenance"
            value={`₡${previewMaintenance}`}
            valueClassName={readinessChanged ? "italic text-crimson" : undefined}
          />
          <Row label="Repair" value={`${totalRepair}`} />
          <Row label="Supply" value={`${totalSupply}`} />
          <Row label="Map Speed" value={`${mapSpeedDisplay}`} />
          <Row label="Ships" value={`${totalShips}`} />
          
        </div>
      </ImperialCard>

      {canEdit && (
        <ImperialCard title="Logistics">
          <div className="grid grid-cols-2 gap-1.5">
            <button
              onClick={() => toast({ title: "Replenish supply", description: "Not yet implemented." })}
              className="h-8 rounded-sm border border-input bg-background px-2 text-[11px] text-foreground font-semibold hover:border-bronze/60"
            >
              Replenish Supply
            </button>
            <button
              onClick={() => toast({ title: "Replenish fighters", description: "Not yet implemented." })}
              className="h-8 rounded-sm border border-input bg-background px-2 text-[11px] text-foreground font-semibold hover:border-bronze/60"
            >
              Replenish Fighters
            </button>
            <button
              onClick={() => toast({ title: "Replenish gunships", description: "Not yet implemented." })}
              className="h-8 rounded-sm border border-input bg-background px-2 text-[11px] text-foreground font-semibold hover:border-bronze/60"
            >
              Replenish Gunships
            </button>
            <button
              onClick={() => toast({ title: "Repair ships", description: "Not yet implemented." })}
              className="h-8 rounded-sm border border-input bg-background px-2 text-[11px] text-foreground font-semibold hover:border-bronze/60"
            >
              Repair Ships
            </button>
          </div>
        </ImperialCard>
      )}

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
                  {noPointsLeft && (
                    <label className="text-[10px] font-heading uppercase tracking-wider text-crimson font-bold block">
                      No combat points
                    </label>
                  )}
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
                {detail.next_readiness === null && noPointsLeft && (
                  <span className="text-crimson normal-case"> (no combat points)</span>
                )}
              </label>
              <select
                value={detail.next_readiness ?? detail.readiness}
                disabled={detail.next_readiness === null && noPointsLeft}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (v === detail.readiness) cancelOrder();
                  else updateNextReadiness(v);
                }}
                className="h-8 w-full rounded-sm border border-input bg-background px-2 text-xs text-foreground disabled:opacity-50 disabled:cursor-not-allowed"
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
                  className="w-full px-2 py-1 rounded-sm text-[11px] font-heading uppercase tracking-wider border border-crimson/60 bg-background text-crimson font-bold hover:bg-crimson/10 transition-colors"
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

function Row({ label, value, children, valueClassName }: { label: string; value?: string; children?: React.ReactNode; valueClassName?: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-[hsl(20_25%_10%)] font-bold">{label}</span>
      {children
        ? children
        : <span className={`font-bold text-[hsl(20_25%_10%)] ${valueClassName ?? ""}`}>{value}</span>}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────
 *  Enemy Fleet Intel View
 * ────────────────────────────────────────────────────────────────────── */

interface FleetSizeCategory {
  descriptor: string;
  min_points: number;
  max_points: number;
}

interface IntelRow {
  ship_type_id: string;
  quantity_seen: number;
  last_seen_turn: number;
}

function EnemyFleetView({
  fleet,
  ships,
  shipTypes,
  observerPlayerId,
}: {
  fleet: MapFleet;
  ships: FleetShipRow[];
  shipTypes: ShipTypeLookup[];
  observerPlayerId?: string;
}) {
  const [categories, setCategories] = useState<FleetSizeCategory[]>([]);
  const [intel, setIntel] = useState<IntelRow[]>([]);
  const [loadingExtras, setLoadingExtras] = useState(true);

  // Compute total point value of the enemy fleet from its actual ship list.
  // The player only sees the descriptor, not the underlying number.
  let totalPoints = 0;
  for (const s of ships) {
    const st = shipTypes.find(t => t.id === s.ship_type_id);
    if (st) totalPoints += (st.point_cost ?? 0) * (s.quantity || 0);
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [{ data: cats }, { data: intelRows }] = await Promise.all([
        (supabase as any).from("fleet_size_categories")
          .select("descriptor, min_points, max_points")
          .order("sort_order"),
        observerPlayerId
          ? (supabase as any).from("player_fleet_intel")
              .select("ship_type_id, quantity_seen, last_seen_turn")
              .eq("observer_player_id", observerPlayerId)
              .eq("enemy_fleet_id", fleet.source_fleet_id || "")
          : Promise.resolve({ data: [] as IntelRow[] }),
      ]);
      if (cancelled) return;
      setCategories((cats as FleetSizeCategory[]) || []);
      setIntel(((intelRows as IntelRow[]) || []));
      setLoadingExtras(false);
    })();
    return () => { cancelled = true; };
  }, [observerPlayerId, fleet.source_fleet_id]);

  const sizeDescriptor = categories.find(
    c => totalPoints >= c.min_points && totalPoints <= c.max_points,
  )?.descriptor ?? (loadingExtras ? "…" : "Unknown");

  const factionName = PROVINCE_FACTION_NAMES[fleet.owner_classification] ?? fleet.owner_classification;
  const factionColor = PROVINCE_FACTION_COLORS[fleet.owner_classification] ?? "#888";

  // Resolve ship-type details for any encountered ships.
  const encountered = intel
    .map(row => {
      const st = shipTypes.find(t => t.id === row.ship_type_id);
      return {
        id: row.ship_type_id,
        name: st?.name ?? "Unknown class",
        ship_id: st?.ship_id ?? "",
        hull_class: st?.hull_class ?? "",
        quantity: row.quantity_seen,
        last_seen_turn: row.last_seen_turn,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  // Strip leading "Fleet " or trailing " Fleet" from the displayed name
  const displayFleetName = (fleet.fleet_name || "")
    .replace(/^\s*fleet\s+/i, "")
    .replace(/\s+fleet\s*$/i, "")
    .trim() || fleet.fleet_name;

  return (
    <>
      <ImperialCard title="Hostile Contact">
        <div className="space-y-2.5">
          <div className="text-base font-bold font-heading text-muted-foreground truncate">
            {displayFleetName}
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-[10px] font-heading uppercase tracking-widest text-bronze-dark">
              Faction
            </span>
            <span className="text-sm font-bold font-heading text-muted-foreground truncate">
              {factionName}
            </span>
          </div>
          <div className="flex items-center justify-between text-sm pt-1 border-t border-border">
            <span className="text-[hsl(20_25%_10%)] font-bold">Size</span>
            <span className="font-bold text-crimson font-heading uppercase tracking-wider text-xs">
              {sizeDescriptor}
            </span>
          </div>
        </div>
      </ImperialCard>

      <ImperialCard title="Combat Intelligence">
        {loadingExtras ? (
          <p className="text-[10px] text-muted-foreground italic">Reviewing dispatches…</p>
        ) : encountered.length === 0 ? (
          <p className="text-[11px] text-muted-foreground italic">
            No prior engagements logged. Your forces have not faced this fleet in battle.
          </p>
        ) : (
          <div className="space-y-1">
            <p className="text-[10px] text-bronze-dark font-heading uppercase tracking-wider">
              Ship classes encountered in combat
            </p>
            <ul className="space-y-1">
              {encountered.map(s => (
                <li
                  key={s.id}
                  className="flex items-center justify-between text-xs border-b border-border/50 py-1"
                >
                  <span className="font-semibold text-foreground truncate">
                    {s.name}
                    {s.hull_class && (
                      <span className="ml-1 text-[10px] text-muted-foreground">
                        ({s.hull_class})
                      </span>
                    )}
                  </span>
                  <span className="text-[10px] text-bronze-dark font-mono whitespace-nowrap">
                    T{s.last_seen_turn}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </ImperialCard>
    </>
  );
}
