import { useEffect, useState, useCallback, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import type { MapState, SystemData, MapFleet, FacilityType, HexData } from "@/lib/mapTypes";
import { hexKey } from "@/lib/mapTypes";
import { offsetToCube, cubeDistance } from "@/lib/hexUtils";

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
}

interface ProfileInfo {
  display_name: string | null;
  email: string | null;
}

function deserializeMapState(json: any): MapState {
  return {
    mapData: json.mapData,
    hexes: new Map(json.hexes),
    systems: new Map(json.systems),
    regions: json.regions || [],
    facilityTypes: json.facilityTypes || [],
    fleets: json.fleets || [],
  };
}

/**
 * Compute effective player visibility for the current turn.
 * Rules (turn 0 / per-turn baseline):
 *  - All Core systems are visible.
 *  - All systems in the player's own province are visible.
 *  - Any system within sensor radius (1 hex) of an owned fleet is visible.
 *  - Any system within sensor radius (1 hex) of an owned system is visible (passive scan).
 *  - Plus anything already persisted in player.visible_system_ids (e.g. scouted last turn).
 */
function useComputedVisibility(
  player: PlayerInfo | null,
  mapState: MapState | null,
): number[] {
  return useMemo(() => {
    if (!player || !mapState) return (player?.visible_system_ids ?? []) as number[];

    const ownProvince = `PROVINCE_${player.player_slot}`;
    const SENSOR_RADIUS = 1;

    // hex_id → HexData lookup
    const hexById = new Map<number, HexData>();
    for (const h of mapState.hexes.values()) hexById.set(h.hex_id, h);

    const allSystems = Array.from(mapState.systems.values());
    const visible = new Set<number>(
      ((player.visible_system_ids ?? []) as number[])
    );

    // 1. Core + own-province systems
    for (const sys of allSystems) {
      const sysHex = hexById.get(sys.hex_id);
      if (!sysHex) continue;
      if (sysHex.classification === "CORE" || sysHex.classification === ownProvince) {
        visible.add(sys.system_id);
      }
      if (sys.owner === ownProvince) visible.add(sys.system_id);
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
      // Pre-compute cube coords of each scan center
      const centersCube = scanCenters.map(([x, y]) => offsetToCube(x, y));
      for (const sys of allSystems) {
        if (visible.has(sys.system_id)) continue;
        const sysHex = hexById.get(sys.hex_id);
        if (!sysHex) continue;
        const [sx, sy, sz] = offsetToCube(sysHex.x, sysHex.y);
        for (const [cx, cy, cz] of centersCube) {
          if (cubeDistance(sx, sy, sz, cx, cy, cz) <= SENSOR_RADIUS) {
            visible.add(sys.system_id);
            break;
          }
        }
      }
    }

    return Array.from(visible);
  }, [player, mapState]);
}

/**
 * DEBUG: compute the set of hex keys (x,y) the player can "see".
 * Rules: Core hexes, own-province hexes, plus 1-hex radius around
 * any owned system or owned fleet (sensor scan).
 */
function useVisibleHexKeys(
  player: PlayerInfo | null,
  mapState: MapState | null,
): Set<string> {
  return useMemo(() => {
    const result = new Set<string>();
    if (!player || !mapState) return result;

    const ownProvince = `PROVINCE_${player.player_slot}`;
    const SENSOR_RADIUS = 1;

    // 1. Core + own-province hexes
    for (const hex of mapState.hexes.values()) {
      if (hex.classification === "CORE" || hex.classification === ownProvince) {
        result.add(hexKey(hex.x, hex.y));
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
        if (result.has(k)) continue;
        const [sx, sy, sz] = offsetToCube(hex.x, hex.y);
        for (const [cx, cy, cz] of centersCube) {
          if (cubeDistance(sx, sy, sz, cx, cy, cz) <= SENSOR_RADIUS) {
            result.add(k);
            break;
          }
        }
      }
    }

    return result;
  }, [player, mapState]);
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

  const load = useCallback(async () => {
    if (!user || !gameId) return;

    const [{ data: gData }, { data: pData }, { data: prData }, { data: ftData }, { data: stData }] = await Promise.all([
      (supabase as any).from("games").select("id, name, turn_number, status").eq("id", gameId).single(),
      (supabase as any).from("game_players").select("id, player_slot, initialized, visible_system_ids, treasury, last_tribute, last_maintenance, admin_capability, combat_capability, admin_points_remaining, combat_points_remaining").eq("game_id", gameId).eq("user_id", user.id).single(),
      (supabase as any).from("profiles").select("display_name, email").eq("user_id", user.id).single(),
      (supabase as any).from("facility_types").select("id, name, description, icon, fighter_capacity, gunship_capacity, cost, turns_to_build, max_per_system, consumed_facility_id, maintenance"),
      (supabase as any).from("ship_types").select("id, name, hull_class, ship_id, class, point_cost, maintenance, map_speed, repair_pod, supply_pod"),
    ]);

    if (!gData || !pData) {
      toast({ title: "Access denied", description: "You are not a player in this game.", variant: "destructive" });
      navigate("/");
      return;
    }

    setGame(gData);
    setPlayer(pData);
    setProfile(prData);
    setDbFacilityTypes((ftData || []).map((ft: any) => ({
      facility_type_id: ft.id,
      name: ft.name,
      description: ft.description || "",
      icon: ft.icon || "🏭",
    })));
    setDbFacilityTypesFull((ftData || []).map((ft: any) => ({
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
    setDbShipTypes((stData || []).map((s: any) => ({
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
  }, [user, gameId, navigate, toast]);

  useEffect(() => { load(); }, [load]);

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
      toast({ title: "Order Submitted", description: "Facility construction order queued." });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const handleHexTargetPicked = async (hex: { x: number; y: number }) => {
    if (!player || !game || !targeting || targeting.mode !== "hex") return;
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
      toast({ title: "Move Order Set", description: `Destination (${hex.x}, ${hex.y})` });
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
      toast({ title: "Attack Order Set", description: `Target: ${target.fleet_name}` });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setTargeting(null);
    }
  };


  // Hooks MUST be called before any early returns (Rules of Hooks)
  const visibleSystemIds = useComputedVisibility(player, mapState);
  const debugVisibleHexKeys = useVisibleHexKeys(player, mapState);

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
        backTo={isAdmin ? "/admin/games" : "/my-games"}
      />

      <div className="flex-1 flex overflow-hidden">
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
          }}
          news={DUMMY_NEWS}
          activeMode={activeMode}
          onModeChange={handleModeChange}
          onViewNews={handleViewNews}
          inlineContext={isTablet ? {
            mode: activeMode,
            selection,
            news: DUMMY_NEWS,
            onClearSelection: () => setSelection({ type: "none" }),
            gameData: mapState ? {
              systems: mapState.systems,
              fleets: mapState.fleets,
              facilityTypes: dbFacilityTypes,
              facilityTypesFull: dbFacilityTypesFull,
              shipTypes: dbShipTypes,
            } : undefined,
            playerOwnerClassification: `PROVINCE_${player.player_slot}`,
            fleetOrderContext: { gameId: game.id, playerId: player.id, turnNumber: game.turn_number },
          } : undefined}
        />

        {/* Center Map + Overlay Demo */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {mapState ? (
            <PlayerMapCanvas
              hexes={mapState.hexes}
              systems={mapState.systems}
              visibleSystemIds={visibleSystemIds}
              fleets={mapState.fleets}
              onSystemClick={handleSystemClick}
              onFleetClick={handleFleetClick}
              debugVisibleHexKeys={debugVisibleHexKeys}
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

        {/* Right Context Panel — hidden on tablet */}
        {!isTablet && rightPanelOpen && (
          <ContextPanel
            mode={activeMode}
            selection={selection}
            news={DUMMY_NEWS}
            onClose={() => setRightPanelOpen(false)}
            onClearSelection={() => setSelection({ type: "none" })}
            onBuildFacility={handleBuildFacility}
            playerTreasury={player?.treasury ?? 0}
            playerOwnerClassification={`PROVINCE_${player.player_slot}`}
            gameData={mapState ? {
              systems: mapState.systems,
              fleets: mapState.fleets,
              facilityTypes: dbFacilityTypes,
              facilityTypesFull: dbFacilityTypesFull,
              shipTypes: dbShipTypes,
            } : undefined}
          />
        )}
      </div>

      <BottomStrip
        mode={activeMode}
        turnNumber={game.turn_number}
        factionName={factionName}
      />
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
