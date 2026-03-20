import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import type { MapState, SystemData, MapFleet, FacilityType } from "@/lib/mapTypes";

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
  4: "Dravian", 5: "Marcellan", 6: "Octavan",
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

  const load = useCallback(async () => {
    if (!user || !gameId) return;

    const [{ data: gData }, { data: pData }, { data: prData }, { data: ftData }, { data: stData }] = await Promise.all([
      (supabase as any).from("games").select("id, name, turn_number, status").eq("id", gameId).single(),
      (supabase as any).from("game_players").select("id, player_slot, initialized, visible_system_ids, treasury, last_tribute, last_maintenance, admin_capability, combat_capability, admin_points_remaining, combat_points_remaining").eq("game_id", gameId).eq("user_id", user.id).single(),
      (supabase as any).from("profiles").select("display_name, email").eq("user_id", user.id).single(),
      (supabase as any).from("facility_types").select("id, name, description, icon, fighter_capacity, gunship_capacity, cost, turns_to_build, max_per_system, consumed_facility_id, maintenance"),
      (supabase as any).from("ship_types").select("id, name, hull_class").in("hull_class", ["FH", "FL", "GS"]),
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
    })));

    const { data: mapRow } = await (supabase as any)
      .from("games")
      .select("map_data_json")
      .eq("id", gameId)
      .single();

    if (mapRow?.map_data_json && Object.keys(mapRow.map_data_json).length > 0) {
      try {
        setMapState(deserializeMapState(mapRow.map_data_json));
      } catch (e) {
        console.error("Failed to deserialize map:", e);
      }
    }

    if (!pData.initialized) {
      setInitStep(1);
    }

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

  const visibleSystemIds = (player.visible_system_ids || []) as number[];

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
