import { useEffect, useState, useCallback, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import type { MapState, SystemData, MapFleet, FacilityType, HexData } from "@/lib/mapTypes";
import { hexKey } from "@/lib/mapTypes";
import { offsetToCube, cubeDistance } from "@/lib/hexUtils";
import { isHexBlockedForPlayer } from "@/lib/hexAccess";
import { fetchFleetMapSpeed, attackRangeFromMapSpeed, hexDistance } from "@/lib/fleetRange";

import GameHeader from "@/components/game-shell/GameHeader";
import LeftPanel from "@/components/game-shell/LeftPanel";
import ContextPanel from "@/components/game-shell/ContextPanel";
import type { GameMapData, FacilityTypeFull, ShipTypeLookup } from "@/components/game-shell/ContextPanel";
import PlayerMapCanvas from "@/components/game-shell/PlayerMapCanvas";
import BottomStrip from "@/components/game-shell/BottomStrip";
import OverlayDemoBar from "@/components/game-shell/OverlayDemoBar";
import type { GameMode, MapSelection } from "@/components/game-shell/gameShellTypes";
import { DUMMY_STATS, DUMMY_NEWS } from "@/components/game-shell/gameShellTypes";
import { useIsTablet } from "@/hooks/useIsTablet";
import { useIsMobile } from "@/hooks/use-mobile";
import { useGameMusic } from "@/hooks/useGameMusic";
import { playOrderPlaced, playOrdersSubmitted } from "@/lib/uiSounds";
import { computeGroupStrikecraftCapacity, type FleetShipRow } from "@/components/game-shell/FleetCompositionEditor";
import { processTurn } from "@/lib/gameLifecycle";


const PROVINCE_NAMES: Record<number, string> = {
  1: "Valerian", 2: "Aurelian", 3: "Cassian",
  4: "Dravian", 5: "Marcellan", 6: "Octavian",
};

interface GameInfo {
  id: string;
  name: string;
  turn_number: number;
  status: string;
}

interface PlayerInfo {
  id: string;
  player_slot: number;
  initialized: boolean;
  visible_system_ids: number[];
  treasury: number;
  last_tribute: number;
  last_maintenance: number;
  admin_capability: number;
  combat_capability: number;
  admin_points_remaining: number;
  combat_points_remaining: number;
  orders_locked: boolean;
}

interface ProfileInfo {
  display_name: string | null;
  email: string | null;
}

function deserializeMapState(json: any): MapState {
  // Dedupe systems by system_id. Stored JSON may contain the same system
  // twice (once keyed by system_id, once by hex_id) due to legacy serialization.
  const systems = new Map<number, SystemData>();
  const rawEntries: Array<[any, SystemData]> = Array.isArray(json.systems) ? json.systems : [];
  for (const [, sys] of rawEntries) {
    if (sys && typeof sys.system_id === "number" && !systems.has(sys.system_id)) {
      systems.set(sys.system_id, sys);
    }
  }
  return {
    mapData: json.mapData,
    hexes: new Map(json.hexes),
    systems,
    regions: json.regions || [],
    facilityTypes: json.facilityTypes || [],
    fleets: json.fleets || [],
  };
}

/**
 * Compute effective player visibility for the current turn.
 *
 * Returns TWO sets:
 *  - live:     systems currently in sensor view (bright on the map).
 *              = Core + own-province systems + 1-hex sensor radius around any
 *                owned system or owned fleet.
 *  - everSeen: systems the player has ever observed (rendered faded if not in
 *              live). = persisted player.visible_system_ids ∪ live.
 *
 * The visibility phase seeds visible_system_ids at game start with Core + ALL
 * province systems (every faction), so every player remembers Core + Province
 * planet locations from turn 1.
 */
function useComputedVisibility(
  player: PlayerInfo | null,
  mapState: MapState | null,
): { live: number[]; everSeen: number[] } {
  return useMemo(() => {
    const persisted = ((player?.visible_system_ids ?? []) as number[]);
    if (!player || !mapState) {
      return { live: [], everSeen: persisted };
    }

    const ownProvince = `PROVINCE_${player.player_slot}`;
    const SENSOR_RADIUS = 1;

    // hex_id → HexData lookup
    const hexById = new Map<number, HexData>();
    for (const h of mapState.hexes.values()) hexById.set(h.hex_id, h);

    const allSystems = Array.from(mapState.systems.values());
    const live = new Set<number>();

    // 1. Always-live: Core hexes + the player's own province + any system the
    //    player owns. Other-province systems and Marches systems are NOT live
    //    by classification — they only appear via sensor scan around an owned
    //    fleet/system. Otherwise they fall back to "ever seen" memory (faded
    //    ghost), so the player remembers planet locations but doesn't get a
    //    live readout without scouting.
    for (const sys of allSystems) {
      const sysHex = hexById.get(sys.hex_id);
      if (!sysHex) continue;
      if (sysHex.classification === "CORE" || sysHex.classification === ownProvince) {
        live.add(sys.system_id);
      }
      if (sys.owner === ownProvince) live.add(sys.system_id);
    }

    // 2. Sensor scan: scan centers = owned fleets + owned systems
    const scanCenters: Array<[number, number]> = [];
    for (const sys of allSystems) {
      if (sys.owner === ownProvince) {
        const sysHex = hexById.get(sys.hex_id);
        if (sysHex) scanCenters.push([sysHex.x, sysHex.y]);
      }
    }
    for (const f of mapState.fleets ?? []) {
      if (f.owner_classification === ownProvince) {
        scanCenters.push([f.hex_x, f.hex_y]);
      }
    }

    if (scanCenters.length > 0) {
      const centersCube = scanCenters.map(([x, y]) => offsetToCube(x, y));
      for (const sys of allSystems) {
        if (live.has(sys.system_id)) continue;
        const sysHex = hexById.get(sys.hex_id);
        if (!sysHex) continue;
        const [sx, sy, sz] = offsetToCube(sysHex.x, sysHex.y);
        for (const [cx, cy, cz] of centersCube) {
          if (cubeDistance(sx, sy, sz, cx, cy, cz) <= SENSOR_RADIUS) {
            live.add(sys.system_id);
            break;
          }
        }
      }
    }

    // everSeen = persisted ∪ live (once seen, always remembered)
    const everSeen = new Set<number>(persisted);
    for (const id of live) everSeen.add(id);

    return { live: Array.from(live), everSeen: Array.from(everSeen) };
  }, [player, mapState]);
}

/**
 * Compute the set of hex keys the player can "see" — split into live (currently
 * in sensor view, bright) and everSeen (live ∪ hexes containing any ever-seen
 * system, faded if not live).
 */
function useVisibleHexKeys(
  player: PlayerInfo | null,
  mapState: MapState | null,
  everSeenSystemIds: number[],
): { live: Set<string>; everSeen: Set<string> } {
  return useMemo(() => {
    const live = new Set<string>();
    const everSeen = new Set<string>();
    if (!player || !mapState) return { live, everSeen };

    const ownProvince = `PROVINCE_${player.player_slot}`;
    const SENSOR_RADIUS = 1;

    // 1. Core + Explored Marches + own-province hexes are always live
    for (const hex of mapState.hexes.values()) {
      if (hex.classification === "CORE" || hex.classification === "MARCHES" || hex.classification === ownProvince) {
        live.add(hexKey(hex.x, hex.y));
      }
    }

    // 2. Sensor centers: owned systems + owned fleets
    const hexById = new Map<number, HexData>();
    for (const h of mapState.hexes.values()) hexById.set(h.hex_id, h);

    const scanCenters: Array<[number, number]> = [];
    for (const sys of mapState.systems.values()) {
      if (sys.owner === ownProvince) {
        const sysHex = hexById.get(sys.hex_id);
        if (sysHex) scanCenters.push([sysHex.x, sysHex.y]);
      }
    }
    for (const f of mapState.fleets ?? []) {
      if (f.owner_classification === ownProvince) {
        scanCenters.push([f.hex_x, f.hex_y]);
      }
    }

    if (scanCenters.length > 0) {
      const centersCube = scanCenters.map(([x, y]) => offsetToCube(x, y));
      for (const hex of mapState.hexes.values()) {
        const k = hexKey(hex.x, hex.y);
        if (live.has(k)) continue;
        const [sx, sy, sz] = offsetToCube(hex.x, hex.y);
        for (const [cx, cy, cz] of centersCube) {
          if (cubeDistance(sx, sy, sz, cx, cy, cz) <= SENSOR_RADIUS) {
            live.add(k);
            break;
          }
        }
      }
    }

    // everSeen starts with live, then adds hexes of any ever-seen system
    for (const k of live) everSeen.add(k);
    const everSeenSet = new Set(everSeenSystemIds);
    for (const sys of mapState.systems.values()) {
      if (!everSeenSet.has(sys.system_id)) continue;
      const sysHex = hexById.get(sys.hex_id);
      if (sysHex) everSeen.add(hexKey(sysHex.x, sysHex.y));
    }

    return { live, everSeen };
  }, [player, mapState, everSeenSystemIds]);
}

/* ── DEBUG: Log applied visibility & initialization rules ── */
function logAppliedRules({
  game,
  player,
  profile,
  mapState,
}: {
  game: any;
  player: any;
  profile: any;
  mapState: MapState | null;
}) {
  const factionName = PROVINCE_NAMES[player.player_slot] || `Faction ${player.player_slot}`;
  const playerName = profile?.display_name || profile?.email || "Unknown";
  const visibleIds: number[] = (player.visible_system_ids || []) as number[];

  /* eslint-disable no-console */
  console.groupCollapsed(
    `%c[Rules Applied] ${playerName} — ${factionName} (slot ${player.player_slot}) — Game "${game.name}" T${game.turn_number}`,
    "color: #b8860b; font-weight: bold;"
  );

  // ── Initialization & defaults ──
  console.groupCollapsed("%cInitialization & Defaults", "color: #8b0000; font-weight: bold;");
  console.log("Rule: Player slot → Province mapping (1=Valerian, 2=Aurelian, 3=Cassian, 4=Dravian, 5=Marcellan, 6=Octavian)");
  console.log(`  → player_slot=${player.player_slot} ⇒ faction "${factionName}"`);
  console.log("Rule: Players begin uninitialized; first login triggers 3-step intro (History / Province / Recent Events)");
  console.log(`  → initialized=${player.initialized} ⇒ ${player.initialized ? "skip intro" : "show intro"}`);
  console.log("Rule: Default starting treasury (stub) = 300 ₡ until economy is finalized");
  console.log(`  → treasury=${player.treasury} ₡`);
  console.log("Rule: Default Admin & Combat capability = 3 each (generates same # of action points per turn)");
  console.log(`  → admin_capability=${player.admin_capability}, admin_points_remaining=${player.admin_points_remaining}`);
  console.log(`  → combat_capability=${player.combat_capability}, combat_points_remaining=${player.combat_points_remaining}`);
  console.log("Rule: Last-turn economy snapshot stored on player row");
  console.log(`  → last_tribute=${player.last_tribute} ₡, last_maintenance=${player.last_maintenance} ₡`);
  console.groupEnd();

  // ── Map visibility ──
  console.groupCollapsed("%cMap Visibility Rules", "color: #8b0000; font-weight: bold;");
  console.log("Rule: All hexes are always visible (terrain is public)");
  console.log("Rule: Systems are visible only if their system_id is in player.visible_system_ids");
  console.log("Rule: Visibility is set when the game starts (Core + owned Province systems) and re-synced after each turn");
  console.log("Rule: Fleets are visible only if positioned on a hex containing a visible system (current behaviour)");
  console.log(`Visible system_ids (${visibleIds.length}):`, visibleIds);

  if (mapState) {
    const allSystems = Array.from(mapState.systems.values()) as SystemData[];
    const visible = allSystems.filter((s) => visibleIds.includes(s.system_id));
    const hidden = allSystems.filter((s) => !visibleIds.includes(s.system_id));
    console.log(`Total systems on map: ${allSystems.length}  |  visible: ${visible.length}  |  hidden: ${hidden.length}`);
    console.table(
      visible.slice(0, 50).map((s) => ({
        system_id: s.system_id,
        name: (s as any).name ?? "—",
        classification: (s as any).owner_classification ?? (s as any).classification ?? "—",
        hex: `${(s as any).hex_x},${(s as any).hex_y}`,
        reason: "in visible_system_ids",
      }))
    );
    if (visible.length > 50) console.log(`…(${visible.length - 50} more visible systems not tabled)`);

    const fleets = (mapState.fleets || []) as MapFleet[];
    const visibleHexKeys = new Set(visible.map((s) => `${(s as any).hex_x},${(s as any).hex_y}`));
    const visibleFleets = fleets.filter((f: any) => visibleHexKeys.has(`${f.hex_x},${f.hex_y}`));
    console.log(`Fleets on map: ${fleets.length}  |  visible to player: ${visibleFleets.length}`);
  } else {
    console.log("(no map state loaded — nothing to evaluate)");
  }
  console.groupEnd();

  console.groupEnd();
  /* eslint-enable no-console */
}

const PlayerGame = () => {
  const { gameId } = useParams<{ gameId: string }>();
  const { user, isAdmin } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const isTablet = useIsTablet();
  const isMobile = useIsMobile();

  const [game, setGame] = useState<GameInfo | null>(null);
  const [player, setPlayer] = useState<PlayerInfo | null>(null);
  const [profile, setProfile] = useState<ProfileInfo | null>(null);
  const [mapState, setMapState] = useState<MapState | null>(null);
  const [dbFacilityTypes, setDbFacilityTypes] = useState<FacilityType[]>([]);
  const [dbFacilityTypesFull, setDbFacilityTypesFull] = useState<FacilityTypeFull[]>([]);
  const [dbShipTypes, setDbShipTypes] = useState<ShipTypeLookup[]>([]);
  const [loading, setLoading] = useState(true);
  const [initStep, setInitStep] = useState(0);

  // Shell state
  const [activeMode, setActiveMode] = useState<GameMode>("military");
  const [selection, setSelection] = useState<MapSelection>({ type: "none" });
  const [rightPanelOpen, setRightPanelOpen] = useState(true);
  // Targeting: when active, the next map click is captured as a fleet order target
  const [targeting, setTargeting] = useState<
    | { mode: "hex"; orderType: "fleet_move"; fleetId: string }
    | { mode: "fleet"; orderType: "attack"; fleetId: string }
    | null
  >(null);
  // Number of fleet-related orders the player has issued this turn (each costs 1 combat point)
  const [pendingFleetOrderCount, setPendingFleetOrderCount] = useState(0);
  // Active fleet orders this turn, keyed by fleet_id, used to render arrows on the map
  const [pendingFleetOrders, setPendingFleetOrders] = useState<
    Map<string, { kind: "move" | "attack"; targetFleetId?: string; targetSystemId?: number; destX?: number; destY?: number }>
  >(new Map());
  // Pending build_facility orders (each costs 1 admin point + upfront cost ₡)
  const [pendingBuildAdminPoints, setPendingBuildAdminPoints] = useState(0);
  const [pendingBuildCost, setPendingBuildCost] = useState(0);
  /** Pending build orders submitted this turn, keyed by system_id. */
  const [pendingBuildOrders, setPendingBuildOrders] = useState<
    Map<number, Array<{ orderId: string; facilityTypeId: string; cost: number; maintenance: number }>>
  >(new Map());
  /** Pending cancel-build orders submitted this turn, keyed by system_id. */
  const [pendingCancelBuildOrders, setPendingCancelBuildOrders] = useState<
    Map<number, Set<string>>
  >(new Map());
  const [orderRefreshTick, setOrderRefreshTick] = useState(0);
  const [isSolo, setIsSolo] = useState(false);
  const [processingTurn, setProcessingTurn] = useState(false);
  /** Open issues that block turn submission (e.g. fleet group overcapacity). */
  const [submissionIssues, setSubmissionIssues] = useState<string[]>([]);
  /** Player-facing dispatches sourced from game_logs (capture/colonize, etc.) */
  const [realDispatches, setRealDispatches] = useState<import("@/components/game-shell/gameShellTypes").NewsStory[]>([]);

  const load = useCallback(async () => {
    if (!user || !gameId) return;

    const [{ data: gData }, { data: pData }, { data: prData }, { data: ftData }, { data: stData }] = await Promise.all([
      (supabase as any).from("games").select("id, name, turn_number, status").eq("id", gameId).single(),
      (supabase as any).from("game_players").select("id, player_slot, initialized, visible_system_ids, treasury, last_tribute, last_maintenance, admin_capability, combat_capability, admin_points_remaining, combat_points_remaining, orders_locked").eq("game_id", gameId).eq("user_id", user.id).single(),
      (supabase as any).from("profiles").select("display_name, email").eq("user_id", user.id).single(),
      (supabase as any).from("facility_types").select("id, name, description, icon, fighter_capacity, gunship_capacity, cost, turns_to_build, max_per_system, consumed_facility_id, maintenance, synod"),
      (supabase as any).from("ship_types").select("id, name, hull_class, ship_id, class, point_cost, maintenance, map_speed, repair_pod, supply_pod, hull, ground_invasion, scout_sensors, fighter_bay, gun_ship_link, flavor_description, synod, laser_2_5cm, laser_4_5cm, laser_6_5cm, laser_10cm, laser_14cm, laser_20cm, laser_28cm, laser_50cm, missile_10kg, missile_50kg, missile_100kg, missile_half_kt"),
    ]);

    if (!gData || !pData) {
      toast({ title: "Access denied", description: "You are not a player in this game.", variant: "destructive" });
      navigate("/");
      return;
    }
    if (gData.status !== "active") {
      toast({ title: "Game not active", description: `This game is currently ${gData.status}. You can enter once it is active.`, variant: "destructive" });
      navigate("/my-games");
      return;
    }

    setGame(gData);
    setPlayer(pData);
    setProfile(prData);
    try { localStorage.setItem(`lastGame:${user.id}`, gameId); } catch {}

    // Determine if this is a solo game (only one player joined)
    const { count: playerCount } = await (supabase as any)
      .from("game_players")
      .select("id", { count: "exact", head: true })
      .eq("game_id", gameId);
    setIsSolo((playerCount ?? 0) <= 1);
    (async () => {
      const { data: gpRows } = await supabase
        .from("game_players")
        .select("game_id, player_slot, games!inner(id, name, status)")
        .eq("user_id", user.id)
        .neq("games.status", "completed");
      const activeGames = (gpRows || []).map((r: any) => ({
        game_id: r.game_id,
        player_slot: r.player_slot,
        name: r.games?.name ?? "",
        status: r.games?.status ?? "",
      }));
      await supabase
        .from("profiles")
        .update({ last_game_id: gameId, active_games: activeGames })
        .eq("user_id", user.id);
    })();
    // Hide Synod-flagged facilities from non-admin players in any build screen.
    const visibleFt = (ftData || []).filter((ft: any) => isAdmin || !ft.synod);
    setDbFacilityTypes(visibleFt.map((ft: any) => ({
      facility_type_id: ft.id,
      name: ft.name,
      description: ft.description || "",
      icon: ft.icon || "🏭",
    })));
    setDbFacilityTypesFull(visibleFt.map((ft: any) => ({
      facility_type_id: ft.id,
      name: ft.name,
      description: ft.description || "",
      icon: ft.icon || "🏭",
      fighter_capacity: ft.fighter_capacity || 0,
      gunship_capacity: ft.gunship_capacity || 0,
      cost: ft.cost || 0,
      turns_to_build: ft.turns_to_build || 1,
      max_per_system: ft.max_per_system || 0,
      consumed_facility_id: ft.consumed_facility_id || null,
      maintenance: ft.maintenance || 0,
    })));
    // Hide Synod-flagged ships from non-admin players in any build/list screen.
    const visibleSt = (stData || []).filter((s: any) => isAdmin || !s.synod);
    setDbShipTypes(visibleSt.map((s: any) => ({
      id: s.id,
      name: s.name,
      hull_class: s.hull_class,
      ship_id: s.ship_id,
      class: s.class,
      point_cost: s.point_cost,
      maintenance: Number(s.maintenance) || 0,
      map_speed: Number(s.map_speed) || 0,
      repair_pod: Number(s.repair_pod) || 0,
      supply_pod: Number(s.supply_pod) || 0,
      hull: Number(s.hull) || 0,
      ground_invasion: Number(s.ground_invasion) || 0,
      scout_sensors: Number(s.scout_sensors) || 0,
      fighter_bay: Number(s.fighter_bay) || 0,
      gun_ship_link: Number(s.gun_ship_link) || 0,
      flavor_description: s.flavor_description ?? "",
      laser_2_5cm: Number(s.laser_2_5cm) || 0,
      laser_4_5cm: Number(s.laser_4_5cm) || 0,
      laser_6_5cm: Number(s.laser_6_5cm) || 0,
      laser_10cm: Number(s.laser_10cm) || 0,
      laser_14cm: Number(s.laser_14cm) || 0,
      laser_20cm: Number(s.laser_20cm) || 0,
      laser_28cm: Number(s.laser_28cm) || 0,
      laser_50cm: Number(s.laser_50cm) || 0,
      missile_10kg: Number(s.missile_10kg) || 0,
      missile_50kg: Number(s.missile_50kg) || 0,
      missile_100kg: Number(s.missile_100kg) || 0,
      missile_half_kt: Number(s.missile_half_kt) || 0,
    })));

    const { data: mapRow } = await (supabase as any)
      .from("games")
      .select("map_data_json")
      .eq("id", gameId)
      .single();

    let loadedMap: MapState | null = null;
    if (mapRow?.map_data_json && Object.keys(mapRow.map_data_json).length > 0) {
      try {
        loadedMap = deserializeMapState(mapRow.map_data_json);
        setMapState(loadedMap);
      } catch (e) {
        console.error("Failed to deserialize map:", e);
      }
    }

    // Ensure every system has a garrison fleet (idempotent server-side RPC).
    try {
      await (supabase as any).rpc("ensure_game_garrisons", { _game_id: gameId });
    } catch (e) {
      console.warn("ensure_game_garrisons failed:", e);
    }

    if (!pData.initialized) {
      setInitStep(1);
    }

    // ─── DEBUG: Log applied rules for this player's map view ───
    logAppliedRules({
      game: gData,
      player: pData,
      profile: prData,
      mapState: loadedMap,
    });

    setLoading(false);
  }, [user, gameId, navigate, toast, isAdmin]);

  useEffect(() => { load(); }, [load]);

  // Count player's fleet move/attack orders for this turn (each costs 1 combat point).
  // Load player's fleet move/attack orders for this turn (each costs 1 combat point)
  // and stash them so we can both count points and draw arrows for the selected fleet.
  useEffect(() => {
    if (!player || !game) return;
    let cancelled = false;
    (async () => {
      const { data: orders } = await (supabase as any)
        .from("player_orders")
        .select("id, order_type, order_json")
        .eq("game_id", game.id)
        .eq("player_id", player.id)
        .eq("turn_number", game.turn_number)
        .in("order_type", ["fleet_move", "other", "set_readiness", "build_facility"]);
      if (cancelled) return;
      const map = new Map<string, { kind: "move" | "attack"; targetFleetId?: string; targetSystemId?: number; destX?: number; destY?: number }>();
      let pointsSpent = 0;
      let buildAdmin = 0;
      let buildCost = 0;
      const buildBySys = new Map<number, Array<{ orderId: string; facilityTypeId: string; cost: number; maintenance: number }>>();
      const cancelBySys = new Map<number, Set<string>>();
      const facilityCostLookup = new Map<string, { cost: number; maintenance: number }>();
      for (const ft of dbFacilityTypesFull) {
        facilityCostLookup.set(ft.facility_type_id, { cost: ft.cost ?? 0, maintenance: ft.maintenance ?? 0 });
      }
      for (const o of (orders ?? []) as any[]) {
        if (o.order_type === "fleet_move" && o.order_json?.fleet_id) {
          map.set(o.order_json.fleet_id, {
            kind: "move",
            destX: o.order_json.dest_x,
            destY: o.order_json.dest_y,
          });
          pointsSpent += 1;
        } else if (
          o.order_type === "other" &&
          o.order_json?.kind === "fleet_attack" &&
          o.order_json?.fleet_id
        ) {
          map.set(o.order_json.fleet_id, {
            kind: "attack",
            targetFleetId: o.order_json.target_fleet_id,
            targetSystemId: o.order_json.target_system_id,
          });
          pointsSpent += 1;
        } else if (o.order_type === "set_readiness") {
          // Readiness changes also cost 1 combat point per fleet
          pointsSpent += 1;
        } else if (o.order_type === "build_facility" && o.order_json?.facility_type_id) {
          buildAdmin += 1;
          const lookup = facilityCostLookup.get(o.order_json.facility_type_id) || { cost: 0, maintenance: 0 };
          buildCost += lookup.cost;
          const sysId = Number(o.order_json.system_id);
          if (!Number.isNaN(sysId)) {
            const arr = buildBySys.get(sysId) || [];
            arr.push({
              orderId: o.id,
              facilityTypeId: o.order_json.facility_type_id,
              cost: lookup.cost,
              maintenance: lookup.maintenance,
            });
            buildBySys.set(sysId, arr);
          }
        } else if (o.order_type === "other" && o.order_json?.kind === "cancel_build") {
          const sysId = Number(o.order_json.system_id);
          const fid = o.order_json.facility_type_id;
          if (!Number.isNaN(sysId) && fid) {
            const set = cancelBySys.get(sysId) || new Set<string>();
            set.add(String(fid));
            cancelBySys.set(sysId, set);
          }
        }
      }
      setPendingFleetOrders(map);
      setPendingFleetOrderCount(pointsSpent);
      setPendingBuildAdminPoints(buildAdmin);
      setPendingBuildCost(buildCost);
      setPendingBuildOrders(buildBySys);
      setPendingCancelBuildOrders(cancelBySys);
    })();
    return () => { cancelled = true; };
  }, [player?.id, game?.id, game?.turn_number, orderRefreshTick, dbFacilityTypesFull]);

  // Visibility hooks must run before the submission-issues effect (which
  // checks attack targets against currently visible hexes). Rules of Hooks:
  // these still execute unconditionally on every render and before any early
  // return below.
  const { live: liveVisibleIds, everSeen: everSeenSystemIds } = useComputedVisibility(player, mapState);
  const { live: liveHexKeys, everSeen: everSeenHexKeys } = useVisibleHexKeys(player, mapState, everSeenSystemIds);

  // Admin-only override: reveal the entire map regardless of player sensor coverage.
  const [adminRevealAll, setAdminRevealAll] = useState(false);
  const allSystemIds = useMemo(
    () => (mapState ? Array.from(mapState.systems.keys()) : []),
    [mapState]
  );
  const allHexKeys = useMemo(() => {
    const set = new Set<string>();
    if (mapState) for (const k of mapState.hexes.keys()) set.add(k);
    return set;
  }, [mapState]);
  const effectiveLiveSystemIds = isAdmin && adminRevealAll ? allSystemIds : liveVisibleIds;
  const effectiveEverSeenSystemIds = isAdmin && adminRevealAll ? allSystemIds : everSeenSystemIds;
  const effectiveLiveHexKeys = isAdmin && adminRevealAll ? allHexKeys : liveHexKeys;
  const effectiveEverSeenHexKeys = isAdmin && adminRevealAll ? allHexKeys : everSeenHexKeys;

  // ─── Real dispatches from game_logs ───
  // Pull recent capture/colonize events affecting this player's province
  // (either as the new owner or as the previous owner) and turn them into
  // dispatches in the news feed.
  useEffect(() => {
    if (!player || !game) return;
    const ownClass = `PROVINCE_${player.player_slot}`;
    const factionLc = (PROVINCE_NAMES[player.player_slot] || "").toLowerCase();
    let cancelled = false;
    (async () => {
      const { data: logs } = await (supabase as any)
        .from("game_logs")
        .select("id, turn_number, log_type, message, details_json")
        .eq("game_id", game.id)
        .in("log_type", ["planet_colonized", "planet_captured"])
        .order("created_at", { ascending: false })
        .limit(50);
      if (cancelled) return;
      const matches = (s?: string) => {
        if (!s) return false;
        const lc = s.toLowerCase();
        return s === ownClass || lc === factionLc;
      };
      const stories = (logs || [])
        .filter((l: any) =>
          matches(l.details_json?.new_owner) || matches(l.details_json?.previous_owner)
        )
        .map((l: any) => {
          const isColonize = l.log_type === "planet_colonized";
          const newOwner = l.details_json?.new_owner || "";
          const sysName = l.details_json?.system_name || "an unknown world";
          const ours = matches(newOwner);
          const headline = isColonize
            ? (ours ? `Colony established at ${sysName}` : `${newOwner} colonizes ${sysName}`)
            : (ours ? `${sysName} captured` : `${sysName} lost to ${newOwner}`);
          return {
            id: `log-${l.id}`,
            headline,
            summary: l.message || headline,
            turn: l.turn_number,
            read: false,
            category: "military" as const,
          };
        });
      setRealDispatches(stories);
    })();
    return () => { cancelled = true; };
  }, [player?.id, game?.id, game?.turn_number]);

  // ─── Submission-blocking issues ───
  // Currently checks: per-fleet, per-tactical-group strikecraft overcapacity
  // (more fighters/gunships in a group than its host capacity). Computed from
  // game_fleet_ships joined with ship_types so the math matches what the
  // FleetCompositionEditor shows in fleet detail.
  useEffect(() => {
    if (!player || !game || !mapState) return;
    const ownClass = `PROVINCE_${player.player_slot}`;
    const myFleets = mapState.fleets.filter(f => f.owner_classification === ownClass);
    if (myFleets.length === 0) {
      setSubmissionIssues([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const fleetIds = myFleets.map(f => f.fleet_id);
      const { data: rows } = await (supabase as any)
        .from("game_fleet_ships")
        .select("game_fleet_id, ship_type_id, quantity, crippled, tactical_group, ship_types(class, fighter_bay, gun_ship_link, map_speed)")
        .in("game_fleet_id", fleetIds);
      if (cancelled) return;
      const byFleet = new Map<string, FleetShipRow[]>();
      // Per-fleet effective map speed (slowest non-strikecraft host, cripple-aware).
      const speedByFleet = new Map<string, number>();
      for (const r of (rows || []) as any[]) {
        const st = r.ship_types || {};
        const row: FleetShipRow = {
          id: `${r.game_fleet_id}:${r.ship_type_id}`,
          ship_type_id: r.ship_type_id,
          quantity: r.quantity,
          tactical_group: r.tactical_group,
          ship_name: "",
          ship_display_id: "",
          hull_class: "",
          ship_class: st.class || "",
          fighter_bay: Number(st.fighter_bay) || 0,
          gun_ship_link: Number(st.gun_ship_link) || 0,
        };
        const arr = byFleet.get(r.game_fleet_id) ?? [];
        arr.push(row);
        byFleet.set(r.game_fleet_id, arr);
        const raw = Number(st.map_speed) || 0;
        if (raw > 0) {
          const eff = r.crippled ? Math.max(1, Math.ceil(raw / 2)) : raw;
          const cur = speedByFleet.get(r.game_fleet_id);
          if (cur === undefined || eff < cur) speedByFleet.set(r.game_fleet_id, eff);
        }
      }
      const issues: string[] = [];
      for (const f of myFleets) {
        const ships = byFleet.get(f.fleet_id) ?? [];
        const caps = computeGroupStrikecraftCapacity(ships);
        for (const [group, c] of caps.entries()) {
          if (c.fighterUsed > c.fighterCap) {
            issues.push(`${f.fleet_name} · ${group}: fighters ${c.fighterUsed}/${c.fighterCap}`);
          }
          if (c.gunshipUsed > c.gunshipCap) {
            issues.push(`${f.fleet_name} · ${group}: gunships ${c.gunshipUsed}/${c.gunshipCap}`);
          }
        }
      }

      // ── Attack-order range + visibility validation ──
      // For each pending fleet_attack order (from pendingFleetOrders), confirm
      // the target is currently visible AND within attack range
      // (= floor(map_speed / 2)) of the attacker's current hex.
      for (const f of myFleets) {
        const order = pendingFleetOrders.get(f.fleet_id);
        if (!order || order.kind !== "attack") continue;
        const speed = speedByFleet.get(f.fleet_id) ?? 0;
        const range = Math.max(0, Math.floor(speed / 2));

        let tgtX: number | null = null;
        let tgtY: number | null = null;
        let tgtLabel = "target";
        if (order.targetFleetId) {
          const tf = mapState.fleets.find(x => x.fleet_id === order.targetFleetId);
          if (tf) { tgtX = tf.hex_x; tgtY = tf.hex_y; tgtLabel = tf.fleet_name; }
        } else if (order.targetSystemId != null) {
          const sys = mapState.systems.get(Number(order.targetSystemId));
          if (sys) {
            const sysHex = Array.from(mapState.hexes.values()).find(h => h.hex_id === sys.hex_id);
            if (sysHex) { tgtX = sysHex.x; tgtY = sysHex.y; tgtLabel = sys.system_name; }
          }
        }
        if (tgtX === null || tgtY === null) {
          issues.push(`${f.fleet_name}: attack target no longer exists`);
          continue;
        }
        const dist = hexDistance(f.hex_x, f.hex_y, tgtX, tgtY);
        if (dist > range) {
          issues.push(`${f.fleet_name}: ${tgtLabel} is ${dist} hex(es) away — exceeds attack range ${range}`);
        }
        if (!liveHexKeys.has(hexKey(tgtX, tgtY))) {
          issues.push(`${f.fleet_name}: ${tgtLabel} is not currently visible`);
        }
      }

      setSubmissionIssues(issues);
    })();
    return () => { cancelled = true; };
  }, [player?.id, player?.player_slot, game?.id, game?.turn_number, mapState, orderRefreshTick, pendingFleetOrders, liveHexKeys]);


  // Any change to a player's orders auto-clears the "Submitted" flag — the player
  // can keep editing freely after submitting; the admin sees "Not Submitted" again
  // until they click Submit Orders.
  const refreshOrders = useCallback(() => {
    setOrderRefreshTick(t => t + 1);
    if (player?.orders_locked && player?.id) {
      (supabase as any).from("game_players").update({ orders_locked: false }).eq("id", player.id);
      setPlayer(p => (p ? { ...p, orders_locked: false } : p));
    }
  }, [player?.id, player?.orders_locked]);

  const submitOrders = useCallback(async () => {
    if (!player || !game) return;
    if (submissionIssues.length > 0 && (!player.orders_locked || isSolo)) {
      toast({
        title: "Cannot submit",
        description: `Resolve ${submissionIssues.length} open issue${submissionIssues.length === 1 ? "" : "s"} first.`,
        variant: "destructive",
      });
      return;
    }

    // Solo flow: lock orders, process the turn immediately, refetch.
    if (isSolo) {
      if (processingTurn) return;
      setProcessingTurn(true);
      try {
        await (supabase as any).from("game_players").update({ orders_locked: true }).eq("id", player.id);
        playOrdersSubmitted();
        await processTurn(supabase as any, game.id);
        await load();
        toast({ title: "Turn processed", description: `Now accepting orders for Turn ${game.turn_number + 1}.` });
      } catch (err: any) {
        toast({ title: "Turn failed", description: err?.message || String(err), variant: "destructive" });
      } finally {
        setProcessingTurn(false);
      }
      return;
    }

    // Multiplayer flow: toggle the submitted flag.
    const next = !player.orders_locked;
    const { error } = await (supabase as any).from("game_players").update({ orders_locked: next }).eq("id", player.id);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    setPlayer(p => (p ? { ...p, orders_locked: next } : p));
    if (next) playOrdersSubmitted();
    toast({ title: next ? "Orders Submitted" : "Orders Withdrawn", description: next ? "Your orders are marked submitted." : "Your orders are no longer marked submitted." });
  }, [player, game, toast, submissionIssues, isSolo, processingTurn, load]);

  const combatPointsAvailable = Math.max(0, (player?.combat_points_remaining ?? 0) - pendingFleetOrderCount);
  const adminPointsAvailable = Math.max(0, (player?.admin_points_remaining ?? 0) - pendingBuildAdminPoints);

  const advanceInit = async () => {
    if (initStep < 3) {
      setInitStep(initStep + 1);
      return;
    }
    if (player) {
      await (supabase as any).from("game_players").update({ initialized: true }).eq("id", player.id);
      setPlayer({ ...player, initialized: true });
      setInitStep(0);
    }
  };

  const handleModeChange = (mode: GameMode) => {
    setActiveMode(mode);
    setSelection({ type: "none" });
    setRightPanelOpen(true);
  };

  const handleViewNews = () => {
    const firstUnread = DUMMY_NEWS.find((n) => !n.read);
    if (firstUnread) {
      setSelection({ type: "news", id: firstUnread.id });
    }
    setRightPanelOpen(true);
  };

  const handleSystemClick = (system: SystemData) => {
    setSelection({ type: "region", id: `sys-${system.system_id}` });
    setRightPanelOpen(true);
  };

  const handleFleetClick = (fleet: MapFleet) => {
    setSelection({ type: "army", id: `fleet-${fleet.fleet_id}` });
    setRightPanelOpen(true);
  };

  /** Create a new empty fleet on a player-owned hex. Costs 1 combat point. */
  const handleCreateFleet = useCallback(async (name: string, hexX: number, hexY: number) => {
    if (!player || !game || !mapState) return;
    const trimmed = name.trim();
    if (!trimmed) {
      toast({ title: "Name required", description: "Give the fleet a name.", variant: "destructive" });
      return;
    }
    if (combatPointsAvailable < 1) {
      toast({ title: "No combat points", description: "Creating a fleet costs 1 combat point.", variant: "destructive" });
      return;
    }
    const ownClass = `PROVINCE_${player.player_slot}`;
    const hex = mapState.hexes.get(hexKey(hexX, hexY));
    if (!hex) {
      toast({ title: "Invalid hex", description: "That hex does not exist.", variant: "destructive" });
      return;
    }
    const sys = Array.from(mapState.systems.values()).find(s => s.hex_id === hex.hex_id);
    const owns = hex.classification === ownClass || (sys && sys.owner === ownClass);
    if (!owns) {
      toast({ title: "Not your hex", description: "You can only place fleets on hexes you own.", variant: "destructive" });
      return;
    }
    if (mapState.fleets.some(f => f.hex_x === hexX && f.hex_y === hexY)) {
      toast({ title: "Hex occupied", description: "There is already a fleet on that hex.", variant: "destructive" });
      return;
    }
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) throw new Error("Not signed in");
      const { data: tpl, error: e1 } = await (supabase as any)
        .from("fleets")
        .insert({ owner_user_id: authUser.id, name: trimmed, points_budget: 0 })
        .select("id").single();
      if (e1 || !tpl) throw e1 || new Error("fleet create failed");
      const { data: gf, error: e2 } = await (supabase as any)
        .from("game_fleets")
        .insert({
          game_id: game.id, fleet_id: tpl.id, fleet_name: trimmed,
          owner_classification: ownClass, hex_x: hexX, hex_y: hexY,
        })
        .select("id").single();
      if (e2 || !gf) throw e2 || new Error("game fleet create failed");
      const newMapFleet: MapFleet = {
        fleet_id: gf.id, fleet_name: trimmed, owner_classification: ownClass,
        hex_x: hexX, hex_y: hexY, source_fleet_id: tpl.id,
      };
      const updated: MapState = { ...mapState, fleets: [...mapState.fleets, newMapFleet] };
      const serialized = {
        mapData: updated.mapData,
        hexes: Array.from(updated.hexes.entries()),
        systems: Array.from(updated.systems.entries()),
        regions: updated.regions,
        facilityTypes: updated.facilityTypes,
        fleets: updated.fleets,
      };
      await (supabase as any).from("games").update({ map_data_json: serialized }).eq("id", game.id);
      const newCP = Math.max(0, (player.combat_points_remaining ?? 0) - 1);
      await (supabase as any).from("game_players").update({ combat_points_remaining: newCP }).eq("id", player.id);
      setMapState(updated);
      setPlayer({ ...player, combat_points_remaining: newCP });
      playOrderPlaced();
      toast({ title: "Fleet Commissioned", description: `${trimmed} stationed at (${hexX}, ${hexY}).` });
    } catch (e: any) {
      toast({ title: "Error", description: e.message ?? String(e), variant: "destructive" });
    }
  }, [player, game, mapState, combatPointsAvailable, toast]);

  const handleBuildFacility = async (systemId: number, facilityTypeId: string) => {
    if (!player || !game) return;
    try {
      await (supabase as any).from("player_orders").insert({
        game_id: game.id,
        player_id: player.id,
        turn_number: game.turn_number,
        order_type: "build_facility",
        order_json: { system_id: systemId, facility_type_id: facilityTypeId },
        notes: "",
      });
      playOrderPlaced();
      toast({ title: "Order Submitted", description: "Facility construction order queued." });
      refreshOrders();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  /** Undo a build_facility order placed this turn (deletes the player_orders row). */
  const handleUndoBuildOrder = async (orderId: string) => {
    if (!player || !game) return;
    try {
      await (supabase as any)
        .from("player_orders")
        .delete()
        .eq("id", orderId)
        .eq("player_id", player.id);
      toast({ title: "Order Undone", description: "Construction order removed." });
      refreshOrders();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  /** Queue a cancel-without-refund for an in-progress facility from a previous turn. */
  const handleCancelInProduction = async (systemId: number, facilityTypeId: string) => {
    if (!player || !game) return;
    try {
      await (supabase as any).from("player_orders").insert({
        game_id: game.id,
        player_id: player.id,
        turn_number: game.turn_number,
        order_type: "other",
        order_json: { kind: "cancel_build", system_id: systemId, facility_type_id: facilityTypeId },
        notes: "",
      });
      toast({ title: "Cancellation Queued", description: "Construction will be halted next turn (no refund)." });
      refreshOrders();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  /** Undo a queued cancel-build order placed this turn. */
  const handleUndoCancelBuild = async (systemId: number, facilityTypeId: string) => {
    if (!player || !game) return;
    try {
      const { data: rows } = await (supabase as any)
        .from("player_orders")
        .select("id, order_json")
        .eq("game_id", game.id)
        .eq("player_id", player.id)
        .eq("turn_number", game.turn_number)
        .eq("order_type", "other");
      const target = (rows || []).find(
        (r: any) =>
          r.order_json?.kind === "cancel_build" &&
          Number(r.order_json?.system_id) === systemId &&
          String(r.order_json?.facility_type_id) === String(facilityTypeId),
      );
      if (target) {
        await (supabase as any).from("player_orders").delete().eq("id", target.id);
        refreshOrders();
      }
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const handleHexTargetPicked = async (hex: { x: number; y: number }) => {
    if (!player || !game || !targeting || targeting.mode !== "hex") return;
    if (combatPointsAvailable <= 0) {
      toast({ title: "No combat points", description: "Cancel another fleet order first.", variant: "destructive" });
      setTargeting(null);
      return;
    }
    // Block check: a fleet may not be ordered to a hex closed to this player
    // (CORE for everyone; foreign-faction systems for non-owners).
    const destHex = mapState?.hexes.get(hexKey(hex.x, hex.y));
    const destSystem = destHex
      ? Array.from(mapState!.systems.values()).find(s => s.hex_id === destHex.hex_id)
      : undefined;
    if (destHex) {
      const check = isHexBlockedForPlayer(destHex, destSystem, player.player_slot);
      if (check.blocked) {
        toast({ title: "Destination blocked", description: check.message, variant: "destructive" });
        setTargeting(null);
        return;
      }
    }
    try {
      await (supabase as any).from("player_orders")
        .delete()
        .eq("game_id", game.id).eq("player_id", player.id).eq("turn_number", game.turn_number)
        .eq("order_type", "fleet_move")
        .filter("order_json->>fleet_id", "eq", targeting.fleetId);
      await (supabase as any).from("player_orders").insert({
        game_id: game.id,
        player_id: player.id,
        turn_number: game.turn_number,
        order_type: "fleet_move",
        order_json: { fleet_id: targeting.fleetId, dest_x: hex.x, dest_y: hex.y },
        notes: "",
      });
      playOrderPlaced();
      toast({ title: "Move Order Set", description: `Destination (${hex.x}, ${hex.y})` });
      refreshOrders();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setTargeting(null);
    }
  };

  const handleFleetTargetPicked = async (target: MapFleet) => {
    if (!player || !game || !targeting || targeting.mode !== "fleet") return;
    if (target.fleet_id === targeting.fleetId) {
      toast({ title: "Invalid target", description: "Cannot target the same fleet.", variant: "destructive" });
      return;
    }
    if (combatPointsAvailable <= 0) {
      toast({ title: "No combat points", description: "Cancel another fleet order first.", variant: "destructive" });
      setTargeting(null);
      return;
    }
    // Range + visibility check.
    const sourceFleet = mapState?.fleets.find(f => f.fleet_id === targeting.fleetId);
    if (sourceFleet) {
      const speed = await fetchFleetMapSpeed(supabase as any, sourceFleet.fleet_id);
      const range = attackRangeFromMapSpeed(speed);
      const dist = hexDistance(sourceFleet.hex_x, sourceFleet.hex_y, target.hex_x, target.hex_y);
      if (dist > range) {
        toast({ title: "Out of range", description: `Target is ${dist} hex(es) away. Attack range is ${range} (map speed ${speed}).`, variant: "destructive" });
        setTargeting(null);
        return;
      }
      if (!liveHexKeys.has(hexKey(target.hex_x, target.hex_y))) {
        toast({ title: "Target not visible", description: "You can only attack targets currently within sensor range.", variant: "destructive" });
        setTargeting(null);
        return;
      }
    }
    try {
      await (supabase as any).from("player_orders")
        .delete()
        .eq("game_id", game.id).eq("player_id", player.id).eq("turn_number", game.turn_number)
        .eq("order_type", "other")
        .filter("order_json->>fleet_id", "eq", targeting.fleetId)
        .filter("order_json->>kind", "eq", "fleet_attack");
      await (supabase as any).from("player_orders").insert({
        game_id: game.id,
        player_id: player.id,
        turn_number: game.turn_number,
        order_type: "other",
        order_json: { kind: "fleet_attack", fleet_id: targeting.fleetId, target_fleet_id: target.fleet_id },
        notes: "",
      });
      playOrderPlaced();
      toast({ title: "Attack Order Set", description: `Target: ${target.fleet_name}` });
      refreshOrders();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setTargeting(null);
    }
  };

  const handleSystemTargetPicked = async (system: import("@/lib/mapTypes").SystemData) => {
    if (!player || !game || !targeting || targeting.mode !== "fleet") return;
    // Look up the source fleet to validate ownership rule (don't attack own planet).
    const sourceFleet = mapState?.fleets.find(f => f.fleet_id === targeting.fleetId);
    if (sourceFleet && (system.owner || "").trim().toLowerCase() === (sourceFleet.owner_classification || "").trim().toLowerCase() && (system.owner || "").trim() !== "") {
      toast({ title: "Invalid target", description: "Cannot invade your own planet.", variant: "destructive" });
      setTargeting(null);
      return;
    }
    if (combatPointsAvailable <= 0) {
      toast({ title: "No combat points", description: "Cancel another fleet order first.", variant: "destructive" });
      setTargeting(null);
      return;
    }
    // Range + visibility check.
    if (sourceFleet && mapState) {
      const sysHex = Array.from(mapState.hexes.values()).find(h => h.hex_id === system.hex_id);
      if (sysHex) {
        const speed = await fetchFleetMapSpeed(supabase as any, sourceFleet.fleet_id);
        const range = attackRangeFromMapSpeed(speed);
        const dist = hexDistance(sourceFleet.hex_x, sourceFleet.hex_y, sysHex.x, sysHex.y);
        if (dist > range) {
          toast({ title: "Out of range", description: `Target planet is ${dist} hex(es) away. Attack range is ${range} (map speed ${speed}).`, variant: "destructive" });
          setTargeting(null);
          return;
        }
        if (!liveHexKeys.has(hexKey(sysHex.x, sysHex.y))) {
          toast({ title: "Target not visible", description: "You can only attack targets currently within sensor range.", variant: "destructive" });
          setTargeting(null);
          return;
        }
      }
    }
    try {
      await (supabase as any).from("player_orders")
        .delete()
        .eq("game_id", game.id).eq("player_id", player.id).eq("turn_number", game.turn_number)
        .eq("order_type", "other")
        .filter("order_json->>fleet_id", "eq", targeting.fleetId)
        .filter("order_json->>kind", "eq", "fleet_attack");
      await (supabase as any).from("player_orders").insert({
        game_id: game.id,
        player_id: player.id,
        turn_number: game.turn_number,
        order_type: "other",
        order_json: { kind: "fleet_attack", fleet_id: targeting.fleetId, target_system_id: system.system_id },
        notes: "",
      });
      playOrderPlaced();
      toast({ title: "Attack Order Set", description: `Target planet: ${system.system_name}` });
      refreshOrders();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setTargeting(null);
    }
  };



  // (visibility hooks moved above — needed by the submission-issues effect)


  // Ambient game music — loops quietly while in this view
  useGameMusic(true, 0.15);

  // Persist newly-discovered systems back to player.visible_system_ids so the
  // "ever seen" memory survives reloads and turn rollover.
  useEffect(() => {
    if (!player || !mapState) return;
    const persisted = new Set((player.visible_system_ids ?? []) as number[]);
    const newlySeen = liveVisibleIds.filter(id => !persisted.has(id));
    if (newlySeen.length === 0) return;
    const merged = Array.from(new Set([...persisted, ...newlySeen]));
    (supabase as any)
      .from("game_players")
      .update({ visible_system_ids: merged })
      .eq("id", player.id)
      .then(() => {
        setPlayer(p => p ? { ...p, visible_system_ids: merged } : p);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveVisibleIds.join(","), player?.id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-ivory flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="w-8 h-8 border-2 border-bronze/30 border-t-bronze rounded-full animate-spin mx-auto" />
          <p className="text-muted-foreground font-heading uppercase tracking-widest text-[10px]">
            Establishing Command Link...
          </p>
        </div>
      </div>
    );
  }

  if (!game || !player) return null;

  const factionName = PROVINCE_NAMES[player.player_slot] || `Faction ${player.player_slot}`;
  const playerName = profile?.display_name || profile?.email || "Unknown";

  // Derive an arrow for the currently selected fleet if it has a pending move/attack order.
  const orderArrow = (() => {
    if (selection.type !== "army" || !mapState) return null;
    const fleetId = selection.id.startsWith("fleet-") ? selection.id.slice("fleet-".length) : selection.id;
    const fleet = mapState.fleets.find(f => f.fleet_id === fleetId);
    if (!fleet) return null;
    const order = pendingFleetOrders.get(fleetId);
    if (!order) return null;
    if (order.kind === "move" && typeof order.destX === "number" && typeof order.destY === "number") {
      return { fromX: fleet.hex_x, fromY: fleet.hex_y, toX: order.destX, toY: order.destY, kind: "move" as const };
    }
    if (order.kind === "attack" && order.targetFleetId) {
      const target = mapState.fleets.find(f => f.fleet_id === order.targetFleetId);
      if (!target) return null;
      return { fromX: fleet.hex_x, fromY: fleet.hex_y, toX: target.hex_x, toY: target.hex_y, kind: "attack" as const };
    }
    if (order.kind === "attack" && typeof order.targetSystemId === "number") {
      const sys = mapState.systems.get(order.targetSystemId);
      if (!sys) return null;
      const hex = Array.from(mapState.hexes.values()).find(h => h.hex_id === sys.hex_id);
      if (!hex) return null;
      return { fromX: fleet.hex_x, fromY: fleet.hex_y, toX: hex.x, toY: hex.y, kind: "attack" as const };
    }
    return null;
  })();

  // Real dispatches sourced from game_logs (currently: planet capture / colonize
  // events involving this player's province). Falls back to dummy story flavor
  // for everything else.
  const rebasedNews = (() => {
    const currentTurn = game.turn_number;
    const maxDummyTurn = Math.max(...DUMMY_NEWS.map(n => n.turn));
    const offset = currentTurn - maxDummyTurn;
    const dummy = DUMMY_NEWS.map(n => ({ ...n, turn: Math.max(1, n.turn + offset) }));
    const real = realDispatches;
    // Real first, then dummy — most recent first within each.
    return [...real, ...dummy];
  })();

  if (!player.initialized && initStep > 0) {
    return <InitScreen step={initStep} factionName={factionName} onContinue={advanceInit} />;
  }

  return (
    <div className="h-screen flex flex-col bg-ivory overflow-hidden">
      <GameHeader
        gameName={game.name}
        turnNumber={game.turn_number}
        factionName={factionName}
        playerName={playerName}
        backTo={isAdmin ? "/admin/games" : "/new-game"}
        isImpersonating={isAdmin}
      />

      <div className={`flex-1 flex overflow-hidden ${isMobile ? "flex-col" : ""}`}>
        {/* Left Strategic Panel — includes inline context on tablet */}
        <LeftPanel
          stats={{
            ...DUMMY_STATS,
            treasury: player?.treasury ?? 0,
            tribute: player?.last_tribute ?? 0,
            maintenance: player?.last_maintenance ?? 0,
            adminCapability: player?.admin_capability ?? 3,
            combatCapability: player?.combat_capability ?? 3,
            adminPointsRemaining: player?.admin_points_remaining ?? 3,
            combatPointsRemaining: player?.combat_points_remaining ?? 3,
            combatPointsPending: pendingFleetOrderCount,
            adminPointsPending: pendingBuildAdminPoints,
            costsPending: pendingBuildCost,
          }}
          news={rebasedNews}
          activeMode={activeMode}
          onModeChange={handleModeChange}
          onViewNews={handleViewNews}
          ordersSubmitted={!!player?.orders_locked}
          onSubmitOrders={submitOrders}
          submissionIssues={submissionIssues}
          soloMode={isSolo}
          processingTurn={processingTurn}
          inlineContext={{
            mode: activeMode,
            selection,
            news: rebasedNews,
            onClearSelection: () => setSelection({ type: "none" }),
            gameData: mapState ? {
              systems: mapState.systems,
              fleets: mapState.fleets,
              facilityTypes: dbFacilityTypes,
              facilityTypesFull: dbFacilityTypesFull,
              shipTypes: dbShipTypes,
              hexes: mapState.hexes,
            } : undefined,
            playerOwnerClassification: `PROVINCE_${player.player_slot}`,
            fleetOrderContext: { gameId: game.id, playerId: player.id, turnNumber: game.turn_number },
            onStartTargeting: setTargeting,
            combatPointsAvailable,
            onOrdersChanged: refreshOrders,
            onSelect: setSelection,
            onBuildFacility: handleBuildFacility,
            onUndoBuildOrder: handleUndoBuildOrder,
            onCreateFleet: handleCreateFleet,
            onCancelInProduction: handleCancelInProduction,
            onUndoCancelBuild: handleUndoCancelBuild,
            pendingBuildOrders,
            pendingCancelBuildOrders,
            playerTreasury: player?.treasury ?? 0,
            adminPointsAvailable,
          }}
          fullWidth={isMobile}
        />

        {/* Center Map + Overlay Demo */}
        <div className="flex-1 flex flex-col overflow-hidden relative">
          {isAdmin && (
            <label className="absolute top-2 right-2 z-20 flex items-center gap-2 rounded bg-background/90 border border-bronze/30 px-2 py-1 text-[10px] font-heading uppercase tracking-wider text-foreground cursor-pointer hover:bg-background">
              <input
                type="checkbox"
                checked={adminRevealAll}
                onChange={(e) => setAdminRevealAll(e.target.checked)}
                className="h-3 w-3 accent-crimson"
              />
              Admin: Reveal Full Map
            </label>
          )}
          {mapState ? (
            <PlayerMapCanvas
              hexes={mapState.hexes}
              systems={mapState.systems}
              visibleSystemIds={effectiveLiveSystemIds}
              everSeenSystemIds={effectiveEverSeenSystemIds}
              fleets={mapState.fleets}
              onSystemClick={handleSystemClick}
              onFleetClick={handleFleetClick}
              targetingMode={targeting?.mode ?? null}
              onHexTargetPicked={handleHexTargetPicked}
              onFleetTargetPicked={handleFleetTargetPicked}
              onSystemTargetPicked={handleSystemTargetPicked}
              onCancelTargeting={() => setTargeting(null)}
              debugVisibleHexKeys={effectiveLiveHexKeys}
              everSeenHexKeys={effectiveEverSeenHexKeys}
              orderArrow={orderArrow}
              ownClassification={`PROVINCE_${player.player_slot}`}
              className="flex-1"
            />
          ) : (
            <div className="flex-1 bg-ivory-dark flex items-center justify-center">
              <p className="text-muted-foreground font-heading uppercase tracking-widest text-[10px]">
                No map data available
              </p>
            </div>
          )}
          <OverlayDemoBar />
        </div>

        {/* Right Context Panel removed — content now rendered inline in LeftPanel */}
      </div>
    </div>
  );
};

/* ── Initialization Screens Component ── */
function InitScreen({ step, factionName, onContinue }: { step: number; factionName: string; onContinue: () => void }) {
  const screens = [
    {
      title: "History of the Republic",
      body: "The Third Republic spans a vast network of star systems, bound together by ancient pacts and the iron will of its provincial governors. For centuries, the Republic has stood as a beacon of order in a turbulent galaxy — but beneath the surface, ambition stirs. The provinces grow restless, and a new era is about to begin.",
    },
    {
      title: `The Province of ${factionName}`,
      body: `You are the governor of ${factionName}, one of the six great provinces of the Republic. Your province has a storied history of resilience and ambition. Its people look to you for leadership in the trials ahead. The resources under your command, the fleets at your disposal, and the alliances you forge will determine whether ${factionName} rises to supremacy or falls into obscurity.`,
    },
    {
      title: "Recent Events",
      body: "Tensions across the Republic have reached a breaking point. Trade disputes, border skirmishes, and political maneuvering have fractured the fragile peace. The Senate is gridlocked, and the provinces must now chart their own course. The game is about to begin — your decisions will shape the fate of the Republic.",
    },
  ];

  const screen = screens[step - 1];

  return (
    <div className="min-h-screen bg-ivory flex items-center justify-center p-6">
      <div className="max-w-xl w-full space-y-8 text-center">
        <div className="space-y-1">
          <p className="text-[10px] uppercase tracking-[0.2em] text-bronze font-heading font-semibold">{step} of 3</p>
          <h1 className="text-3xl font-heading font-bold text-foreground">{screen.title}</h1>
        </div>
        <div className="laurel-divider">❦</div>
        <p className="text-muted-foreground leading-relaxed text-base">{screen.body}</p>
        <Button
          size="lg"
          onClick={onContinue}
          className="px-10 bg-crimson hover:bg-crimson-light text-primary-foreground font-heading uppercase tracking-wider"
        >
          {step < 3 ? "Continue" : "Enter the Republic"}
        </Button>
      </div>
    </div>
  );
}

export default PlayerGame;
