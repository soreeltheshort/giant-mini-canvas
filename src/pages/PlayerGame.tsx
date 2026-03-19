import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

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
}

interface ProfileInfo {
  display_name: string | null;
  email: string | null;
}

const PlayerGame = () => {
  const { gameId } = useParams<{ gameId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [game, setGame] = useState<GameInfo | null>(null);
  const [player, setPlayer] = useState<PlayerInfo | null>(null);
  const [profile, setProfile] = useState<ProfileInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [initStep, setInitStep] = useState(0); // 0=not started, 1-3=screens

  const load = useCallback(async () => {
    if (!user || !gameId) return;

    const [{ data: gData }, { data: pData }, { data: prData }] = await Promise.all([
      (supabase as any).from("games").select("id, name, turn_number, status").eq("id", gameId).single(),
      (supabase as any).from("game_players").select("id, player_slot, initialized").eq("game_id", gameId).eq("user_id", user.id).single(),
      (supabase as any).from("profiles").select("display_name, email").eq("user_id", user.id).single(),
    ]);

    if (!gData || !pData) {
      toast({ title: "Access denied", description: "You are not a player in this game.", variant: "destructive" });
      navigate("/");
      return;
    }

    setGame(gData);
    setPlayer(pData);
    setProfile(prData);

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
    // Step 3 → mark initialized
    if (player) {
      await (supabase as any).from("game_players").update({ initialized: true }).eq("id", player.id);
      setPlayer({ ...player, initialized: true });
      setInitStep(0);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (!game || !player) return null;

  const factionName = PROVINCE_NAMES[player.player_slot] || `Faction ${player.player_slot}`;
  const playerName = profile?.display_name || profile?.email || "Unknown";

  /* ── Initialization Screens ── */
  if (!player.initialized && initStep > 0) {
    return <InitScreen step={initStep} factionName={factionName} onContinue={advanceInit} />;
  }

  /* ── Main Player Screen ── */
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Header */}
      <header className="border-b border-border px-4 py-3 flex items-center justify-between bg-card">
        <div className="flex items-center gap-4">
          <span className="font-heading font-bold text-lg text-primary">Third Republic</span>
          <span className="text-muted-foreground">|</span>
          <span className="font-medium">{game.name}</span>
          <span className="text-muted-foreground text-sm">Turn {game.turn_number}</span>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <span className="text-secondary font-semibold">{factionName}</span>
          <span className="text-muted-foreground">{playerName}</span>
        </div>
      </header>

      {/* Map Area */}
      <div className="flex-1 overflow-auto relative">
        <div className="min-h-[800px] min-w-[1200px] flex items-center justify-center">
          <div className="text-center text-muted-foreground space-y-2">
            <p className="text-lg">Map View</p>
            <p className="text-sm">Your systems will appear here after turn processing populates the map.</p>
          </div>
        </div>
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
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="max-w-xl w-full space-y-8 text-center">
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">{step} of 3</p>
          <h1 className="text-3xl font-heading font-bold text-foreground">{screen.title}</h1>
        </div>
        <p className="text-muted-foreground leading-relaxed text-base">{screen.body}</p>
        <Button size="lg" onClick={onContinue} className="px-10">
          {step < 3 ? "Continue" : "Enter the Republic"}
        </Button>
      </div>
    </div>
  );
}

export default PlayerGame;
