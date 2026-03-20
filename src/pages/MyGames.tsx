import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const PROVINCE_NAMES: Record<number, string> = {
  1: "Valerian", 2: "Aurelian", 3: "Cassian",
  4: "Dravian", 5: "Marcellan", 6: "Octavian",
};

interface PlayerGameInfo {
  game_id: string;
  game_name: string;
  game_status: string;
  turn_number: number;
  player_slot: number;
  initialized: boolean;
}

const MyGames = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [games, setGames] = useState<PlayerGameInfo[]>([]);
  const [loadingGames, setLoadingGames] = useState(true);

  useEffect(() => {
    if (!loading && !user) navigate("/login");
  }, [loading, user, navigate]);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      setLoadingGames(true);
      const { data: players } = await (supabase as any)
        .from("game_players")
        .select("game_id, player_slot, initialized")
        .eq("user_id", user.id);

      if (!players || players.length === 0) {
        setGames([]);
        setLoadingGames(false);
        return;
      }

      const gameIds = players.map((p: any) => p.game_id);
      const { data: gameRows } = await (supabase as any)
        .from("games")
        .select("id, name, status, turn_number")
        .in("id", gameIds);

      if (!gameRows) {
        setGames([]);
        setLoadingGames(false);
        return;
      }

      const gameMap = new Map(gameRows.map((g: any) => [g.id, g]));
      const merged: PlayerGameInfo[] = players
        .map((p: any) => {
          const g = gameMap.get(p.game_id) as any;
          if (!g) return null;
          return {
            game_id: g.id,
            game_name: g.name,
            game_status: g.status,
            turn_number: g.turn_number,
            player_slot: p.player_slot,
            initialized: p.initialized,
          };
        })
        .filter(Boolean) as PlayerGameInfo[];

      setGames(merged);
      setLoadingGames(false);
    };
    load();
  }, [user]);

  if (loading || !user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  const statusColor: Record<string, string> = {
    setup: "bg-yellow-600",
    active: "bg-green-600",
    paused: "bg-orange-600",
    completed: "bg-muted",
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="border-b border-border px-6 py-4 flex items-center justify-between bg-card">
        <span className="font-heading font-bold text-xl text-primary">Third Republic</span>
        <Link to="/">
          <Button variant="ghost" size="sm">Main Menu</Button>
        </Link>
      </header>

      <div className="flex-1 flex flex-col items-center justify-center p-8">
        <div className="max-w-lg w-full space-y-6">
          <h1 className="text-2xl font-heading font-bold text-center">Your Games</h1>

          {loadingGames ? (
            <p className="text-muted-foreground text-center text-sm">Loading games...</p>
          ) : games.length === 0 ? (
            <p className="text-muted-foreground text-center text-sm">You are not assigned to any games yet.</p>
          ) : (
            <div className="space-y-3">
              {games.map((g) => (
                <div
                  key={g.game_id}
                  className="border border-border rounded-md p-4 flex items-center justify-between bg-card hover:bg-accent/30 transition-colors"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{g.game_name}</span>
                      <Badge className={`${statusColor[g.game_status] || "bg-muted"} text-xs`}>
                        {g.game_status}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {PROVINCE_NAMES[g.player_slot] || `Slot ${g.player_slot}`} · Turn {g.turn_number}
                    </p>
                  </div>
                  <Button size="sm" onClick={() => navigate(`/play/${g.game_id}`)}>
                    {g.initialized ? "Load Game" : "Begin"}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MyGames;
