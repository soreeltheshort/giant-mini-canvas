import { useEffect, useState, useCallback, useMemo } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import type { MapState, SystemData, MapFleet, FacilityType, HexData } from "@/lib/mapTypes";
import { hexKey, CLASSIFICATION_LABELS, type HexClassification } from "@/lib/mapTypes";
import { offsetToCube, cubeDistance } from "@/lib/hexUtils";
import { isHexBlockedForPlayer } from "@/lib/hexAccess";
import { fetchFleetMapSpeed, attackRangeFromMapSpeed, hexDistance } from "@/lib/fleetRange";

import GameHeader from "@/components/game-shell/GameHeader";
import LeftPanel from "@/components/game-shell/LeftPanel";
import TestModePanel from "@/components/game-shell/TestModePanel";
import ContextPanel from "@/components/game-shell/ContextPanel";
import type { GameMapData, FacilityTypeFull, ShipTypeLookup } from "@/components/game-shell/ContextPanel";
import PlayerMapCanvas from "@/components/game-shell/PlayerMapCanvas";
import BottomStrip from "@/components/game-shell/BottomStrip";
import OverlayDemoBar from "@/components/game-shell/OverlayDemoBar";
import type { GameMode, MapSelection } from "@/components/game-shell/gameShellTypes";
import { DUMMY_STATS } from "@/components/game-shell/gameShellTypes";
import { useIsTablet } from "@/hooks/useIsTablet";
import { useIsMobile } from "@/hooks/use-mobile";
import { useGameMusic } from "@/hooks/useGameMusic";
import { playOrderPlaced, playOrdersSubmitted } from "@/lib/uiSounds";
import { computeGroupStrikecraftCapacity, type FleetShipRow } from "@/components/game-shell/FleetCompositionEditor";
import { processTurn } from "@/lib/gameLifecycle";
import { computeInfectedHexOwners } from "@/lib/infectedHexes";
import { useFleetSensorRanges } from "@/hooks/useFleetSensorRanges";




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
  player_slot: number | null;
  initialized: boolean;
  visible_system_ids: number[];
  /** Persistent per-player flag set: every hex_id this player's sensors have
   *  ever reached. Append-only — never reset. Used to render the unscouted-hex
   *  indicator and to short-circuit any "is this hex new to me?" check. */
  scouted_hex_ids: number[];
  treasury: number;
  last_tribute: number;
  last_maintenance: number;
  admin_capability: number;
  combat_capability: number;
  admin_points_remaining: number;
  combat_points_remaining: number;
  orders_locked: boolean;
  /** Owner-classification string used by map filters/orders.
   *  For Roman provinces: `PROVINCE_${player_slot}`. For non-player factions
   *  (admin-impersonated AI), the faction's `code_name` (e.g. "Synod_int1"). */
  own_classification: string;
  /** Display name for header / intro screens. */
  faction_name: string;
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
  fleetSensorRanges: Map<string, number>,
): { live: number[]; everSeen: number[] } {
  return useMemo(() => {
    const persisted = ((player?.visible_system_ids ?? []) as number[]);
    if (!player || !mapState) {
      return { live: [], everSeen: persisted };
    }

    const ownProvince = player.own_classification;
    const BASE_RADIUS = 1;

    // hex_id → HexData lookup
    const hexById = new Map<number, HexData>();
    for (const h of mapState.hexes.values()) hexById.set(h.hex_id, h);

    const allSystems = Array.from(mapState.systems.values());
    const live = new Set<number>();

    for (const sys of allSystems) {
      const sysHex = hexById.get(sys.hex_id);
      if (!sysHex) continue;
      if (sysHex.classification === "CORE" || sysHex.classification === ownProvince) {
        live.add(sys.system_id);
      }
      if (sys.owner === ownProvince) live.add(sys.system_id);
    }

    // 2. Sensor scan: scan centers = owned fleets + owned systems, each with
    //    its own radius. Systems use the baseline; fleets use the maximum
    //    sensor_rating across the ships they carry (defaults to baseline).
    const scanCenters: Array<[number, number, number]> = []; // x, y, radius
    for (const sys of allSystems) {
      if (sys.owner === ownProvince) {
        const sysHex = hexById.get(sys.hex_id);
        if (sysHex) scanCenters.push([sysHex.x, sysHex.y, BASE_RADIUS]);
      }
    }
    for (const f of mapState.fleets ?? []) {
      if (f.owner_classification === ownProvince) {
        const r = fleetSensorRanges.get(f.fleet_id) ?? BASE_RADIUS;
        scanCenters.push([f.hex_x, f.hex_y, r]);
      }
    }

    if (scanCenters.length > 0) {
      const centersCube = scanCenters.map(([x, y, r]) => {
        const [cx, cy, cz] = offsetToCube(x, y);
        return [cx, cy, cz, r] as const;
      });
      for (const sys of allSystems) {
        if (live.has(sys.system_id)) continue;
        const sysHex = hexById.get(sys.hex_id);
        if (!sysHex) continue;
        const [sx, sy, sz] = offsetToCube(sysHex.x, sysHex.y);
        for (const [cx, cy, cz, r] of centersCube) {
          if (cubeDistance(sx, sy, sz, cx, cy, cz) <= r) {
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
  }, [player, mapState, fleetSensorRanges]);
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
  fleetSensorRanges: Map<string, number>,
): { live: Set<string>; everSeen: Set<string>; liveHexIds: number[] } {
  return useMemo(() => {
    const live = new Set<string>();
    const everSeen = new Set<string>();
    const liveHexIds: number[] = [];
    if (!player || !mapState) return { live, everSeen, liveHexIds };

    const ownProvince = player.own_classification;
    const BASE_RADIUS = 1;

    // 1. Core + Explored Marches + own-province hexes are always live
    for (const hex of mapState.hexes.values()) {
      if (hex.classification === "CORE" || hex.classification === "MARCHES" || hex.classification === ownProvince) {
        const k = hexKey(hex.x, hex.y);
        if (!live.has(k)) { live.add(k); liveHexIds.push(hex.hex_id); }
      }
    }

    // 2. Sensor centers: owned systems (baseline) + owned fleets (per-fleet
    //    range = max ship sensor_rating, fallback baseline)
    const hexById = new Map<number, HexData>();
    for (const h of mapState.hexes.values()) hexById.set(h.hex_id, h);

    const scanCenters: Array<[number, number, number]> = [];
    for (const sys of mapState.systems.values()) {
      if (sys.owner === ownProvince) {
        const sysHex = hexById.get(sys.hex_id);
        if (sysHex) scanCenters.push([sysHex.x, sysHex.y, BASE_RADIUS]);
      }
    }
    for (const f of mapState.fleets ?? []) {
      if (f.owner_classification === ownProvince) {
        const r = fleetSensorRanges.get(f.fleet_id) ?? BASE_RADIUS;
        scanCenters.push([f.hex_x, f.hex_y, r]);
      }
    }

    if (scanCenters.length > 0) {
      const centersCube = scanCenters.map(([x, y, r]) => {
        const [cx, cy, cz] = offsetToCube(x, y);
        return [cx, cy, cz, r] as const;
      });
      for (const hex of mapState.hexes.values()) {
        const k = hexKey(hex.x, hex.y);
        if (live.has(k)) continue;
        const [sx, sy, sz] = offsetToCube(hex.x, hex.y);
        for (const [cx, cy, cz, r] of centersCube) {
          if (cubeDistance(sx, sy, sz, cx, cy, cz) <= r) {
            live.add(k);
            liveHexIds.push(hex.hex_id);
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

    return { live, everSeen, liveHexIds };
  }, [player, mapState, everSeenSystemIds, fleetSensorRanges]);
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
  const factionName = player.faction_name || `Faction ${player.player_slot ?? "?"}`;
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
  const [searchParams] = useSearchParams();
  /** Admin-only impersonation: when set, load the game_factions row keyed by
   *  faction_id rather than the current user_id. Allows admins to "enter" an
   *  AI-operated faction directly (bypassing the load-game screen). */
  const asFactionId = searchParams.get("asFaction");
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
    | { mode: "hex"; orderType: "commission_fleet"; fleetName: string }
    | { mode: "hex"; orderType: "test_teleport"; fleetId: string; fleetName: string; fromX: number; fromY: number }
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
  const [submissionIssues, setSubmissionIssues] = useState<{ message: string; fleetId?: string }[]>([]);
  /** Player-facing dispatches sourced from game_logs (capture/colonize, etc.) */
  const [realDispatches, setRealDispatches] = useState<import("@/components/game-shell/gameShellTypes").NewsStory[]>([]);
  /** Admin Test Mode: session-only toggle that unlocks direct edits (treasury,
   *  supply, teleport, add/remove ships). Never persists. */
  const [testMode, setTestMode] = useState(false);
  const [teleportArmed, setTeleportArmed] = useState(false);
  const [testModeMapReloadTick, setTestModeMapReloadTick] = useState(0);

  const load = useCallback(async () => {
    if (!user || !gameId) return;

    const useAdminImpersonation = !!(asFactionId && isAdmin);
    const factionSelect = "id, player_slot, initialized, visible_system_ids, scouted_hex_ids, treasury, last_tribute, last_maintenance, admin_capability, combat_capability, admin_points_remaining, combat_points_remaining, orders_locked, faction_id, user_id, factions:faction_id(id, name, code_name, is_player_faction, infect)";
    let factionQuery = (supabase as any)
      .from("game_factions")
      .select(factionSelect)
      .eq("game_id", gameId);
    factionQuery = useAdminImpersonation
      ? factionQuery.eq("faction_id", asFactionId)
      : factionQuery.eq("user_id", user.id);

    const [{ data: gData }, { data: pDataRaw }, { data: prData }, { data: ftData }, { data: stData }] = await Promise.all([
      (supabase as any).from("games").select("id, name, turn_number, status").eq("id", gameId).single(),
      factionQuery.maybeSingle(),
      (supabase as any).from("profiles").select("display_name, email").eq("user_id", user.id).single(),
      (supabase as any).from("facility_types").select("id, name, description, icon, fighter_capacity, gunship_capacity, cost, turns_to_build, max_per_system, consumed_facility_id, maintenance, synod, ship_build_capacity, max_ship_hull_class"),
      (supabase as any).from("ship_types").select("id, name, hull_class, ship_id, class, point_cost, maintenance, map_speed, repair_pod, supply_pod, hull, ground_invasion, scout_sensors, sensor_rating, fighter_bay, gun_ship_link, flavor_description, synod, laser_2_5cm, laser_4_5cm, laser_6_5cm, laser_10cm, laser_14cm, laser_20cm, laser_28cm, laser_50cm, missile_10kg, missile_50kg, missile_100kg, missile_half_kt"),
    ]);

    if (!gData || !pDataRaw) {
      toast({ title: "Access denied", description: "You are not a player in this game.", variant: "destructive" });
      navigate("/");
      return;
    }
    if (gData.status !== "active") {
      toast({ title: "Game not active", description: `This game is currently ${gData.status}. You can enter once it is active.`, variant: "destructive" });
      navigate("/my-games");
      return;
    }
    // Defensive guard: players can only operate player factions. Admins may
    // impersonate any faction (covered by the isAdmin override).
    const joinedFaction = (pDataRaw as any).factions || null;
    const factionIsPlayer = joinedFaction ? !!joinedFaction.is_player_faction : true; // pre-seeding rows have no faction yet
    if (joinedFaction && !factionIsPlayer && !isAdmin) {
      toast({ title: "Faction not playable", description: "Players cannot operate non-player factions.", variant: "destructive" });
      navigate("/my-games");
      return;
    }

    // Derive owner-classification + display name once. For Roman provinces with
    // a numeric seat we still use `PROVINCE_<slot>` (matches legacy map data);
    // for AI factions we fall back to the faction code_name.
    const slot = (pDataRaw as any).player_slot as number | null;
    const fallbackName = slot != null ? (PROVINCE_NAMES[slot] || `Faction ${slot}`) : "Faction";
    const ownClassification =
      slot != null ? `PROVINCE_${slot}` : (joinedFaction?.code_name || joinedFaction?.name || "");
    const factionName = joinedFaction?.name || fallbackName;
    // When admin is impersonating an AI faction, skip the first-login intro.
    const initialized = useAdminImpersonation ? true : !!(pDataRaw as any).initialized;
    const pData: PlayerInfo = {
      ...(pDataRaw as any),
      player_slot: slot,
      initialized,
      own_classification: ownClassification,
      faction_name: factionName,
    };

    setGame(gData);
    setPlayer(pData);
    setProfile(prData);
    try { localStorage.setItem(`lastGame:${user.id}`, gameId); } catch {}

    // Determine if this is a solo game (only one player joined)
    const { count: playerCount } = await (supabase as any)
      .from("game_factions")
      .select("id", { count: "exact", head: true })
      .eq("game_id", gameId);
    setIsSolo((playerCount ?? 0) <= 1);
    (async () => {
      const { data: gpRows } = await supabase
        .from("game_factions")
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
    // Synod-flagged facilities and ships are only available to Synod (infect)
    // factions. The joined faction is authoritative — an admin logged in as a
    // non-Synod faction (e.g. Dravian) sees the same restricted catalog the
    // real player would see, whether or not they are impersonating.
    const factionIsSynod = !!joinedFaction?.infect;
    const canUseSynod = factionIsSynod;
    const visibleFt = (ftData || []).filter((ft: any) => canUseSynod || !ft.synod);
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
      ship_build_capacity: ft.ship_build_capacity || 0,
      max_ship_hull_class: ft.max_ship_hull_class || null,
    })));
    // Hide Synod-flagged ships from non-Synod players in any build/list screen.
    const visibleSt = (stData || []).filter((s: any) => canUseSynod || !s.synod);
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

        // Hydrate persistent movement waypoints from game_fleets (canonical
        // store for dest_x/dest_y/dest_set_turn). The JSON map blob may
        // pre-date the dest columns; reading game_fleets keeps the UI in sync
        // with cancellations that happen between turns.
        try {
          const { data: dests } = await (supabase as any)
            .from("game_fleets")
            .select("fleet_id, dest_x, dest_y, dest_set_turn")
            .eq("game_id", gameId);
          if (dests && Array.isArray(dests)) {
            const byId = new Map<string, any>();
            for (const d of dests) byId.set(d.fleet_id, d);
            for (const f of loadedMap.fleets) {
              const d = byId.get(f.source_fleet_id);
              if (d) {
                f.dest_x = d.dest_x ?? null;
                f.dest_y = d.dest_y ?? null;
                f.dest_set_turn = d.dest_set_turn ?? null;
              }
            }
          }
        } catch (e) {
          console.warn("Failed to hydrate fleet waypoints:", e);
        }

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
  }, [user, gameId, navigate, toast, isAdmin, asFactionId]);

  useEffect(() => { load(); }, [load, testModeMapReloadTick]);

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
  const fleetSensorRanges = useFleetSensorRanges(game?.id);
  const { live: liveVisibleIds, everSeen: everSeenSystemIds } = useComputedVisibility(player, mapState, fleetSensorRanges);
  const { live: liveHexKeysBase, everSeen: everSeenHexKeysBase, liveHexIds } = useVisibleHexKeys(player, mapState, everSeenSystemIds, fleetSensorRanges);

  // Persistent "ever scouted" set of hex_ids. Loaded once from the player row
  // and grown locally as new hexes come into sensor range. Stored as a Set for
  // O(1) per-hex lookup in the map canvas. Append-only — we never clear bits.
  const scoutedHexIds = useMemo(() => {
    return new Set<number>((player?.scouted_hex_ids ?? []) as number[]);
  }, [player?.scouted_hex_ids]);

  // ── Infected-faction hex ownership ─────────────────────────────────────
  // Load all factions flagged `infect=true` once. Their owner strings (e.g.
  // "Synod") are matched against `system.owner`; any matching planet's hex
  // + 6 neighbors are then owned by that infected faction. We accept both
  // the display `name` and the internal `code_name` to cover the
  // "Synod_int1" → "Synod" rollup.
  const [infectedOwnerStrings, setInfectedOwnerStrings] = useState<Set<string>>(new Set());
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await (supabase as any)
        .from("factions")
        .select("name, code_name, infect")
        .eq("infect", true);
      if (cancelled) return;
      const set = new Set<string>();
      for (const f of (data || []) as any[]) {
        if (f.name) set.add(String(f.name));
        if (f.code_name) set.add(String(f.code_name));
      }
      setInfectedOwnerStrings(set);
    })();
    return () => { cancelled = true; };
  }, []);

  const isInfectedOwner = useCallback((owner?: string | null) => {
    if (!owner) return false;
    if (infectedOwnerStrings.has(owner)) return true;
    // Tolerate case differences just in case.
    for (const k of infectedOwnerStrings) {
      if (k.toLowerCase() === owner.toLowerCase()) return true;
    }
    return false;
  }, [infectedOwnerStrings]);

  /** "x,y" → infected owner string for hexes currently controlled by an
   *  infected planet's 1-hex aura. */
  const infectedHexOwners = useMemo(() => {
    if (!mapState || infectedOwnerStrings.size === 0) return new Map<string, string>();
    return computeInfectedHexOwners(mapState.systems.values(), mapState.hexes, isInfectedOwner);
  }, [mapState, infectedOwnerStrings, isInfectedOwner]);


  // Hexes revealed because an enemy fleet attacked us last turn.
  // Rule: "If I am attacked by another fleet, that fleet's hex is visible to me
  // irrespective of my sensor range." Pulls battle_resolved logs from the most
  // recently processed turn where the defender was this player's province and
  // marks the attacker's hex as currently visible. Reveal lasts one turn.
  const [attackerRevealHexKeys, setAttackerRevealHexKeys] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!player || !game) { setAttackerRevealHexKeys(new Set()); return; }
    const ownClass = player.own_classification;
    const lastProcessedTurn = Math.max(0, (game.turn_number ?? 1) - 1);
    if (lastProcessedTurn <= 0) { setAttackerRevealHexKeys(new Set()); return; }
    let cancelled = false;
    (async () => {
      const { data: logs } = await (supabase as any)
        .from("game_logs")
        .select("details_json")
        .eq("game_id", game.id)
        .eq("turn_number", lastProcessedTurn)
        .eq("log_type", "battle_resolved");
      if (cancelled) return;
      const set = new Set<string>();
      for (const l of (logs || []) as any[]) {
        const d = l.details_json || {};
        if (d.defender_owner === ownClass && typeof d.attacker_hex_x === "number" && typeof d.attacker_hex_y === "number") {
          set.add(hexKey(d.attacker_hex_x, d.attacker_hex_y));
        }
      }
      setAttackerRevealHexKeys(set);
    })();
    return () => { cancelled = true; };
  }, [player?.id, game?.id, game?.turn_number]);

  // Hexes the player's OWN infected planets currently control — fold them
  // into visibility (live + everSeen) so an infected player can see their
  // 1-hex aura even without a fleet/sensor present.
  const ownInfectedHexKeys = useMemo(() => {
    const set = new Set<string>();
    if (!player) return set;
    const own = player.own_classification;
    for (const [k, owner] of infectedHexOwners) {
      if (owner === own) set.add(k);
    }
    return set;
  }, [infectedHexOwners, player?.own_classification]);

  const liveHexKeys = useMemo(() => {
    if (attackerRevealHexKeys.size === 0 && ownInfectedHexKeys.size === 0) return liveHexKeysBase;
    const merged = new Set(liveHexKeysBase);
    for (const k of attackerRevealHexKeys) merged.add(k);
    for (const k of ownInfectedHexKeys) merged.add(k);
    return merged;
  }, [liveHexKeysBase, attackerRevealHexKeys, ownInfectedHexKeys]);
  const everSeenHexKeys = useMemo(() => {
    if (attackerRevealHexKeys.size === 0 && ownInfectedHexKeys.size === 0) return everSeenHexKeysBase;
    const merged = new Set(everSeenHexKeysBase);
    for (const k of attackerRevealHexKeys) merged.add(k);
    for (const k of ownInfectedHexKeys) merged.add(k);
    return merged;
  }, [everSeenHexKeysBase, attackerRevealHexKeys, ownInfectedHexKeys]);

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
  const allHexIds = useMemo(() => {
    const set = new Set<number>();
    if (mapState) for (const h of mapState.hexes.values()) set.add(h.hex_id);
    return set;
  }, [mapState]);
  const effectiveLiveSystemIds = isAdmin && adminRevealAll ? allSystemIds : liveVisibleIds;
  const effectiveEverSeenSystemIds = isAdmin && adminRevealAll ? allSystemIds : everSeenSystemIds;
  const effectiveLiveHexKeys = isAdmin && adminRevealAll ? allHexKeys : liveHexKeys;
  const effectiveEverSeenHexKeys = isAdmin && adminRevealAll ? allHexKeys : everSeenHexKeys;
  const effectiveScoutedHexIds = isAdmin && adminRevealAll ? allHexIds : scoutedHexIds;

  // ─── Real dispatches from game_logs ───
  // Pull recent capture/colonize events affecting this player's province
  // (either as the new owner or as the previous owner) and turn them into
  // dispatches in the news feed.
  useEffect(() => {
    if (!player || !game) return;
    const ownClass = player.own_classification;
    const factionLc = (player.faction_name || "").toLowerCase();
    let cancelled = false;
    (async () => {
      // Pull v1 ground-combat dispatches (per-observer rows) alongside legacy
      // planet_captured/colonized rows so older logs still surface.
      const { data: logs } = await (supabase as any)
        .from("game_logs")
        .select("id, turn_number, log_type, message, details_json")
        .eq("game_id", game.id)
        .in("log_type", ["planet_colonized", "planet_captured", "dispatch_ground_combat"])
        .order("created_at", { ascending: false })
        .limit(100);
      if (cancelled) return;
      const matches = (s?: string) => {
        if (!s) return false;
        const lc = s.toLowerCase();
        return s === ownClass || lc === factionLc;
      };

      const stories: import("@/components/game-shell/gameShellTypes").NewsStory[] = [];
      // Dedupe key: (turn, system_id) — prefer v1 dispatch over legacy.
      const seen = new Set<string>();

      // Pass 1: v1 dispatches addressed to this player.
      for (const l of (logs || [])) {
        if (l.log_type !== "dispatch_ground_combat") continue;
        const observerPid = l.details_json?.observer?.player_id;
        if (observerPid !== player.id) continue;
        const sysId = l.details_json?.system?.id;
        const key = `${l.turn_number}:${sysId ?? l.id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const hint = l.details_json?.narration_hints?.headline_seed;
        stories.push({
          id: `log-${l.id}`,
          headline: hint || l.message || "Ground engagement",
          summary: l.message || hint || "",
          turn: l.turn_number,
          read: false,
          category: "military" as const,
        });
      }

      // Pass 2: legacy planet_captured/colonized fallback (skips events
      // already covered by a v1 dispatch above).
      for (const l of (logs || [])) {
        if (l.log_type === "dispatch_ground_combat") continue;
        if (!(matches(l.details_json?.new_owner) || matches(l.details_json?.previous_owner))) continue;
        const sysId = l.details_json?.system_id;
        const key = `${l.turn_number}:${sysId ?? l.id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const isColonize = l.log_type === "planet_colonized";
        const newOwner = l.details_json?.new_owner || "";
        const sysName = l.details_json?.system_name || "an unknown world";
        const ours = matches(newOwner);
        const headline = isColonize
          ? (ours ? `Colony established at ${sysName}` : `${newOwner} colonizes ${sysName}`)
          : (ours ? `${sysName} captured` : `${sysName} lost to ${newOwner}`);
        stories.push({
          id: `log-${l.id}`,
          headline,
          summary: l.message || headline,
          turn: l.turn_number,
          read: false,
          category: "military" as const,
        });
      }

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
    const ownClass = player.own_classification;
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
        // Scuttle ships are removed before movement — they must not drag down
        // the fleet's attack range.
        if (raw > 0 && r.tactical_group !== "Scuttle") {
          // Attack range uses the RAW lowest non-zero map_speed across all
          // ships in the fleet — crippled status does NOT affect attack range.
          const cur = speedByFleet.get(r.game_fleet_id);
          if (cur === undefined || raw < cur) speedByFleet.set(r.game_fleet_id, raw);
        }
      }
      const issues: { message: string; fleetId?: string }[] = [];
      for (const f of myFleets) {
        const ships = byFleet.get(f.fleet_id) ?? [];
        const caps = computeGroupStrikecraftCapacity(ships);
        for (const [group, c] of caps.entries()) {
          if (c.fighterUsed > c.fighterCap) {
            issues.push({ message: `${f.fleet_name} · ${group}: fighters ${c.fighterUsed}/${c.fighterCap}`, fleetId: f.fleet_id });
          }
          if (c.gunshipUsed > c.gunshipCap) {
            issues.push({ message: `${f.fleet_name} · ${group}: gunships ${c.gunshipUsed}/${c.gunshipCap}`, fleetId: f.fleet_id });
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
          issues.push({ message: `${f.fleet_name}: attack target no longer exists`, fleetId: f.fleet_id });
          continue;
        }
        const dist = hexDistance(f.hex_x, f.hex_y, tgtX, tgtY);
        if (dist > range) {
          issues.push({ message: `${f.fleet_name}: ${tgtLabel} is ${dist} hex(es) away — exceeds attack range ${range}`, fleetId: f.fleet_id });
        }
        if (!liveHexKeys.has(hexKey(tgtX, tgtY))) {
          issues.push({ message: `${f.fleet_name}: ${tgtLabel} is not currently visible`, fleetId: f.fleet_id });
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
      (supabase as any).from("game_factions").update({ orders_locked: false }).eq("id", player.id);
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
        await (supabase as any).from("game_factions").update({ orders_locked: true }).eq("id", player.id);
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
    const { error } = await (supabase as any).from("game_factions").update({ orders_locked: next }).eq("id", player.id);
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
      await (supabase as any).from("game_factions").update({ initialized: true }).eq("id", player.id);
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
    const firstUnread = realDispatches.find((n) => !n.read);
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
    const ownClass = player.own_classification;
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
      await (supabase as any).from("game_factions").update({ combat_points_remaining: newCP }).eq("id", player.id);
      setMapState(updated);
      setPlayer({ ...player, combat_points_remaining: newCP });
      playOrderPlaced();
      toast({ title: "Fleet Commissioned", description: `${trimmed} stationed at (${hexX}, ${hexY}).` });
    } catch (e: any) {
      toast({ title: "Error", description: e.message ?? String(e), variant: "destructive" });
    }
  }, [player, game, mapState, combatPointsAvailable, toast]);

  /**
   * TEST MODE (admin, in-game): rewrite a system's facilities/garrison directly.
   * Persists by rewriting games.map_data_json (same pattern as handleCreateFleet)
   * and inserts an audit row in game_logs with log_type=test_mode_edit.
   */
  const writeSystemEdit = useCallback(async (
    systemId: number,
    mutate: (sys: SystemData) => SystemData,
    message: string,
    details: Record<string, any>,
  ) => {
    if (!game || !mapState) return;
    const existing = mapState.systems.get(systemId);
    if (!existing) return;
    const updated = mutate(existing);
    const newSystems = new Map(mapState.systems);
    newSystems.set(systemId, updated);
    const nextState: MapState = { ...mapState, systems: newSystems };
    const serialized = {
      mapData: nextState.mapData,
      hexes: Array.from(nextState.hexes.entries()),
      systems: Array.from(nextState.systems.entries()),
      regions: nextState.regions,
      facilityTypes: nextState.facilityTypes,
      fleets: nextState.fleets,
    };
    const { error } = await (supabase as any).from("games").update({ map_data_json: serialized }).eq("id", game.id);
    if (error) { toast({ title: "Test edit failed", description: error.message, variant: "destructive" }); return; }
    setMapState(nextState);
    const { data: { user: authUser } } = await supabase.auth.getUser();
    await (supabase as any).from("game_logs").insert({
      game_id: game.id,
      turn_number: game.turn_number,
      phase: "admin",
      log_type: "test_mode_edit",
      message: `TEST MODE: ${message}`,
      details_json: { ...details, system_id: systemId, admin_user_id: authUser?.id ?? null },
    });
  }, [game, mapState, toast]);

  const handleTestSetFacilityQty = useCallback(async (systemId: number, facilityTypeId: string, quantity: number) => {
    const q = Math.max(0, Math.floor(quantity));
    await writeSystemEdit(systemId, (sys) => {
      const list = [...(sys.facilities || [])];
      const idx = list.findIndex(f => f.facility_type_id === facilityTypeId);
      if (q === 0) {
        if (idx >= 0) list.splice(idx, 1);
      } else if (idx >= 0) {
        list[idx] = { ...list[idx], quantity: q };
      } else {
        list.push({ facility_type_id: facilityTypeId, quantity: q });
      }
      return { ...sys, facilities: list };
    }, `set facility ${facilityTypeId} on system ${systemId} → ×${q}`, { facility_type_id: facilityTypeId, quantity: q });
  }, [writeSystemEdit]);

  const handleTestSetGarrison = useCallback(async (systemId: number, current: number, max: number) => {
    const m = Math.max(0, Math.floor(max));
    const c = Math.max(0, Math.min(m, Math.floor(current)));
    await writeSystemEdit(systemId, (sys) => ({
      ...sys,
      max_ground_defenses: m,
      current_ground_defenses: c,
    }), `set garrison on system ${systemId} → ${c}/${m}`, { current_ground_defenses: c, max_ground_defenses: m });
  }, [writeSystemEdit]);

  /**
   * Recruit +1 ground defense: charges ground_force_replacement_cost from
   * treasury, requires current<max, only allowed for the owning faction.
   * Persists both the system change and the treasury debit.
   */
  const handleRecruitGarrison = useCallback(async (systemId: number) => {
    if (!player || !game || !mapState) return;
    const sys = mapState.systems.get(systemId);
    if (!sys) return;
    if (sys.owner !== player.own_classification) {
      toast({ title: "Not your system", variant: "destructive" }); return;
    }
    if ((sys.current_ground_defenses ?? 0) >= (sys.max_ground_defenses ?? 0)) {
      toast({ title: "Garrison at maximum", description: "Build facilities that grant more capacity." });
      return;
    }
    const cost = 2; // DEFAULT_TURN_CONSTANTS.ground_force_replacement_cost
    if ((player.treasury ?? 0) < cost) {
      toast({ title: "Insufficient treasury", variant: "destructive" }); return;
    }
    const newTreasury = (player.treasury ?? 0) - cost;
    const { error: tErr } = await (supabase as any)
      .from("game_factions").update({ treasury: newTreasury }).eq("id", player.id);
    if (tErr) { toast({ title: "Failed", description: tErr.message, variant: "destructive" }); return; }
    setPlayer(p => p ? { ...p, treasury: newTreasury } : p);
    await writeSystemEdit(
      systemId,
      (s) => ({ ...s, current_ground_defenses: Math.min(s.max_ground_defenses ?? 0, (s.current_ground_defenses ?? 0) + 1) }),
      `recruit garrison at system ${systemId} (cost ${cost} ₡)`,
      { action: "recruit_garrison", cost, player_id: player.id },
    );
  }, [player, game, mapState, writeSystemEdit, toast]);

  /**
   * Disband -1 ground defense: no refund. Owner-only.
   */
  const handleDisbandGarrison = useCallback(async (systemId: number) => {
    if (!player || !game || !mapState) return;
    const sys = mapState.systems.get(systemId);
    if (!sys) return;
    if (sys.owner !== player.own_classification) {
      toast({ title: "Not your system", variant: "destructive" }); return;
    }
    if ((sys.current_ground_defenses ?? 0) <= 0) return;
    await writeSystemEdit(
      systemId,
      (s) => ({ ...s, current_ground_defenses: Math.max(0, (s.current_ground_defenses ?? 0) - 1) }),
      `disband garrison at system ${systemId}`,
      { action: "disband_garrison", player_id: player.id },
    );
  }, [player, game, mapState, writeSystemEdit, toast]);



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

    // ── Test Mode teleport: admin bypass, no combat point cost, no order log.
    if (targeting.orderType === "test_teleport") {
      const { fleetId, fleetName, fromX, fromY } = targeting;
      setTargeting(null);
      setTeleportArmed(false);
      try {
        const { teleportFleet } = await import("@/lib/testMode/testActions");
        await teleportFleet({
          gameId: game.id, turnNumber: game.turn_number,
          gameFleetId: fleetId, fleetName,
          fromX, fromY, toX: hex.x, toY: hex.y,
        });
        setTestModeMapReloadTick(t => t + 1);
        toast({ title: "Teleported", description: `${fleetName} → (${hex.x}, ${hex.y})` });
      } catch (e: any) {
        toast({ title: "Teleport failed", description: e.message, variant: "destructive" });
      }
      return;
    }

    if (combatPointsAvailable <= 0) {
      toast({ title: "No combat points", description: "Cancel another order first.", variant: "destructive" });
      setTargeting(null);
      return;
    }

    // ── Commission fleet branch: validate hex is owned + unoccupied, then create
    if (targeting.orderType === "commission_fleet") {
      const factionLabel = player.own_classification
        ? (CLASSIFICATION_LABELS[player.own_classification as HexClassification] ?? null)
        : null;
      const destHex = mapState?.hexes.get(hexKey(hex.x, hex.y));
      if (!destHex || !mapState) {
        toast({ title: "Invalid hex", description: "Unknown location.", variant: "destructive" });
        setTargeting(null);
        return;
      }
      const sys = Array.from(mapState.systems.values()).find(s => s.hex_id === destHex.hex_id);
      const ownsSystem = !!sys && (sys.owner === player.own_classification || (factionLabel && sys.owner === factionLabel));
      const isOwnProvince = destHex.classification === player.own_classification;
      const isOwnInfectedHex = infectedHexOwners.get(hexKey(hex.x, hex.y)) === player.own_classification;
      if (!ownsSystem && !isOwnProvince && !isOwnInfectedHex) {
        toast({ title: "Not an owned hex", description: "Commission fleets only on your province hexes, owned systems, or hexes you control.", variant: "destructive" });
        return;
      }
      const occupied = mapState.fleets.some(f => f.hex_x === hex.x && f.hex_y === hex.y);
      if (occupied) {
        toast({ title: "Hex occupied", description: "Another fleet already occupies this hex.", variant: "destructive" });
        return;
      }
      const fleetName = targeting.fleetName;
      setTargeting(null);
      await handleCreateFleet(fleetName, hex.x, hex.y);
      return;
    }

    // Block check: a fleet may not be ordered to a hex closed to this player
    // (CORE for everyone; foreign-faction systems for non-owners).
    const destHex = mapState?.hexes.get(hexKey(hex.x, hex.y));
    const destSystem = destHex
      ? Array.from(mapState!.systems.values()).find(s => s.hex_id === destHex.hex_id)
      : undefined;
    if (destHex) {
      const check = isHexBlockedForPlayer(destHex, destSystem, player.player_slot ?? -1);
      if (check.blocked) {
        toast({ title: "Destination blocked", description: check.message, variant: "destructive" });
        setTargeting(null);
        return;
      }
    }
    const fleetId = targeting.fleetId;
    try {
      await (supabase as any).from("player_orders")
        .delete()
        .eq("game_id", game.id).eq("player_id", player.id).eq("turn_number", game.turn_number)
        .eq("order_type", "fleet_move")
        .filter("order_json->>fleet_id", "eq", fleetId);
      await (supabase as any).from("player_orders").insert({
        game_id: game.id,
        player_id: player.id,
        turn_number: game.turn_number,
        order_type: "fleet_move",
        order_json: { fleet_id: fleetId, dest_x: hex.x, dest_y: hex.y },
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
      .from("game_factions")
      .update({ visible_system_ids: merged })
      .eq("id", player.id)
      .then(() => {
        setPlayer(p => p ? { ...p, visible_system_ids: merged } : p);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveVisibleIds.join(","), player?.id]);

  // Persist newly-scouted hex IDs into player.scouted_hex_ids. Append-only:
  // we never clear bits, so the only work each render is a single Set.has
  // probe per live hex and (in the rare turn where a fleet moves into new
  // space) one DB update with just the delta unioned into the prior array.
  useEffect(() => {
    if (!player || !mapState) return;
    const persisted = scoutedHexIds;
    const newly: number[] = [];
    for (const id of liveHexIds) if (!persisted.has(id)) newly.push(id);
    if (newly.length === 0) return;
    const merged = Array.from(new Set<number>([...persisted, ...newly]));
    (supabase as any)
      .from("game_factions")
      .update({ scouted_hex_ids: merged })
      .eq("id", player.id)
      .then(() => {
        setPlayer(p => p ? { ...p, scouted_hex_ids: merged } : p);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveHexIds.length, liveHexIds.join(","), player?.id]);

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

  const factionName = player.faction_name || `Faction ${player.player_slot ?? "?"}`;
  const playerName = profile?.display_name || profile?.email || "Unknown";

  // Derive an arrow for the currently selected fleet if it has a pending
  // move/attack order this turn, or a standing movement waypoint (carried
  // over from a previous turn).
  const orderArrow = (() => {
    if (selection.type !== "army" || !mapState) return null;
    const fleetId = selection.id.startsWith("fleet-") ? selection.id.slice("fleet-".length) : selection.id;
    const fleet = mapState.fleets.find(f => f.fleet_id === fleetId);
    if (!fleet) return null;
    const order = pendingFleetOrders.get(fleetId);
    if (order) {
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
    }
    // Standing waypoint (no fresh order this turn — does not spend a combat point).
    if (typeof fleet.dest_x === "number" && typeof fleet.dest_y === "number"
        && !(fleet.dest_x === fleet.hex_x && fleet.dest_y === fleet.hex_y)) {
      return { fromX: fleet.hex_x, fromY: fleet.hex_y, toX: fleet.dest_x, toY: fleet.dest_y, kind: "move" as const };
    }
    return null;
  })();

  // Player-facing dispatches sourced only from real game_logs events.
  // Dummy/flavor stories have been removed — empty state is expected until
  // real events (captures, colonizations, etc.) occur.
  const rebasedNews = realDispatches;


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
          testModeSlot={isAdmin && testMode ? (
            <TestModePanel
              gameId={game.id}
              turnNumber={game.turn_number}
              gameFactionId={player.id}
              factionName={factionName}
              treasury={player.treasury ?? 0}
              fleets={mapState?.fleets ?? []}
              shipTypes={dbShipTypes}
              selectedGameFleetId={
                selection.type === "army" && selection.id.startsWith("fleet-")
                  ? selection.id.slice("fleet-".length)
                  : null
              }
              teleportArmed={teleportArmed}
              onArmTeleport={(armed) => {
                setTeleportArmed(armed);
                if (!armed) {
                  if (targeting?.orderType === "test_teleport") setTargeting(null);
                  return;
                }
                // Arm: need a selected fleet.
                const selId = selection.type === "army" && selection.id.startsWith("fleet-")
                  ? selection.id.slice("fleet-".length)
                  : null;
                const sel = selId ? mapState?.fleets.find(f => f.fleet_id === selId) : null;
                if (!sel) {
                  toast({ title: "Select a fleet first", variant: "destructive" });
                  setTeleportArmed(false);
                  return;
                }
                setTargeting({
                  mode: "hex", orderType: "test_teleport",
                  fleetId: sel.fleet_id, fleetName: sel.fleet_name,
                  fromX: sel.hex_x, fromY: sel.hex_y,
                });
              }}
              onChanged={() => setTestModeMapReloadTick(t => t + 1)}
            />
          ) : undefined}
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
          onIssueClick={(issue) => {
            if (!issue.fleetId) return;
            setSelection({ type: "army", id: `fleet-${issue.fleetId}` });
            setRightPanelOpen(true);
          }}
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
            playerOwnerClassification: player.own_classification,
            fleetOrderContext: { gameId: game.id, playerId: player.id, turnNumber: game.turn_number },
            onStartTargeting: setTargeting,
            combatPointsAvailable,
            onOrdersChanged: refreshOrders,
            onSelect: setSelection,
            onBuildFacility: handleBuildFacility,
            onUndoBuildOrder: handleUndoBuildOrder,
            onCreateFleet: handleCreateFleet,
            onStartCommissionTargeting: (fleetName: string) =>
              setTargeting({ mode: "hex", orderType: "commission_fleet", fleetName }),
            onCancelInProduction: handleCancelInProduction,
            onUndoCancelBuild: handleUndoCancelBuild,
            pendingBuildOrders,
            pendingCancelBuildOrders,
            playerTreasury: player?.treasury ?? 0,
            adminPointsAvailable,
            testMode: isAdmin && testMode,
            onTestSetFacilityQty: handleTestSetFacilityQty,
            onTestSetGarrison: handleTestSetGarrison,
            onRecruitGarrison: handleRecruitGarrison,
            onDisbandGarrison: handleDisbandGarrison,

          }}
          fullWidth={isMobile}
        />

        {/* Center Map + Overlay Demo */}
        <div className="flex-1 flex flex-col overflow-hidden relative">
          {isAdmin && (
            <div className="absolute top-2 right-2 z-20 flex flex-col items-end gap-1">
              <label className="flex items-center gap-2 rounded bg-background/90 border border-bronze/30 px-2 py-1 text-[10px] font-heading uppercase tracking-wider text-foreground cursor-pointer hover:bg-background">
                <input
                  type="checkbox"
                  checked={adminRevealAll}
                  onChange={(e) => setAdminRevealAll(e.target.checked)}
                  className="h-3 w-3 accent-crimson"
                />
                Admin: Reveal Full Map
              </label>
              <label className={`flex items-center gap-2 rounded px-2 py-1 text-[10px] font-heading uppercase tracking-wider cursor-pointer ${
                testMode
                  ? "bg-crimson text-primary-foreground border border-crimson"
                  : "bg-background/90 border border-bronze/30 text-foreground hover:bg-background"
              }`}>
                <input
                  type="checkbox"
                  checked={testMode}
                  onChange={(e) => { setTestMode(e.target.checked); if (!e.target.checked) { setTeleportArmed(false); if (targeting?.orderType === "test_teleport") setTargeting(null); } }}
                  className="h-3 w-3 accent-crimson"
                />
                Test Mode
              </label>
            </div>
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
              targetingLabel={
                targeting?.orderType === "commission_fleet"
                  ? `Click an owned, unoccupied hex to station "${(targeting as any).fleetName}"`
                  : targeting?.orderType === "test_teleport"
                    ? `TEST MODE: click any hex to teleport "${(targeting as any).fleetName}"`
                    : undefined
              }
              onHexTargetPicked={handleHexTargetPicked}
              onFleetTargetPicked={handleFleetTargetPicked}
              onSystemTargetPicked={handleSystemTargetPicked}
              onCancelTargeting={() => setTargeting(null)}
              debugVisibleHexKeys={effectiveLiveHexKeys}
              everSeenHexKeys={effectiveEverSeenHexKeys}
              scoutedHexIds={effectiveScoutedHexIds}
              orderArrow={orderArrow}
              ownClassification={player.own_classification}
              revealAllFleets={isAdmin && adminRevealAll}
              currentSelectionId={selection.type === "army" || selection.type === "region" ? selection.id : null}
              infectedHexOwners={infectedHexOwners}
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
