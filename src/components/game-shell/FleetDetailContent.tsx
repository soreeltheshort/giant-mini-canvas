import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { playOrderPlaced } from "@/lib/uiSounds";
import { ImperialCard } from "./ImperialCard";
import FleetCompositionEditor, { type FleetShipRow } from "./FleetCompositionEditor";
import type { MapFleet, SystemData, HexData } from "@/lib/mapTypes";
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
  current_supply: number;
}

/** Per-ship-type capacity + cost data needed for strikecraft build orders. */
interface ShipTypeExtra {
  fighter_bay: number;
  fighter_storage: number;
  gun_ship_link: number;
  gunship_storage: number;
  point_cost: number;
  hull: number;
  /** Class designator: FL, FH, GS, etc. */
  class: string;
}

/** Buildable strikecraft entry (FL/FH/GS) shown in the build picker. */
interface StrikecraftCatalogEntry {
  id: string;
  name: string;
  ship_id: string;
  class: string;          // FL | FH | GS
  point_cost: number;
  hull: number;
  /**
   * Slots consumed in the host capacity:
   *  - FL = 1 fighter slot, FH = 2 fighter slots, GS = 1 gunship slot.
   */
  slots: number;
  /** "fighter" | "gunship" */
  bucket: "fighter" | "gunship";
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
  /** All systems on the map — used to determine if the fleet is at a player-owned planet. */
  allSystems?: SystemData[];
  /** Hex lookup keyed by "x,y" — used to translate fleet coordinates to a hex_id/system. */
  allHexes?: Map<string, HexData>;
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

/** Build-strikecraft order item: a quantity of a specific FL/FH/GS ship type. */
export interface BuildItem {
  ship_type_id: string;
  quantity: number;
}

export default function FleetDetailContent({ fleet, shipTypes = [], allFleets = [], allSystems = [], allHexes, canEdit, orderContext, onStartTargeting, combatPointsAvailable, onOrdersChanged }: Props) {
  const { toast } = useToast();
  const [detail, setDetail] = useState<FleetDetail | null>(null);
  const [ships, setShips] = useState<FleetShipRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingOrders, setPendingOrders] = useState<PendingOrder[]>([]);
  const [supplyCoefficient, setSupplyCoefficient] = useState<number>(10);
  const [replenishOpen, setReplenishOpen] = useState(false);
  const [repairOpen, setRepairOpen] = useState(false);
  const [replenishAmount, setReplenishAmount] = useState(0);
  // Extra ship-type data (capacity + cost) needed for build-strikecraft orders.
  // Keyed by ship_type_id.
  const [shipTypeExtras, setShipTypeExtras] = useState<Map<string, ShipTypeExtra>>(new Map());
  // Catalog of buildable strikecraft classes (FL/FH/GS), used in the build queue UI.
  const [strikecraftCatalog, setStrikecraftCatalog] = useState<StrikecraftCatalogEntry[]>([]);

  const sourceId = fleet.source_fleet_id;

  // Fetch the supply capacity coefficient once.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await (supabase as any)
        .from("combat_constants")
        .select("value")
        .eq("key", "supply_capacity_coefficient")
        .maybeSingle();
      if (!cancelled && data?.value !== undefined) {
        setSupplyCoefficient(Number(data.value) || 10);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Fetch ship-type extras (capacity, point_cost, hull) and the buildable
  // strikecraft catalog. One-shot fetch; ship_types is small and rarely changes.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await (supabase as any)
        .from("ship_types")
        .select("id, name, ship_id, class, hull_class, hull, point_cost, fighter_bay, fighter_storage, gun_ship_link, gunship_storage");
      if (cancelled || !data) return;
      const extras = new Map<string, ShipTypeExtra>();
      const catalog: StrikecraftCatalogEntry[] = [];
      for (const r of data as any[]) {
        extras.set(r.id, {
          fighter_bay: Number(r.fighter_bay) || 0,
          fighter_storage: Number(r.fighter_storage) || 0,
          gun_ship_link: Number(r.gun_ship_link) || 0,
          gunship_storage: Number(r.gunship_storage) || 0,
          point_cost: Number(r.point_cost) || 0,
          hull: Number(r.hull) || 0,
          class: r.class || "",
        });
        const cls = String(r.class || "");
        if (cls === "FL" || cls === "FH" || cls === "GS") {
          catalog.push({
            id: r.id,
            name: r.name,
            ship_id: r.ship_id || "",
            class: cls,
            point_cost: Number(r.point_cost) || 0,
            hull: Number(r.hull) || 0,
            slots: cls === "FH" ? 2 : 1,
            bucket: cls === "GS" ? "gunship" : "fighter",
          });
        }
      }
      catalog.sort((a, b) => a.point_cost - b.point_cost || a.name.localeCompare(b.name));
      setShipTypeExtras(extras);
      setStrikecraftCatalog(catalog);
    })();
    return () => { cancelled = true; };
  }, []);

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
          .select("id, name, readiness, next_readiness, special1_role, special2_role, current_supply")
          .eq("id", sourceId)
          .maybeSingle(),
        supabase
          .from("game_fleet_ships")
          // Join ship_types so we always have max hull for HP display, even if the
          // shipTypes prop lookup is stale or missing this type.
          .select("id, ship_type_id, quantity, tactical_group, current_hp, crippled, ship_types(hull, name, ship_id, hull_class)")
          .eq("game_fleet_id", fleet.fleet_id),
        ordersPromise,
      ]);
      if (cancelled) return;
      if (f) {
        // Prefer pending player_orders readiness over the (legacy) fleets.next_readiness
        // column so the UI reflects the order the player just placed this turn.
        const orders = ((po as any[]) || []) as PendingOrder[];
        const pendingReadiness = orders.find(o => o.order_type === "set_readiness");
        const nextR = pendingReadiness
          ? Number(pendingReadiness.order_json?.next_readiness)
          : ((f as any).next_readiness ?? null);
        setDetail({
          id: f.id,
          name: f.name,
          readiness: f.readiness ?? 2,
          next_readiness: Number.isFinite(nextR) ? nextR : null,
          special1_role: f.special1_role || "Flank",
          special2_role: f.special2_role || "Flank",
          current_supply: (f as any).current_supply ?? 0,
        });
      } else {
        setDetail(null);
      }
      const rows: FleetShipRow[] = (fs || []).map((r: any) => {
        const st = shipTypes.find(s => s.id === r.ship_type_id);
        // Joined ship_types row from the DB query — authoritative source for hull.
        const stJoined = r.ship_types || null;
        const maxHp = (stJoined?.hull ?? (st as any)?.hull ?? null);
        return {
          id: r.id,
          ship_type_id: r.ship_type_id,
          quantity: r.quantity,
          tactical_group: r.tactical_group,
          ship_name: stJoined?.name || st?.name || r.ship_type_id,
          ship_display_id: stJoined?.ship_id || st?.ship_id || "",
          hull_class: stJoined?.hull_class || st?.hull_class || "",
          max_hp: maxHp,
          current_hp: r.current_hp ?? null,
          crippled: !!r.crippled,
        };
      });
      setShips(rows);
      const orders = ((po as any[]) || []) as PendingOrder[];
      setPendingOrders(orders);
      const existingReplenish = orders.find(
        o => o.order_type === "other" && o.order_json?.kind === "replenish_supply",
      );
      if (existingReplenish) {
        setReplenishAmount(Number(existingReplenish.order_json?.amount) || 0);
      } else {
        // Will be re-defaulted to max delta below once we have totals.
        setReplenishAmount(-1);
      }
      setReplenishOpen(false);
      setRepairOpen(false);
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
  let availableRepair = 0;
  let totalSupply = 0;
  let minMapSpeed = Infinity;
  // Strikecraft capacity & current usage (FL = 1 fighter slot, FH = 2, GS = 1 gunship slot).
  let fighterCap = 0, fighterUsed = 0, gunshipCap = 0, gunshipUsed = 0;
  for (const s of ships) {
    const st = shipTypes.find(t => t.id === s.ship_type_id);
    if (!st) continue;
    baseMaintenance += (st.maintenance ?? 0) * s.quantity;
    const repairContribution = (st.repair_pod ?? 0) * s.quantity;
    totalRepair += repairContribution;
    if (s.tactical_group === "Rear") availableRepair += repairContribution;
    totalSupply += (st.supply_pod ?? 0) * s.quantity;
    if ((st.map_speed ?? 0) > 0 && st.map_speed! < minMapSpeed) minMapSpeed = st.map_speed!;

    const ext = shipTypeExtras.get(s.ship_type_id);
    if (ext) {
      fighterCap += ext.fighter_bay * s.quantity;
      gunshipCap += ext.gun_ship_link * s.quantity;
      if (ext.class === "FL") fighterUsed += 1 * s.quantity;
      else if (ext.class === "FH") fighterUsed += 2 * s.quantity;
      else if (ext.class === "GS") gunshipUsed += 1 * s.quantity;
    }
  }
  const mapSpeedDisplay = minMapSpeed === Infinity ? 0 : minMapSpeed;
  const previewReadiness = detail.next_readiness ?? detail.readiness;
  const readinessChanged = detail.next_readiness !== null && detail.next_readiness !== detail.readiness;
  const currentMaintenance = Math.round(baseMaintenance * readinessMaintMult(detail.readiness) * 100) / 100;
  const previewMaintenance = Math.round(baseMaintenance * readinessMaintMult(previewReadiness) * 100) / 100;

  // ── Supply (max = sum of supply_pod × coefficient) ──
  const maxSupply = totalSupply * supplyCoefficient;
  const currentSupply = Math.min(detail.current_supply, maxSupply);

  // Repair orders consume supply (1 supply per HP). Subtract from current.
  const pendingRepairOrder = pendingOrders.find(
    o => o.order_type === "other" && o.order_json?.kind === "repair_fleet",
  );
  const pendingRepairCost = (pendingRepairOrder?.order_json?.assignments as RepairAssignment[] | undefined)
    ?.reduce((sum, a) => sum + (Number(a.amount) || 0), 0) ?? 0;

  // Build-strikecraft orders also consume supply (1 supply per ship point_cost).
  const pendingBuildOrder = pendingOrders.find(
    o => o.order_type === "other" && o.order_json?.kind === "build_strikecraft",
  );
  const pendingBuildItems = (pendingBuildOrder?.order_json?.items as BuildItem[] | undefined) ?? [];
  const pendingBuildCost = pendingBuildItems.reduce((sum, it) => {
    const ext = shipTypeExtras.get(it.ship_type_id);
    return sum + (ext?.point_cost ?? 0) * (Number(it.quantity) || 0);
  }, 0);

  const pendingTotalCost = pendingRepairCost + pendingBuildCost;
  const projectedSupply = Math.max(0, currentSupply - pendingTotalCost);
  const supplyDelta = Math.max(0, maxSupply - projectedSupply);

  // If the slider hasn't been seeded yet (sentinel -1 from load), default to "fill up".
  if (replenishAmount < 0 && supplyDelta >= 0) {
    // Schedule outside render to avoid setState-in-render warning.
    queueMicrotask(() => setReplenishAmount(supplyDelta));
  }

  // ── Replenish eligibility: fleet must be on a hex with a player-owned system ──
  let atOwnedPlanet = false;
  if (canEdit) {
    for (const s of allSystems) {
      const hex = allHexes?.get(`${fleet.hex_x},${fleet.hex_y}`);
      if (hex && s.hex_id === hex.hex_id && s.owner === fleet.owner_classification) {
        atOwnedPlanet = true;
        break;
      }
    }
  }

  const replenishOrder = pendingOrders.find(
    o => o.order_type === "other" && o.order_json?.kind === "replenish_supply",
  );
  const projectedSupplyCost = atOwnedPlanet ? replenishAmount : 0;

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

  // ── Replenish supply order persistence ──
  const persistReplenishAmount = async (amount: number) => {
    if (!orderContext) return;
    const { gameId, playerId, turnNumber } = orderContext;
    // Always clear any existing replenish_supply order for this fleet+turn
    await (supabase as any).from("player_orders")
      .delete()
      .eq("game_id", gameId).eq("player_id", playerId).eq("turn_number", turnNumber)
      .eq("order_type", "other")
      .filter("order_json->>fleet_id", "eq", fleet.fleet_id)
      .filter("order_json->>kind", "eq", "replenish_supply");
    if (amount > 0) {
      await (supabase as any).from("player_orders").insert({
        game_id: gameId, player_id: playerId, turn_number: turnNumber,
        order_type: "other",
        order_json: {
          fleet_id: fleet.fleet_id,
          kind: "replenish_supply",
          amount,
        },
      });
      playOrderPlaced();
    }
    onOrdersChanged?.();
  };

  return (
    <>
      <ImperialCard title={fleet.fleet_name}>
        <div className="space-y-2">
          <Row
            label="Maintenance"
            value={
              readinessChanged
                ? `₡${currentMaintenance} (₡${previewMaintenance})`
                : `₡${currentMaintenance}`
            }
            valueClassName={readinessChanged ? "text-crimson" : undefined}
          />
          <Row label="Repair" value={`${availableRepair} / ${totalRepair}`} />
          <Row
            label="Supply"
            value={
              pendingTotalCost > 0
                ? `${currentSupply} (${projectedSupply}) / ${maxSupply}`
                : `${currentSupply} / ${maxSupply}`
            }
          />
          {(fighterCap > 0 || gunshipCap > 0) && (
            <>
              {fighterCap > 0 && <Row label="Fighters" value={`${fighterUsed} / ${fighterCap}`} />}
              {gunshipCap > 0 && <Row label="Gunships" value={`${gunshipUsed} / ${gunshipCap}`} />}
            </>
          )}
          <Row label="Map Speed" value={`${mapSpeedDisplay}`} />
          <Row label="Ships" value={`${totalShips}`} />
          
        </div>
      </ImperialCard>

      {canEdit && (
        <ImperialCard title="Logistics">
          <div className="space-y-2.5">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-[hsl(20_25%_10%)] font-bold">Supply</span>
                <span className="font-bold text-[hsl(20_25%_10%)]">
                  {projectedSupply + Math.min(replenishAmount, supplyDelta)} / {maxSupply}
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={supplyDelta}
                step={1}
                value={Math.min(replenishAmount, supplyDelta)}
                disabled={supplyDelta <= 0}
                onChange={(e) => setReplenishAmount(Number(e.target.value))}
                onPointerUp={() => persistReplenishAmount(Math.min(replenishAmount, supplyDelta))}
                onKeyUp={() => persistReplenishAmount(Math.min(replenishAmount, supplyDelta))}
                className="w-full accent-bronze disabled:opacity-50 disabled:cursor-not-allowed"
              />
            </div>

            {(() => {
              const canReplenish = supplyDelta > 0;
              const canRepair = ships.some(
                s => s.crippled || (s.current_hp != null && s.max_hp != null && s.current_hp < s.max_hp),
              );
              // Build orders are available whenever there is unused fighter or
              // gunship capacity (regardless of damage state).
              const canBuild =
                strikecraftCatalog.length > 0 &&
                (fighterCap - fighterUsed > 0 || gunshipCap - gunshipUsed > 0);
              const disabled = !canReplenish && !canRepair && !canBuild;
              return (
                <button
                  onClick={() => {
                    if (canRepair || canBuild) setRepairOpen(true);
                    if (canReplenish) setReplenishOpen(true);
                  }}
                  disabled={disabled}
                  className="w-full h-8 rounded-sm border border-input bg-background px-2 text-xs text-foreground font-semibold hover:border-bronze/60 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:border-input"
                >
                  Repair and Replenish
                </button>
              );
            })()}
          </div>
        </ImperialCard>
      )}

      {replenishOpen && (
        <FleetActionPopup title="Fleet Replenish" onClose={() => setReplenishOpen(false)} />
      )}
      {repairOpen && (
        <RepairPopup
          ships={ships}
          availableRepair={availableRepair}
          availableSupply={currentSupply}
          existingAssignments={(pendingOrders.find(
            o => o.order_type === "other" && o.order_json?.kind === "repair_fleet",
          )?.order_json?.assignments as RepairAssignment[] | undefined) ?? []}
          existingBuildItems={pendingBuildItems}
          strikecraftCatalog={strikecraftCatalog}
          fighterCap={fighterCap}
          fighterUsed={fighterUsed}
          gunshipCap={gunshipCap}
          gunshipUsed={gunshipUsed}
          onClose={() => setRepairOpen(false)}
          onSave={async (assignments, buildItems) => {
            if (!orderContext) return;
            const { gameId, playerId, turnNumber } = orderContext;
            // Clear both repair and build orders for this fleet+turn, then re-insert
            // any non-empty queues.
            await (supabase as any).from("player_orders")
              .delete()
              .eq("game_id", gameId).eq("player_id", playerId).eq("turn_number", turnNumber)
              .eq("order_type", "other")
              .filter("order_json->>fleet_id", "eq", fleet.fleet_id)
              .filter("order_json->>kind", "eq", "repair_fleet");
            await (supabase as any).from("player_orders")
              .delete()
              .eq("game_id", gameId).eq("player_id", playerId).eq("turn_number", turnNumber)
              .eq("order_type", "other")
              .filter("order_json->>fleet_id", "eq", fleet.fleet_id)
              .filter("order_json->>kind", "eq", "build_strikecraft");

            const filteredRepairs = assignments.filter(a => a.amount > 0);
            if (filteredRepairs.length > 0) {
              await (supabase as any).from("player_orders").insert({
                game_id: gameId, player_id: playerId, turn_number: turnNumber,
                order_type: "other",
                order_json: {
                  fleet_id: fleet.fleet_id,
                  kind: "repair_fleet",
                  assignments: filteredRepairs,
                },
              });
            }
            const filteredBuilds = buildItems.filter(b => b.quantity > 0);
            if (filteredBuilds.length > 0) {
              await (supabase as any).from("player_orders").insert({
                game_id: gameId, player_id: playerId, turn_number: turnNumber,
                order_type: "other",
                order_json: {
                  fleet_id: fleet.fleet_id,
                  kind: "build_strikecraft",
                  items: filteredBuilds,
                },
              });
            }
            if (filteredRepairs.length > 0 || filteredBuilds.length > 0) {
              playOrderPlaced();
            }
            // Refresh local pending orders
            const { data: po } = await (supabase as any).from("player_orders")
              .select("id, order_type, order_json")
              .eq("game_id", gameId).eq("player_id", playerId).eq("turn_number", turnNumber)
              .filter("order_json->>fleet_id", "eq", fleet.fleet_id);
            setPendingOrders(((po as any[]) || []) as PendingOrder[]);

            // Auto-fill replenish slider to top off supply (post-repair AND post-build).
            // Repairs cost 1 supply per HP; builds cost point_cost per ship.
            const repairCost = filteredRepairs.reduce((s, a) => s + (Number(a.amount) || 0), 0);
            const buildCost = filteredBuilds.reduce((s, b) => {
              const ext = shipTypeExtras.get(b.ship_type_id);
              return s + (ext?.point_cost ?? 0) * (Number(b.quantity) || 0);
            }, 0);
            const newProjected = Math.max(0, currentSupply - repairCost - buildCost);
            const newDelta = Math.max(0, maxSupply - newProjected);
            setReplenishAmount(newDelta);
            await persistReplenishAmount(newDelta);

            onOrdersChanged?.();
            setRepairOpen(false);
          }}
        />
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
          listEachShip
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
    <div className="flex items-center justify-between text-xs">
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

/**
 * Generic modal popup for fleet logistics actions (Replenish / Repair).
 * Body is intentionally blank for now — content will be filled in next.
 */
function FleetActionPopup({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-senate-dark/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative w-[420px] max-w-[90vw] bg-marble border-2 border-bronze rounded-sm shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-2 border-b border-bronze/40 bg-marble-dark">
          <h3 className="text-sm font-heading font-bold uppercase tracking-wider text-bronze-dark">
            {title}
          </h3>
          <button
            onClick={onClose}
            className="text-bronze-dark hover:text-crimson font-bold text-lg leading-none px-1"
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <div className="p-6 min-h-[160px]" />
      </div>
    </div>
  );
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

// ─────────────────────────────────────────────────────────────────────────────
// Repair popup
// ─────────────────────────────────────────────────────────────────────────────

export interface RepairAssignment {
  ship_id: string;
  amount: number;
}

interface RepairPopupProps {
  ships: FleetShipRow[];
  availableRepair: number;
  availableSupply: number;
  existingAssignments: RepairAssignment[];
  /** Build-strikecraft items already queued (to seed the popup). */
  existingBuildItems: BuildItem[];
  /** Selectable strikecraft (FL/FH/GS) for new build orders. */
  strikecraftCatalog: StrikecraftCatalogEntry[];
  fighterCap: number;
  fighterUsed: number;
  gunshipCap: number;
  gunshipUsed: number;
  onClose: () => void;
  onSave: (assignments: RepairAssignment[], buildItems: BuildItem[]) => void | Promise<void>;
}

interface RepairRow {
  ship_id: string;
  ship_name: string;
  ship_display_id: string;
  hull_class: string;
  current_hp: number;
  max_hp: number;
  missing: number;
  crippled: boolean;
  amount: number;
}

function RepairPopup({
  ships,
  availableRepair,
  availableSupply,
  existingAssignments,
  existingBuildItems,
  strikecraftCatalog,
  fighterCap,
  fighterUsed,
  gunshipCap,
  gunshipUsed,
  onClose,
  onSave,
}: RepairPopupProps) {
  // Build initial damaged-ship list. Order = existing assignment order first,
  // then any other damaged ships appended (crippled first, then most-damaged).
  const damaged: RepairRow[] = (() => {
    const dmg = ships
      .filter(s => s.max_hp != null && s.current_hp != null && s.current_hp < s.max_hp)
      .map(s => {
        const cur = s.current_hp ?? 0;
        const max = s.max_hp ?? cur;
        return {
          ship_id: s.id,
          ship_name: s.ship_name || "Ship",
          ship_display_id: s.ship_display_id || "",
          hull_class: s.hull_class || "",
          current_hp: cur,
          max_hp: max,
          missing: Math.max(0, max - cur),
          crippled: !!s.crippled,
          amount: 0,
        } as RepairRow;
      });

    const byId = new Map(dmg.map(r => [r.ship_id, r]));
    const ordered: RepairRow[] = [];
    for (const a of existingAssignments) {
      const r = byId.get(a.ship_id);
      if (r) {
        r.amount = Math.max(0, Math.min(a.amount, r.missing));
        ordered.push(r);
        byId.delete(a.ship_id);
      }
    }
    const rest = Array.from(byId.values()).sort((a, b) => {
      if (a.crippled !== b.crippled) return a.crippled ? -1 : 1;
      return b.missing - a.missing;
    });
    return [...ordered, ...rest];
  })();

  const [rows, setRows] = useState<RepairRow[]>(damaged);
  // Build queue: array of { ship_type_id, quantity } seeded from any existing order.
  const [buildRows, setBuildRows] = useState<BuildItem[]>(
    existingBuildItems.length > 0
      ? existingBuildItems.map(b => ({ ship_type_id: b.ship_type_id, quantity: b.quantity }))
      : [],
  );

  const repairCap = Math.min(availableRepair, availableSupply);
  const totalAssigned = rows.reduce((s, r) => s + r.amount, 0);

  // Build queue cost (1 supply per point_cost) and slot consumption.
  const catalogById = new Map(strikecraftCatalog.map(c => [c.id, c]));
  const buildSupplyCost = buildRows.reduce((sum, b) => {
    const c = catalogById.get(b.ship_type_id);
    return sum + (c?.point_cost ?? 0) * (Number(b.quantity) || 0);
  }, 0);
  const buildFighterSlots = buildRows.reduce((sum, b) => {
    const c = catalogById.get(b.ship_type_id);
    return c && c.bucket === "fighter" ? sum + c.slots * b.quantity : sum;
  }, 0);
  const buildGunshipSlots = buildRows.reduce((sum, b) => {
    const c = catalogById.get(b.ship_type_id);
    return c && c.bucket === "gunship" ? sum + c.slots * b.quantity : sum;
  }, 0);

  // Supply must cover BOTH the repair queue AND the build queue.
  const repairAndBuildSupply = totalAssigned + buildSupplyCost;
  const supplyOver = repairAndBuildSupply > availableSupply;
  const remaining = Math.max(0, repairCap - totalAssigned);

  // Available remaining capacity for new builds.
  const fighterFree = Math.max(0, fighterCap - fighterUsed - buildFighterSlots);
  const gunshipFree = Math.max(0, gunshipCap - gunshipUsed - buildGunshipSlots);

  function move(index: number, dir: -1 | 1) {
    const j = index + dir;
    if (j < 0 || j >= rows.length) return;
    const next = rows.slice();
    [next[index], next[j]] = [next[j], next[index]];
    setRows(next);
  }

  function setAmount(index: number, raw: number) {
    const next = rows.slice();
    const row = next[index];
    const others = totalAssigned - row.amount;
    const maxForRow = Math.min(row.missing, Math.max(0, repairCap - others));
    row.amount = Math.max(0, Math.min(raw, maxForRow));
    setRows(next);
  }

  function maxRow(index: number) {
    const row = rows[index];
    const others = totalAssigned - row.amount;
    setAmount(index, Math.min(row.missing, Math.max(0, repairCap - others)));
  }

  function clearAll() {
    setRows(rows.map(r => ({ ...r, amount: 0 })));
  }

  function autoFill() {
    // Walk in priority order; greedily fill each ship up to its missing HP.
    let pool = repairCap;
    const next = rows.map(r => {
      const give = Math.max(0, Math.min(r.missing, pool));
      pool -= give;
      return { ...r, amount: give };
    });
    setRows(next);
  }

  // ── Build queue helpers ──
  function addBuildRow() {
    // Default to the cheapest catalog entry whose bucket still has capacity.
    const candidate = strikecraftCatalog.find(c =>
      c.bucket === "fighter" ? fighterFree >= c.slots : gunshipFree >= c.slots,
    ) ?? strikecraftCatalog[0];
    if (!candidate) return;
    setBuildRows([...buildRows, { ship_type_id: candidate.id, quantity: 1 }]);
  }
  function removeBuildRow(index: number) {
    const next = buildRows.slice();
    next.splice(index, 1);
    setBuildRows(next);
  }
  function setBuildShipType(index: number, shipTypeId: string) {
    const next = buildRows.slice();
    // Reset quantity to 1 when changing class so we don't accidentally over-cap.
    next[index] = { ship_type_id: shipTypeId, quantity: 1 };
    setBuildRows(next);
  }
  function setBuildQty(index: number, raw: number) {
    const next = buildRows.slice();
    const item = next[index];
    const c = catalogById.get(item.ship_type_id);
    if (!c) return;
    // Determine free slots in the relevant bucket *excluding this row*.
    const otherSlots = next.reduce((sum, b, i) => {
      if (i === index) return sum;
      const oc = catalogById.get(b.ship_type_id);
      if (!oc || oc.bucket !== c.bucket) return sum;
      return sum + oc.slots * b.quantity;
    }, 0);
    const free = c.bucket === "fighter"
      ? Math.max(0, fighterCap - fighterUsed - otherSlots)
      : Math.max(0, gunshipCap - gunshipUsed - otherSlots);
    const maxQty = Math.floor(free / c.slots);
    item.quantity = Math.max(0, Math.min(raw, maxQty));
    setBuildRows(next);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-senate-dark/60 backdrop-blur-sm p-3"
      onClick={onClose}
    >
      <div
        className="relative w-[480px] max-w-[96vw] max-h-[92vh] flex flex-col bg-ivory border-2 border-bronze rounded-sm shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-2 border-b border-bronze/40 bg-ivory-dark shrink-0">
          <h3 className="text-sm font-heading font-bold uppercase tracking-wider text-bronze-dark">
            Fleet Repair
          </h3>
          <button
            onClick={onClose}
            className="text-bronze-dark hover:text-crimson font-bold text-lg leading-none px-1"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="px-4 py-3 border-b border-bronze/30 bg-ivory-dark shrink-0">
          <div className="grid grid-cols-3 gap-2 text-xs font-bold text-foreground">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-bronze-dark font-semibold">Available Repair</div>
              <div className="font-bold text-sm text-[#272d34]">{availableRepair}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-bronze-dark font-semibold">Available Supply</div>
              <div className="font-bold text-sm text-[#272d34]">{availableSupply}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-bronze-dark font-semibold">Supply Used</div>
              <div className={`font-bold text-sm ${supplyOver ? "text-crimson" : "text-[#272d34]"}`}>
                {repairAndBuildSupply} / {availableSupply}
              </div>
              {buildSupplyCost > 0 && (
                <div className="text-[9px] font-semibold text-bronze-dark mt-0.5">
                  repair {totalAssigned} + build {buildSupplyCost}
                </div>
              )}
            </div>
          </div>
          <div className="flex gap-1.5 mt-2.5">
            <button
              onClick={autoFill}
              disabled={repairCap <= 0 || rows.length === 0}
              className="flex-1 h-7 rounded-sm border border-bronze/50 bg-ivory px-2 text-xs font-semibold hover:border-bronze disabled:opacity-50 disabled:cursor-not-allowed text-[#272d34]"
            >
              Auto-fill in priority
            </button>
            <button
              onClick={clearAll}
              disabled={totalAssigned === 0}
              className="flex-1 h-7 rounded-sm border border-bronze/50 bg-ivory px-2 text-xs font-semibold hover:border-bronze disabled:opacity-50 disabled:cursor-not-allowed text-[#272d34]"
            >
              Clear
            </button>
          </div>
        </div>

        <div className="overflow-y-auto p-3 space-y-2 grow">
          {rows.length === 0 && (
            <p className="text-xs text-bronze-dark italic">No damaged ships in this fleet.</p>
          )}
          {rows.map((r, i) => {
            const projected = r.current_hp + r.amount;
            return (
              <div
                key={r.ship_id}
                className={`border border-bronze/40 rounded-sm p-2 ${
                  r.crippled
                    ? "bg-crimson/15"
                    : "bg-yellow-200/40"
                }`}
              >
                <div className="flex items-start gap-2">
                  <div className="flex flex-col gap-1 shrink-0">
                    <button
                      onClick={() => move(i, -1)}
                      disabled={i === 0}
                      aria-label="Move up"
                      className="w-7 h-7 rounded-sm border border-bronze/60 bg-ivory font-bold text-sm leading-none hover:border-bronze disabled:opacity-30 text-[#272d34]"
                    >
                      ↑
                    </button>
                    <button
                      onClick={() => move(i, 1)}
                      disabled={i === rows.length - 1}
                      aria-label="Move down"
                      className="w-7 h-7 rounded-sm border border-bronze/60 bg-ivory font-bold text-sm leading-none hover:border-bronze disabled:opacity-30 text-[#272d34]"
                    >
                      ↓
                    </button>
                  </div>
                  <div className="grow min-w-0">
                    <div className="flex items-baseline justify-between gap-2">
                      <div className="text-xs font-bold text-foreground truncate">
                        <span className="text-bronze-dark mr-1">#{i + 1}</span>
                        {r.ship_name}
                        {r.ship_display_id && (
                          <span className="text-bronze-dark font-semibold ml-1">
                            [{r.ship_display_id}]
                          </span>
                        )}
                        {r.crippled && (
                          <span className="text-crimson/80 normal-case font-semibold ml-1">· Crippled</span>
                        )}
                      </div>
                      <div className="text-[10px] font-semibold text-foreground/85 uppercase tracking-wider shrink-0">{r.hull_class}</div>
                    </div>
                    <div className={`text-[11px] font-bold mt-0.5 ${r.crippled ? "text-crimson/80" : "text-amber-800"}`}>
                      Hull: {r.current_hp} / {r.max_hp}
                      {r.amount > 0 && (
                        <span className="ml-1 text-foreground">→ {projected}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 mt-1.5">
                      <button
                        onClick={() => setAmount(i, r.amount - 1)}
                        disabled={r.amount <= 0}
                        className="w-7 h-7 rounded-sm border border-bronze/60 bg-ivory font-bold text-sm leading-none hover:border-bronze disabled:opacity-30 text-[#272d34]"
                        aria-label="Decrease"
                      >
                        −
                      </button>
                      <input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        max={r.missing}
                        value={r.amount}
                        onChange={(e) => setAmount(i, Number(e.target.value) || 0)}
                        className="w-14 h-7 rounded-sm border border-bronze/60 bg-ivory px-1 text-center text-xs font-bold text-[#272d34]"
                      />
                      <button
                        onClick={() => setAmount(i, r.amount + 1)}
                        disabled={r.amount >= r.missing || remaining <= 0}
                        className="w-7 h-7 rounded-sm border border-bronze/60 bg-ivory font-bold text-sm leading-none hover:border-bronze disabled:opacity-30 text-[#272d34]"
                        aria-label="Increase"
                      >
                        +
                      </button>
                      <button
                        onClick={() => maxRow(i)}
                        disabled={r.amount >= r.missing || (repairCap - totalAssigned + r.amount) <= r.amount}
                        className="h-7 px-2 rounded-sm border border-bronze/60 bg-ivory font-bold text-[10px] uppercase tracking-wider hover:border-bronze disabled:opacity-30 text-[#272d34]"
                      >
                        Max
                      </button>
                      <div className="ml-auto text-[10px] font-semibold text-bronze-dark">
                        missing {r.missing}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

          {(fighterCap > 0 || gunshipCap > 0) && (
            <div className="pt-2 mt-2 border-t border-bronze/40 space-y-2">
              <div className="flex items-baseline justify-between">
                <h4 className="text-[11px] font-heading font-bold uppercase tracking-wider text-bronze-dark">
                  Build Strikecraft
                </h4>
                <div className="text-[10px] font-semibold text-bronze-dark space-x-2">
                  {fighterCap > 0 && (
                    <span className={fighterFree < 0 ? "text-crimson" : ""}>
                      Fighters {fighterUsed + buildFighterSlots}/{fighterCap}
                    </span>
                  )}
                  {gunshipCap > 0 && (
                    <span className={gunshipFree < 0 ? "text-crimson" : ""}>
                      Gunships {gunshipUsed + buildGunshipSlots}/{gunshipCap}
                    </span>
                  )}
                </div>
              </div>

              {buildRows.length === 0 && (
                <p className="text-[11px] text-bronze-dark italic">
                  No builds queued. Empty fighter or gunship capacity can be filled here at a cost of the ship's point value in supply.
                </p>
              )}

              {buildRows.map((b, i) => {
                const c = catalogById.get(b.ship_type_id);
                const cost = (c?.point_cost ?? 0) * b.quantity;
                // Per-row max: free slots in this bucket (excluding self), divided by slots-per-ship.
                const otherSlots = buildRows.reduce((sum, x, j) => {
                  if (j === i || !c) return sum;
                  const xc = catalogById.get(x.ship_type_id);
                  if (!xc || xc.bucket !== c.bucket) return sum;
                  return sum + xc.slots * x.quantity;
                }, 0);
                const bucketCap = c?.bucket === "fighter" ? fighterCap : gunshipCap;
                const bucketUsed = c?.bucket === "fighter" ? fighterUsed : gunshipUsed;
                const free = c ? Math.max(0, bucketCap - bucketUsed - otherSlots) : 0;
                const maxQty = c ? Math.floor(free / c.slots) : 0;
                return (
                  <div
                    key={i}
                    className="border border-bronze/40 rounded-sm p-2 bg-bronze/5"
                  >
                    <div className="flex items-center gap-1.5">
                      <select
                        value={b.ship_type_id}
                        onChange={(e) => setBuildShipType(i, e.target.value)}
                        className="grow min-w-0 h-7 rounded-sm border border-bronze/60 bg-ivory px-1 text-[11px] font-semibold text-[#272d34]"
                      >
                        {strikecraftCatalog.map(s => (
                          <option key={s.id} value={s.id}>
                            {s.name} [{s.class}] · {s.point_cost} supply
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={() => setBuildQty(i, b.quantity - 1)}
                        disabled={b.quantity <= 0}
                        className="w-7 h-7 rounded-sm border border-bronze/60 bg-ivory font-bold text-sm leading-none hover:border-bronze disabled:opacity-30 text-[#272d34]"
                        aria-label="Decrease"
                      >
                        −
                      </button>
                      <input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        max={maxQty}
                        value={b.quantity}
                        onChange={(e) => setBuildQty(i, Number(e.target.value) || 0)}
                        className="w-12 h-7 rounded-sm border border-bronze/60 bg-ivory px-1 text-center text-xs font-bold text-[#272d34]"
                      />
                      <button
                        onClick={() => setBuildQty(i, b.quantity + 1)}
                        disabled={b.quantity >= maxQty}
                        className="w-7 h-7 rounded-sm border border-bronze/60 bg-ivory font-bold text-sm leading-none hover:border-bronze disabled:opacity-30 text-[#272d34]"
                        aria-label="Increase"
                      >
                        +
                      </button>
                      <button
                        onClick={() => removeBuildRow(i)}
                        className="w-7 h-7 rounded-sm border border-crimson/50 bg-ivory font-bold text-sm leading-none hover:border-crimson text-crimson"
                        aria-label="Remove"
                      >
                        ×
                      </button>
                    </div>
                    <div className="text-[10px] font-semibold text-bronze-dark mt-1">
                      {c?.bucket === "fighter" ? "fighter" : "gunship"} · slots {(c?.slots ?? 0) * b.quantity} · {cost} supply
                    </div>
                  </div>
                );
              })}

              <button
                onClick={addBuildRow}
                disabled={(fighterFree <= 0 && gunshipFree <= 0) || strikecraftCatalog.length === 0}
                className="w-full h-7 rounded-sm border border-bronze/50 bg-ivory px-2 text-[11px] font-semibold hover:border-bronze disabled:opacity-50 disabled:cursor-not-allowed text-[#272d34]"
              >
                + Add Build Order
              </button>
            </div>
          )}
        </div>

        <div className="flex gap-2 px-4 py-3 border-t border-bronze/40 bg-ivory-dark shrink-0">
          <button
            onClick={onClose}
            className="flex-1 h-9 rounded-sm border border-bronze/50 bg-ivory px-2 text-xs font-semibold hover:border-bronze text-[#272d34]"
          >
            Cancel
          </button>
          <button
            onClick={() => onSave(
              rows.map(r => ({ ship_id: r.ship_id, amount: r.amount })),
              buildRows.filter(b => b.quantity > 0),
            )}
            disabled={totalAssigned > repairCap || supplyOver}
            className="flex-1 h-9 rounded-sm border-2 border-bronze bg-bronze/20 px-2 text-xs text-bronze-dark font-heading font-bold uppercase tracking-wider hover:bg-bronze/30 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Save Order
          </button>
        </div>
      </div>
    </div>
  );
}
