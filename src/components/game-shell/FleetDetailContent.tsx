import { useEffect, useState } from "react";
import { SENSOR_RADIUS } from "@/lib/turnProcessor/phases/visibility";
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
// Foreground (darker) colors used for the owner-color dot in fleet headers,
// matching the foreground_color stored on each faction row in the DB.
const PROVINCE_FACTION_COLORS: Record<string, string> = {
  PROVINCE_1: "#7c3a08",
  PROVINCE_2: "#075a6a",
  PROVINCE_3: "#705604",
  PROVINCE_4: "#581c87",
  PROVINCE_5: "#9d174d",
  PROVINCE_6: "#0b5a52",
  Synod_int1: "#557e04",
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
  "Flank", "Outflank", "Skirmish", "Cover Retreat", "Rear", "Attack Planet", "Transfer",
];

interface FleetDetail {
  id: string;
  name: string;
  readiness: number;
  next_readiness: number | null;
  special1_role: string;
  special2_role: string;
  current_supply: number;
  current_ground_invasion: number;
}

/** Per-ship-type capacity + cost data needed for strikecraft build orders. */
interface ShipTypeExtra {
  fighter_bay: number;
  fighter_storage: number;
  gun_ship_link: number;
  gunship_storage: number;
  ground_invasion: number;
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
  // Ships currently in transit toward THIS fleet (from production or transfer).
  const [incomingTransit, setIncomingTransit] = useState<Array<{ id: string; ship_type_id: string; quantity: number; virt_x: number; virt_y: number; eta: number; ship_name: string }>>([]);
  // Ships still being built (in system_ship_production queue) destined for THIS fleet.
  const [incomingBuild, setIncomingBuild] = useState<Array<{ id: string; ship_type_id: string; quantity: number; points_remaining: number; system_id: number; system_name: string; ship_name: string }>>([]);

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
        .select("id, name, ship_id, class, hull_class, hull, point_cost, fighter_bay, fighter_storage, gun_ship_link, gunship_storage, ground_invasion");
      if (cancelled || !data) return;
      const extras = new Map<string, ShipTypeExtra>();
      const catalog: StrikecraftCatalogEntry[] = [];
      for (const r of data as any[]) {
        extras.set(r.id, {
          fighter_bay: Number(r.fighter_bay) || 0,
          fighter_storage: Number(r.fighter_storage) || 0,
          gun_ship_link: Number(r.gun_ship_link) || 0,
          gunship_storage: Number(r.gunship_storage) || 0,
          ground_invasion: Number(r.ground_invasion) || 0,
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
          .select("id, name, readiness, next_readiness, special1_role, special2_role, current_supply, current_ground_invasion")
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
          current_ground_invasion: (f as any).current_ground_invasion ?? 0,
        });
      } else {
        setDetail(null);
      }
      const rows: FleetShipRow[] = (fs || []).map((r: any) => {
        const st = shipTypes.find(s => s.id === r.ship_type_id);
        // Joined ship_types row from the DB query — authoritative source for hull.
        const stJoined = r.ship_types || null;
        const maxHp = (stJoined?.hull ?? (st as any)?.hull ?? null);
        const ext = shipTypeExtras.get(r.ship_type_id);
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
          ship_class: ext?.class || (st as any)?.class || "",
          fighter_bay: ext?.fighter_bay ?? 0,
          gun_ship_link: ext?.gun_ship_link ?? 0,
          ground_invasion: ext?.ground_invasion ?? 0,
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

      // Load ships currently in transit toward this fleet.
      const { data: transitRows } = await (supabase as any)
        .from("ships_in_transit")
        .select("id, ship_type_id, quantity, virt_x, virt_y")
        .eq("destination_fleet_id", fleet.fleet_id);
      if (!cancelled) {
        const incoming = (transitRows || []).map((t: any) => {
          const st = shipTypes.find(s => s.id === t.ship_type_id) as any;
          const speed = Math.max(1, Number(st?.map_speed) || 1);
          const [a1, a2, a3] = (() => {
            const x = t.virt_x | 0, y = t.virt_y | 0;
            const xx = x - (y - (y & 1)) / 2;
            const zz = y;
            return [xx, -xx - zz, zz];
          })();
          const [b1, b2, b3] = (() => {
            const x = fleet.hex_x | 0, y = fleet.hex_y | 0;
            const xx = x - (y - (y & 1)) / 2;
            const zz = y;
            return [xx, -xx - zz, zz];
          })();
          const dist = Math.max(Math.abs(a1 - b1), Math.abs(a2 - b2), Math.abs(a3 - b3));
          return {
            id: t.id,
            ship_type_id: t.ship_type_id,
            quantity: Number(t.quantity) || 0,
            virt_x: t.virt_x,
            virt_y: t.virt_y,
            eta: Math.max(1, Math.ceil(dist / speed)),
            ship_name: st?.name || "Ship",
          };
        });
        setIncomingTransit(incoming);
      }

      // Load ships still being constructed and destined for this fleet.
      const { data: buildRows } = await (supabase as any)
        .from("system_ship_production")
        .select("id, ship_type_id, quantity, points_remaining, system_id")
        .eq("destination_fleet_id", fleet.fleet_id);
      if (!cancelled) {
        // Resolve system names from games.map_data_json (already in mapState upstream),
        // but here we just look up by system_id from the ship name list when available.
        const sysIds = Array.from(new Set((buildRows || []).map((r: any) => r.system_id)));
        let sysNames: Record<number, string> = {};
        if (sysIds.length > 0) {
          // Best-effort lookup from game_fleets.system_id is not enough; fetch from games map_data_json upstream is complex.
          // Fall back to "System #N" naming.
          sysIds.forEach((id: number) => { sysNames[id] = `System #${id}`; });
        }
        const builds = (buildRows || []).map((r: any) => {
          const st = shipTypes.find(s => s.id === r.ship_type_id) as any;
          return {
            id: r.id,
            ship_type_id: r.ship_type_id,
            quantity: Number(r.quantity) || 0,
            points_remaining: Number(r.points_remaining) || 0,
            system_id: r.system_id,
            system_name: sysNames[r.system_id] || `System #${r.system_id}`,
            ship_name: st?.name || "Ship",
          };
        });
        setIncomingBuild(builds);
      }

      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [sourceId, shipTypes, orderContext, fleet.fleet_id, shipTypeExtras]);

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
  // Crippled non-strikecraft ships do NOT contribute bays/links/repair/sensors,
  // but DO still hold supply and storage. Crippled strikecraft still occupy
  // a slot (they're parked, not destroyed) and still count against capacity.
  // Crippled ships also move at half map_speed.
  let fighterCap = 0, fighterUsed = 0, gunshipCap = 0, gunshipUsed = 0;
  let fighterStorage = 0, gunshipStorage = 0;
  let maxGroundInvasion = 0;
  for (const s of ships) {
    const st = shipTypes.find(t => t.id === s.ship_type_id);
    if (!st) continue;
    const isCrippled = !!s.crippled;
    baseMaintenance += (st.maintenance ?? 0) * s.quantity;
    // Crippled ships can't operate their repair pods.
    const repairContribution = isCrippled ? 0 : (st.repair_pod ?? 0) * s.quantity;
    totalRepair += repairContribution;
    if (s.tactical_group === "Rear") availableRepair += repairContribution;
    // Supply pods still hold supply even when crippled.
    totalSupply += (st.supply_pod ?? 0) * s.quantity;
    // Crippled ships move at half map_speed (round up, min 1 if originally >0).
    const rawSpeed = st.map_speed ?? 0;
    const effSpeed = rawSpeed > 0 && isCrippled ? Math.max(1, Math.ceil(rawSpeed / 2)) : rawSpeed;
    if (effSpeed > 0 && effSpeed < minMapSpeed) minMapSpeed = effSpeed;

    const ext = shipTypeExtras.get(s.ship_type_id);
    if (ext) {
      // Crippled non-strikecraft can't deploy → bays/links don't contribute capacity.
      // Storage (passive holds) still counts.
      if (!isCrippled) {
        fighterCap += ext.fighter_bay * s.quantity;
        gunshipCap += ext.gun_ship_link * s.quantity;
        // Ground invasion capacity contributed only by non-crippled ships.
        maxGroundInvasion += ext.ground_invasion * s.quantity;
      }
      fighterStorage += ext.fighter_storage * s.quantity;
      gunshipStorage += ext.gunship_storage * s.quantity;
      // Strikecraft themselves still occupy a slot whether crippled or not.
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

  // Build-ground-invasion orders consume supply 1:1 (1 supply per GI unit).
  const pendingGroundInvasionOrder = pendingOrders.find(
    o => o.order_type === "other" && o.order_json?.kind === "build_ground_invasion",
  );
  const pendingGroundInvasionAmount = Math.max(
    0,
    Math.floor(Number(pendingGroundInvasionOrder?.order_json?.amount) || 0),
  );

  // ── Ground invasion (max = sum of ship.ground_invasion across non-crippled ships) ──
  const currentGroundInvasion = Math.min(detail.current_ground_invasion, maxGroundInvasion);
  const projectedGroundInvasion = Math.min(
    maxGroundInvasion,
    currentGroundInvasion + pendingGroundInvasionAmount,
  );

  const pendingTotalCost = pendingRepairCost + pendingBuildCost + pendingGroundInvasionAmount;
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

  // Standing movement waypoint set by a prior turn's move that didn't reach.
  // Only surfaced when there's no fresh move order this turn (a fresh order
  // visually OVERRIDES the waypoint).
  const hasStandingWaypoint =
    !moveOrder &&
    typeof fleet.dest_x === "number" &&
    typeof fleet.dest_y === "number" &&
    !(fleet.dest_x === fleet.hex_x && fleet.dest_y === fleet.hex_y);

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
  const cancelStandingWaypoint = async () => {
    await (supabase as any)
      .from("game_fleets")
      .update({ dest_x: null, dest_y: null, dest_set_turn: null })
      .eq("fleet_id", fleet.source_fleet_id);
    // Mutate the in-memory MapFleet so the UI reflects the change immediately
    // (the parent's mapState holds a reference to the same fleet object).
    fleet.dest_x = null;
    fleet.dest_y = null;
    fleet.dest_set_turn = null;
    onOrdersChanged?.();
  };

  const attackOrderLabel = (() => {
    if (!attackOrder) return null;
    const oj = attackOrder.order_json || {};
    // Planet-targeted attack
    if (oj.target_system_id != null) {
      const sys = allSystems.find(s => s.system_id === Number(oj.target_system_id));
      const planetName = sys?.system_name ?? "Unknown";
      if (!sys) return `Attack → ${planetName}`;
      const pop = sys.current_population ?? 0;
      if (pop <= 0) return `Colonize → ${planetName}`;
      if (sys.owner === fleet.owner_classification) return `Defend → ${planetName}`;
      return `Invade → ${planetName}`;
    }
    // Fleet-targeted attack
    const targetName =
      allFleets.find(f => f.fleet_id === oj.target_fleet_id)?.fleet_name
      ?? oj.target_fleet_id
      ?? "Unknown";
    return `Attack → ${targetName}`;
  })();

  // Only one active order per fleet — waypoint counts as an active continuation.
  const activeOrder: "move" | "attack" | "waypoint" | null =
    moveOrder ? "move" : attackOrder ? "attack" : hasStandingWaypoint ? "waypoint" : null;
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

  // ── Transfer target order persistence ──
  const transferOrder = pendingOrders.find(
    o => o.order_type === "other" && o.order_json?.kind === "transfer_ships",
  );
  const transferTarget: { kind: "fleet" | "system"; id: string } | null = transferOrder
    ? (transferOrder.order_json?.target_fleet_id
        ? { kind: "fleet", id: String(transferOrder.order_json.target_fleet_id) }
        : transferOrder.order_json?.target_system_id != null
          ? { kind: "system", id: String(transferOrder.order_json.target_system_id) }
          : null)
    : null;

  const persistTransferTarget = async (target: { kind: "fleet" | "system"; id: string } | null) => {
    if (!orderContext) return;
    const { gameId, playerId, turnNumber } = orderContext;
    await (supabase as any).from("player_orders")
      .delete()
      .eq("game_id", gameId).eq("player_id", playerId).eq("turn_number", turnNumber)
      .eq("order_type", "other")
      .filter("order_json->>fleet_id", "eq", fleet.fleet_id)
      .filter("order_json->>kind", "eq", "transfer_ships");
    let inserted: any = null;
    if (target) {
      const payload: any = { fleet_id: fleet.fleet_id, kind: "transfer_ships" };
      if (target.kind === "fleet") payload.target_fleet_id = target.id;
      else payload.target_system_id = Number(target.id);
      const { data } = await (supabase as any).from("player_orders").insert({
        game_id: gameId, player_id: playerId, turn_number: turnNumber,
        order_type: "other", order_json: payload,
      }).select("*").single();
      inserted = data;
      playOrderPlaced();
    }
    setPendingOrders(prev => {
      const filtered = prev.filter(o => !(o.order_type === "other" && o.order_json?.kind === "transfer_ships"));
      return inserted ? [...filtered, inserted] : filtered;
    });
    onOrdersChanged?.();
  };

  // Any friendly fleet (excluding self) — eligible transfer targets.
  const friendlyFleets = allFleets
    .filter(f =>
      f.fleet_id !== fleet.fleet_id &&
      f.owner_classification === fleet.owner_classification
    )
    .sort((a, b) => a.fleet_name.localeCompare(b.fleet_name));
  // Any owned system — planet drop-off.
  const ownedSystems = allSystems
    .filter(s => s.owner === fleet.owner_classification)
    .sort((a, b) => a.system_name.localeCompare(b.system_name));
  const transferActive = detail.special1_role === "Transfer" || detail.special2_role === "Transfer";

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
          {(fighterCap > 0 || gunshipCap > 0 || fighterStorage > 0 || gunshipStorage > 0) && (
            <>
              {fighterCap > 0 && <Row label="Fighter Bays" value={`${fighterUsed} / ${fighterCap}`} />}
              {fighterStorage > 0 && <Row label="Fighter Storage" value={`${fighterStorage}`} />}
              {gunshipCap > 0 && <Row label="Gunship Bays" value={`${gunshipUsed} / ${gunshipCap}`} />}
              {gunshipStorage > 0 && <Row label="Gunship Storage" value={`${gunshipStorage}`} />}
            </>
          )}
          {maxGroundInvasion > 0 && (
            <Row
              label="Ground Invasion"
              value={
                pendingGroundInvasionAmount > 0
                  ? `${currentGroundInvasion} (${projectedGroundInvasion}) / ${maxGroundInvasion}`
                  : `${currentGroundInvasion} / ${maxGroundInvasion}`
              }
            />
          )}
          <Row label="Map Speed" value={`${mapSpeedDisplay}`} />
          <Row label="Attack Range" value={`${Math.floor(mapSpeedDisplay / 2)}`} />
          <Row label="Ships" value={`${totalShips}`} />
          
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
          {hasStandingWaypoint && (
            <div className="text-xs text-bronze-dark font-bold">
              Move → ({fleet.dest_x}, {fleet.dest_y})
              <span className="ml-1 font-semibold text-bronze-dark/70">— continuing from turn {fleet.dest_set_turn ?? "?"}</span>
            </div>
          )}
          {attackOrder && (
            <div className="text-xs text-bronze-dark font-bold">
              {attackOrderLabel}
            </div>
          )}

          {canEdit && onStartTargeting && (
            <div className="pt-2 border-t border-border space-y-1.5">
              {activeOrder ? (
                <button
                  onClick={
                    activeOrder === "move" ? cancelMoveOrder
                    : activeOrder === "attack" ? cancelAttackOrder
                    : cancelStandingWaypoint
                  }
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
                max={maxSupply}
                step={1}
                value={projectedSupply + Math.min(replenishAmount, supplyDelta)}
                disabled={supplyDelta <= 0}
                onChange={(e) => {
                  const total = Number(e.target.value);
                  const next = Math.max(0, Math.min(supplyDelta, total - projectedSupply));
                  setReplenishAmount(next);
                }}
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
              const canBuildGroundInvasion = maxGroundInvasion > currentGroundInvasion;
              const disabled = !canReplenish && !canRepair && !canBuild && !canBuildGroundInvasion;
              return (
                <button
                  onClick={() => {
                    if (canRepair || canBuild || canBuildGroundInvasion) setRepairOpen(true);
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

      {repairOpen && (
        <RepairPopup
          ships={ships}
          availableRepair={availableRepair}
          availableSupply={currentSupply}
          existingAssignments={(pendingOrders.find(
            o => o.order_type === "other" && o.order_json?.kind === "repair_fleet",
          )?.order_json?.assignments as RepairAssignment[] | undefined) ?? []}
          existingBuildItems={pendingBuildItems}
          existingGroundInvasionAmount={pendingGroundInvasionAmount}
          strikecraftCatalog={strikecraftCatalog}
          fighterCap={fighterCap}
          fighterUsed={fighterUsed}
          gunshipCap={gunshipCap}
          gunshipUsed={gunshipUsed}
          maxGroundInvasion={maxGroundInvasion}
          currentGroundInvasion={currentGroundInvasion}
          onClose={() => setRepairOpen(false)}
          onSave={async (assignments, buildItems, groundInvasionAmount) => {
            if (!orderContext) return;
            const { gameId, playerId, turnNumber } = orderContext;
            // Clear repair, build, and ground-invasion orders for this fleet+turn,
            // then re-insert any non-empty queues.
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
            await (supabase as any).from("player_orders")
              .delete()
              .eq("game_id", gameId).eq("player_id", playerId).eq("turn_number", turnNumber)
              .eq("order_type", "other")
              .filter("order_json->>fleet_id", "eq", fleet.fleet_id)
              .filter("order_json->>kind", "eq", "build_ground_invasion");

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
            const giAmount = Math.max(0, Math.floor(groundInvasionAmount || 0));
            if (giAmount > 0) {
              await (supabase as any).from("player_orders").insert({
                game_id: gameId, player_id: playerId, turn_number: turnNumber,
                order_type: "other",
                order_json: {
                  fleet_id: fleet.fleet_id,
                  kind: "build_ground_invasion",
                  amount: giAmount,
                },
              });
            }
            if (filteredRepairs.length > 0 || filteredBuilds.length > 0 || giAmount > 0) {
              playOrderPlaced();
            }
            // Refresh local pending orders
            const { data: po } = await (supabase as any).from("player_orders")
              .select("id, order_type, order_json")
              .eq("game_id", gameId).eq("player_id", playerId).eq("turn_number", turnNumber)
              .filter("order_json->>fleet_id", "eq", fleet.fleet_id);
            setPendingOrders(((po as any[]) || []) as PendingOrder[]);

            // Auto-fill replenish slider to top off supply (post-repair, post-build, post-GI).
            const repairCost = filteredRepairs.reduce((s, a) => s + (Number(a.amount) || 0), 0);
            const buildCost = filteredBuilds.reduce((s, b) => {
              const ext = shipTypeExtras.get(b.ship_type_id);
              return s + (ext?.point_cost ?? 0) * (Number(b.quantity) || 0);
            }, 0);
            const newProjected = Math.max(0, currentSupply - repairCost - buildCost - giAmount);
            const newDelta = Math.max(0, maxSupply - newProjected);
            setReplenishAmount(newDelta);
            await persistReplenishAmount(newDelta);

            onOrdersChanged?.();
            setRepairOpen(false);
          }}
        />
      )}

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
          {transferActive && (
            <div className="border-t border-border pt-2 mt-1 space-y-1">
              <label className="text-[10px] font-heading uppercase tracking-wider text-bronze-dark font-bold block">
                Transfer Target
              </label>
              <select
                disabled={!canEdit}
                value={transferTarget ? `${transferTarget.kind}:${transferTarget.id}` : ""}
                onChange={(e) => {
                  const v = e.target.value;
                  if (!v) { persistTransferTarget(null); return; }
                  const [kind, id] = v.split(":") as ["fleet" | "system", string];
                  persistTransferTarget({ kind, id });
                }}
                className="h-8 w-full rounded-sm border border-input bg-background px-2 text-xs text-foreground disabled:opacity-60"
              >
                <option value="">— pick a target —</option>
                {ownedSystems.length > 0 && (
                  <optgroup label="Owned planets">
                    {ownedSystems.map(s => (
                      <option key={s.system_id} value={`system:${s.system_id}`}>
                        🪐 {s.system_name}
                      </option>
                    ))}
                  </optgroup>
                )}
                {friendlyFleets.length > 0 && (
                  <optgroup label="Friendly fleets">
                    {friendlyFleets.map(f => (
                      <option key={f.fleet_id} value={`fleet:${f.fleet_id}`}>
                        ⚓ {f.fleet_name}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
              {ownedSystems.length === 0 && friendlyFleets.length === 0 && (
                <p className="text-[10px] text-crimson italic">
                  No friendly fleets or owned planets available.
                </p>
              )}
              <p className="text-[10px] text-muted-foreground italic">
                Drag ships into the <span className="text-bronze font-semibold">Transfer</span> group below; they will move to the target at end of turn.
              </p>
            </div>
          )}
        </div>
      </ImperialCard>

      {(incomingTransit.length > 0 || incomingBuild.length > 0) && (
        <ImperialCard title="Incoming Reinforcements">
          <div className="space-y-1">
            {incomingTransit.map(t => (
              <div key={t.id} className="flex items-center justify-between text-[11px]">
                <span className="text-senate-dark font-semibold">
                  {t.quantity}× {t.ship_name}
                </span>
                <span className="text-bronze-dark font-heading uppercase tracking-wider text-[10px]">
                  In Transit · ETA {t.eta} turn{t.eta === 1 ? "" : "s"} · ({t.virt_x}, {t.virt_y})
                </span>
              </div>
            ))}
            {incomingBuild.map(b => (
              <div key={b.id} className="flex items-center justify-between gap-2 text-[11px]">
                <span className="text-senate-dark font-semibold whitespace-nowrap">
                  {b.quantity}× {b.ship_name}
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-bronze-dark font-heading uppercase tracking-wider text-[10px]">
                    Building · {b.points_remaining} pts · {b.system_name}
                  </span>
                  {canEdit && (
                    <select
                      className="text-[10px] bg-marble border border-bronze/40 px-1 py-0.5 font-body"
                      value={fleet.fleet_id}
                      onChange={async (e) => {
                        const newDest = e.target.value;
                        if (newDest === fleet.fleet_id) return;
                        await (supabase as any)
                          .from("system_ship_production")
                          .update({ destination_fleet_id: newDest })
                          .eq("id", b.id);
                        setIncomingBuild(prev => prev.filter(x => x.id !== b.id));
                        onOrdersChanged?.();
                      }}
                    >
                      <option value={fleet.fleet_id}>{fleet.fleet_name} (current)</option>
                      {friendlyFleets.map(f => (
                        <option key={f.fleet_id} value={f.fleet_id}>{f.fleet_name}</option>
                      ))}
                    </select>
                  )}
                </div>
              </div>
            ))}
          </div>
        </ImperialCard>
      )}

      <ImperialCard title="Composition">
        <FleetCompositionEditor
          ships={ships}
          setShips={setShips}
          shipTypes={shipTypes}
          canEdit={canEdit}
          special1Role={detail.special1_role}
          special2Role={detail.special2_role}
          listEachShip
          onCompositionChanged={onOrdersChanged}
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
                  <span className="font-semibold text-accent truncate">
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
  /** Ground-invasion units already queued (to seed the popup). */
  existingGroundInvasionAmount: number;
  /** Selectable strikecraft (FL/FH/GS) for new build orders. */
  strikecraftCatalog: StrikecraftCatalogEntry[];
  fighterCap: number;
  fighterUsed: number;
  gunshipCap: number;
  gunshipUsed: number;
  /** Maximum ground-invasion units this fleet can carry. */
  maxGroundInvasion: number;
  /** Current ground-invasion units already loaded on this fleet. */
  currentGroundInvasion: number;
  onClose: () => void;
  onSave: (
    assignments: RepairAssignment[],
    buildItems: BuildItem[],
    groundInvasionAmount: number,
  ) => void | Promise<void>;
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
  existingGroundInvasionAmount,
  strikecraftCatalog,
  fighterCap,
  fighterUsed,
  gunshipCap,
  gunshipUsed,
  maxGroundInvasion,
  currentGroundInvasion,
  onClose,
  onSave,
}: RepairPopupProps) {
  // ── Build the initial unified queue ──
  // Each queue item is either a "repair" row or a "build" row. Order within
  // the queue is the user-controlled priority used by Auto-fill.
  type QueueItem =
    | { kind: "repair"; repair: RepairRow }
    | { kind: "build"; build: BuildItem };

  const initialQueue: QueueItem[] = (() => {
    // Build damaged-ship repair candidates.
    const dmg: RepairRow[] = ships
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

    const repairById = new Map(dmg.map(r => [r.ship_id, r]));
    const queue: QueueItem[] = [];

    // 1. Existing repair assignments first, in their saved order.
    for (const a of existingAssignments) {
      const r = repairById.get(a.ship_id);
      if (r) {
        r.amount = Math.max(0, Math.min(a.amount, r.missing));
        queue.push({ kind: "repair", repair: r });
        repairById.delete(a.ship_id);
      }
    }
    // 2. Existing build items next, in their saved order.
    for (const b of existingBuildItems) {
      queue.push({ kind: "build", build: { ship_type_id: b.ship_type_id, quantity: b.quantity } });
    }
    // 3. Any remaining damaged ships (not previously assigned), crippled first
    //    then most-damaged. Appended at the end so the user can promote them.
    const rest = Array.from(repairById.values()).sort((a, b) => {
      if (a.crippled !== b.crippled) return a.crippled ? -1 : 1;
      return b.missing - a.missing;
    });
    for (const r of rest) queue.push({ kind: "repair", repair: r });

    return queue;
  })();

  const [queue, setQueue] = useState<QueueItem[]>(initialQueue);
  // Ground-invasion units to load this turn (1 supply per unit). Capped at
  // (maxGroundInvasion - currentGroundInvasion).
  const groundInvasionDelta = Math.max(0, maxGroundInvasion - currentGroundInvasion);
  const [groundInvasionAmount, setGroundInvasionAmount] = useState<number>(
    Math.max(0, Math.min(existingGroundInvasionAmount || 0, groundInvasionDelta)),
  );

  // ── Derived totals ──
  const catalogById = new Map(strikecraftCatalog.map(c => [c.id, c]));

  const repairTotal = queue.reduce(
    (s, q) => s + (q.kind === "repair" ? q.repair.amount : 0),
    0,
  );
  const buildSupplyCost = queue.reduce((s, q) => {
    if (q.kind !== "build") return s;
    const c = catalogById.get(q.build.ship_type_id);
    return s + (c?.point_cost ?? 0) * (Number(q.build.quantity) || 0);
  }, 0);
  const buildFighterSlots = queue.reduce((s, q) => {
    if (q.kind !== "build") return s;
    const c = catalogById.get(q.build.ship_type_id);
    return c && c.bucket === "fighter" ? s + c.slots * q.build.quantity : s;
  }, 0);
  const buildGunshipSlots = queue.reduce((s, q) => {
    if (q.kind !== "build") return s;
    const c = catalogById.get(q.build.ship_type_id);
    return c && c.bucket === "gunship" ? s + c.slots * q.build.quantity : s;
  }, 0);

  const repairAndBuildSupply = repairTotal + buildSupplyCost + groundInvasionAmount;
  const supplyOver = repairAndBuildSupply > availableSupply;
  // Repair is capped by the smaller of available repair pods and remaining supply.
  const repairCap = Math.min(availableRepair, availableSupply);

  const fighterFree = Math.max(0, fighterCap - fighterUsed - buildFighterSlots);
  const gunshipFree = Math.max(0, gunshipCap - gunshipUsed - buildGunshipSlots);

  // Clamp GI input to min(remaining capacity, remaining supply after repair+build).
  function setGroundInvasion(raw: number) {
    const supplyForGI = Math.max(0, availableSupply - repairTotal - buildSupplyCost);
    const cap = Math.min(groundInvasionDelta, supplyForGI);
    setGroundInvasionAmount(Math.max(0, Math.min(Math.floor(raw || 0), cap)));
  }

  // ── Reordering (works across kinds) ──
  function move(index: number, dir: -1 | 1) {
    const j = index + dir;
    if (j < 0 || j >= queue.length) return;
    const next = queue.slice();
    [next[index], next[j]] = [next[j], next[index]];
    setQueue(next);
  }

  // ── Repair-row mutators ──
  function setRepairAmount(index: number, raw: number) {
    const q = queue[index];
    if (q.kind !== "repair") return;
    const next = queue.slice();
    const row = { ...q.repair };
    const otherRepair = repairTotal - row.amount;
    const supplyForRow = Math.max(0, availableSupply - buildSupplyCost - otherRepair);
    const repairPodForRow = Math.max(0, availableRepair - otherRepair);
    const maxForRow = Math.min(row.missing, supplyForRow, repairPodForRow);
    row.amount = Math.max(0, Math.min(raw, maxForRow));
    next[index] = { kind: "repair", repair: row };
    setQueue(next);
  }
  function maxRepair(index: number) {
    const q = queue[index];
    if (q.kind !== "repair") return;
    setRepairAmount(index, q.repair.missing);
  }

  // ── Build-row mutators ──
  function setBuildShipType(index: number, shipTypeId: string) {
    const q = queue[index];
    if (q.kind !== "build") return;
    const next = queue.slice();
    next[index] = { kind: "build", build: { ship_type_id: shipTypeId, quantity: 1 } };
    setQueue(next);
  }
  function setBuildQty(index: number, raw: number) {
    const q = queue[index];
    if (q.kind !== "build") return;
    const c = catalogById.get(q.build.ship_type_id);
    if (!c) return;
    // Free slots in this bucket excluding this row.
    const otherSlots = queue.reduce((sum, x, i) => {
      if (i === index || x.kind !== "build") return sum;
      const xc = catalogById.get(x.build.ship_type_id);
      if (!xc || xc.bucket !== c.bucket) return sum;
      return sum + xc.slots * x.build.quantity;
    }, 0);
    const bucketCap = c.bucket === "fighter" ? fighterCap : gunshipCap;
    const bucketUsed = c.bucket === "fighter" ? fighterUsed : gunshipUsed;
    const free = Math.max(0, bucketCap - bucketUsed - otherSlots);
    const fitByCapacity = Math.floor(free / c.slots);
    // Supply check (excluding this row's current contribution).
    const otherBuildSupply = queue.reduce((sum, x, i) => {
      if (i === index || x.kind !== "build") return sum;
      const xc = catalogById.get(x.build.ship_type_id);
      return sum + (xc?.point_cost ?? 0) * (Number(x.build.quantity) || 0);
    }, 0);
    const supplyForRow = Math.max(0, availableSupply - repairTotal - otherBuildSupply);
    const fitBySupply = c.point_cost > 0 ? Math.floor(supplyForRow / c.point_cost) : raw;
    const maxQty = Math.min(fitByCapacity, fitBySupply);
    const qty = Math.max(0, Math.min(raw, maxQty));
    const next = queue.slice();
    next[index] = { kind: "build", build: { ship_type_id: q.build.ship_type_id, quantity: qty } };
    setQueue(next);
  }
  function removeRow(index: number) {
    const q = queue[index];
    const next = queue.slice();
    if (q.kind === "build") {
      next.splice(index, 1);
    } else {
      // Repair rows stay in the list (they represent damaged ships) but
      // get zeroed out — same UX as "Clear".
      next[index] = { kind: "repair", repair: { ...q.repair, amount: 0 } };
    }
    setQueue(next);
  }
  function addBuildRow() {
    const candidate = strikecraftCatalog.find(c =>
      c.bucket === "fighter" ? fighterFree >= c.slots : gunshipFree >= c.slots,
    ) ?? strikecraftCatalog[0];
    if (!candidate) return;
    setQueue([...queue, { kind: "build", build: { ship_type_id: candidate.id, quantity: 1 } }]);
  }

  function clearAll() {
    const next = queue
      .map(q =>
        q.kind === "repair"
          ? { kind: "repair" as const, repair: { ...q.repair, amount: 0 } }
          : { kind: "build" as const, build: { ...q.build, quantity: 0 } },
      )
      .filter(q => q.kind !== "build" || q.build.quantity > 0); // drop emptied builds
    setQueue(next);
    setGroundInvasionAmount(0);
  }

  // ── Auto-fill: walk the unified queue in priority order ──
  function autoFill() {
    let supplyPool = availableSupply;
    let repairPool = availableRepair;
    // Track per-bucket slot usage as we go.
    let fUsed = fighterUsed;
    let gUsed = gunshipUsed;

    const next = queue.map((q): QueueItem => {
      if (q.kind === "repair") {
        const row = { ...q.repair };
        const give = Math.max(
          0,
          Math.min(row.missing, supplyPool, repairPool),
        );
        row.amount = give;
        supplyPool -= give;
        repairPool -= give;
        return { kind: "repair", repair: row };
      }
      // build
      const c = catalogById.get(q.build.ship_type_id);
      if (!c) return q;
      const bucketCap = c.bucket === "fighter" ? fighterCap : gunshipCap;
      const bucketUsed = c.bucket === "fighter" ? fUsed : gUsed;
      const free = Math.max(0, bucketCap - bucketUsed);
      const fitByCapacity = Math.floor(free / c.slots);
      const fitBySupply = c.point_cost > 0 ? Math.floor(supplyPool / c.point_cost) : 0;
      const qty = Math.max(0, Math.min(q.build.quantity || 0, fitByCapacity, fitBySupply));
      // If user had quantity 0 on a placeholder, fill greedily up to caps.
      const greedy = q.build.quantity > 0 ? qty : Math.max(0, Math.min(fitByCapacity, fitBySupply));
      const finalQty = q.build.quantity > 0 ? qty : greedy;
      supplyPool -= finalQty * c.point_cost;
      if (c.bucket === "fighter") fUsed += finalQty * c.slots;
      else gUsed += finalQty * c.slots;
      return { kind: "build", build: { ship_type_id: q.build.ship_type_id, quantity: finalQty } };
    });
    setQueue(next);
    // Top up ground invasion last, with whatever supply remains.
    const giFill = Math.max(0, Math.min(groundInvasionDelta, supplyPool));
    setGroundInvasionAmount(giFill);
  }

  // ── Save handler ──
  function handleSave() {
    const assignments: RepairAssignment[] = queue
      .filter((q): q is { kind: "repair"; repair: RepairRow } => q.kind === "repair")
      .map(q => ({ ship_id: q.repair.ship_id, amount: q.repair.amount }));
    const buildItems: BuildItem[] = queue
      .filter((q): q is { kind: "build"; build: BuildItem } => q.kind === "build")
      .map(q => ({ ship_type_id: q.build.ship_type_id, quantity: q.build.quantity }));
    onSave(assignments, buildItems, groundInvasionAmount);
  }

  const hasAnyAssigned = repairTotal > 0 || buildSupplyCost > 0 || groundInvasionAmount > 0;
  const canAutoFill = repairCap > 0 || (fighterCap > fighterUsed) || (gunshipCap > gunshipUsed) || groundInvasionDelta > 0;

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
            Fleet Repair &amp; Build
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
              {(repairTotal > 0 || buildSupplyCost > 0 || groundInvasionAmount > 0) && (
                <div className="text-[9px] font-semibold text-bronze-dark mt-0.5">
                  repair {repairTotal} + build {buildSupplyCost} + GI {groundInvasionAmount}
                </div>
              )}
            </div>
          </div>
          {(fighterCap > 0 || gunshipCap > 0) && (
            <div className="mt-2 flex justify-end gap-3 text-[10px] font-semibold text-bronze-dark">
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
          )}
          {maxGroundInvasion > 0 && (
            <div className="mt-2 flex items-center gap-2 text-[11px]">
              <span className="font-bold text-bronze-dark uppercase tracking-wider text-[10px]">
                Ground Invasion
              </span>
              <span className="font-semibold text-[#272d34]">
                {currentGroundInvasion + groundInvasionAmount} / {maxGroundInvasion}
              </span>
              <div className="ml-auto flex items-center gap-1">
                <button
                  onClick={() => setGroundInvasion(groundInvasionAmount - 1)}
                  disabled={groundInvasionAmount <= 0}
                  className="w-6 h-6 rounded-sm border border-bronze/60 bg-ivory font-bold text-sm leading-none hover:border-bronze disabled:opacity-30 text-[#272d34]"
                  aria-label="Decrease ground invasion"
                >
                  −
                </button>
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={groundInvasionDelta}
                  value={groundInvasionAmount}
                  onChange={(e) => setGroundInvasion(Number(e.target.value) || 0)}
                  className="w-12 h-6 rounded-sm border border-bronze/60 bg-ivory px-1 text-center text-xs font-bold text-[#272d34]"
                />
                <button
                  onClick={() => setGroundInvasion(groundInvasionAmount + 1)}
                  className="w-6 h-6 rounded-sm border border-bronze/60 bg-ivory font-bold text-sm leading-none hover:border-bronze text-[#272d34]"
                  aria-label="Increase ground invasion"
                >
                  +
                </button>
                <button
                  onClick={() => setGroundInvasion(groundInvasionDelta)}
                  disabled={groundInvasionDelta <= 0}
                  className="h-6 px-1.5 rounded-sm border border-bronze/60 bg-ivory font-bold text-[10px] uppercase tracking-wider hover:border-bronze disabled:opacity-30 text-[#272d34]"
                >
                  Max
                </button>
              </div>
            </div>
          )}
          <div className="flex gap-1.5 mt-2.5">
            <button
              onClick={autoFill}
              disabled={!canAutoFill || queue.length === 0}
              className="flex-1 h-7 rounded-sm border border-bronze/50 bg-ivory px-2 text-xs font-semibold hover:border-bronze disabled:opacity-50 disabled:cursor-not-allowed text-[#272d34]"
            >
              Auto-fill in priority
            </button>
            <button
              onClick={clearAll}
              disabled={!hasAnyAssigned}
              className="flex-1 h-7 rounded-sm border border-bronze/50 bg-ivory px-2 text-xs font-semibold hover:border-bronze disabled:opacity-50 disabled:cursor-not-allowed text-[#272d34]"
            >
              Clear
            </button>
            <button
              onClick={addBuildRow}
              disabled={(fighterCap <= 0 && gunshipCap <= 0) || strikecraftCatalog.length === 0}
              className="flex-1 h-7 rounded-sm border border-bronze/50 bg-ivory px-2 text-xs font-semibold hover:border-bronze disabled:opacity-50 disabled:cursor-not-allowed text-[#272d34]"
            >
              + Add Build
            </button>
          </div>
        </div>

        <div className="overflow-y-auto p-3 space-y-2 grow">
          {queue.length === 0 && (
            <p className="text-xs text-bronze-dark italic">
              No damaged ships and no builds queued. Use “+ Add Build” to construct strikecraft.
            </p>
          )}
          {queue.map((q, i) => {
            if (q.kind === "repair") {
              const r = q.repair;
              const projected = r.current_hp + r.amount;
              const otherRepair = repairTotal - r.amount;
              const supplyForRow = Math.max(0, availableSupply - buildSupplyCost - otherRepair);
              const repairPodForRow = Math.max(0, availableRepair - otherRepair);
              const maxForRow = Math.min(r.missing, supplyForRow, repairPodForRow);
              return (
                <div
                  key={`repair-${r.ship_id}`}
                  className={`border border-bronze/40 rounded-sm p-2 ${
                    r.crippled ? "bg-crimson/15" : "bg-yellow-200/40"
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
                        disabled={i === queue.length - 1}
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
                        <div className="text-[10px] font-semibold text-accent/85 uppercase tracking-wider shrink-0">{r.hull_class}</div>
                      </div>
                      <div className={`text-[11px] font-bold mt-0.5 ${r.crippled ? "text-crimson/80" : "text-amber-800"}`}>
                        Hull: {r.current_hp} / {r.max_hp}
                        {r.amount > 0 && (
                          <span className="ml-1 text-foreground">→ {projected}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 mt-1.5">
                        <button
                          onClick={() => setRepairAmount(i, r.amount - 1)}
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
                          onChange={(e) => setRepairAmount(i, Number(e.target.value) || 0)}
                          className="w-14 h-7 rounded-sm border border-bronze/60 bg-ivory px-1 text-center text-xs font-bold text-[#272d34]"
                        />
                        <button
                          onClick={() => setRepairAmount(i, r.amount + 1)}
                          disabled={r.amount >= maxForRow}
                          className="w-7 h-7 rounded-sm border border-bronze/60 bg-ivory font-bold text-sm leading-none hover:border-bronze disabled:opacity-30 text-[#272d34]"
                          aria-label="Increase"
                        >
                          +
                        </button>
                        <button
                          onClick={() => maxRepair(i)}
                          disabled={r.amount >= maxForRow}
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
            }

            // build row
            const b = q.build;
            const c = catalogById.get(b.ship_type_id);
            const cost = (c?.point_cost ?? 0) * b.quantity;
            return (
              <div
                key={`build-${i}`}
                className="border border-bronze/40 rounded-sm p-2 bg-bronze/5"
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
                      disabled={i === queue.length - 1}
                      aria-label="Move down"
                      className="w-7 h-7 rounded-sm border border-bronze/60 bg-ivory font-bold text-sm leading-none hover:border-bronze disabled:opacity-30 text-[#272d34]"
                    >
                      ↓
                    </button>
                  </div>
                  <div className="grow min-w-0">
                    <div className="text-[10px] font-heading font-bold uppercase tracking-wider text-bronze-dark mb-1">
                      <span className="mr-1">#{i + 1}</span>Build
                    </div>
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
                        value={b.quantity}
                        onChange={(e) => setBuildQty(i, Number(e.target.value) || 0)}
                        className="w-12 h-7 rounded-sm border border-bronze/60 bg-ivory px-1 text-center text-xs font-bold text-[#272d34]"
                      />
                      <button
                        onClick={() => setBuildQty(i, b.quantity + 1)}
                        className="w-7 h-7 rounded-sm border border-bronze/60 bg-ivory font-bold text-sm leading-none hover:border-bronze disabled:opacity-30 text-[#272d34]"
                        aria-label="Increase"
                      >
                        +
                      </button>
                      <button
                        onClick={() => removeRow(i)}
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
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex gap-2 px-4 py-3 border-t border-bronze/40 bg-ivory-dark shrink-0">
          <button
            onClick={onClose}
            className="flex-1 h-9 rounded-sm border border-bronze/50 bg-ivory px-2 text-xs font-semibold hover:border-bronze text-[#272d34]"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={supplyOver || repairTotal > availableRepair}
            className="flex-1 h-9 rounded-sm border-2 border-bronze bg-bronze/20 px-2 text-xs text-bronze-dark font-heading font-bold uppercase tracking-wider hover:bg-bronze/30 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Save Order
          </button>
        </div>
      </div>
    </div>
  );
}
