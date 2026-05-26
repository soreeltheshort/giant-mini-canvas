import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

const TITLE_BG =
  "https://komjfcrtwzxssugvsbyc.supabase.co/storage/v1/object/public/images/TitleScreenBackground.png";

interface GameRowInfo {
  game_id: string;
  game_name: string;
  game_status: string;
  turn_number: number;
  faction_id: string | null;
  faction_name: string;
  is_player_faction: boolean;
  initialized: boolean;
  isOwnAssignment: boolean;
}

const HEX_CLIP =
  "polygon(14px 0, calc(100% - 14px) 0, 100% 50%, calc(100% - 14px) 100%, 14px 100%, 0 50%)";

const MyGames = () => {
  const { user, loading, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [playerRows, setPlayerRows] = useState<GameRowInfo[]>([]);
  const [aiRows, setAiRows] = useState<GameRowInfo[]>([]);
  const [loadingGames, setLoadingGames] = useState(true);

  useEffect(() => {
    if (!loading && !user) navigate("/login");
  }, [loading, user, navigate]);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      setLoadingGames(true);

      // 1. Find games where the current user is assigned to a faction
      const { data: myAssignments } = await (supabase as any)
        .from("game_factions")
        .select("game_id, faction_id, player_slot, initialized, factions:faction_id(name, is_player_faction)")
        .eq("user_id", user.id);

      const gameIds = Array.from(new Set((myAssignments ?? []).map((p: any) => p.game_id)));

      if (gameIds.length === 0) {
        setPlayerRows([]);
        setAiRows([]);
        setLoadingGames(false);
        return;
      }

      const { data: gameRows } = await (supabase as any)
        .from("games")
        .select("id, name, status, turn_number")
        .in("id", gameIds);
      const gameMap = new Map((gameRows ?? []).map((g: any) => [g.id, g]));

      // 2. Player section: user's own assignments
      const myRows: GameRowInfo[] = (myAssignments ?? [])
        .map((p: any) => {
          const g = gameMap.get(p.game_id) as any;
          if (!g) return null;
          return {
            game_id: g.id,
            game_name: g.name,
            game_status: g.status,
            turn_number: g.turn_number,
            faction_id: p.faction_id,
            faction_name: p.factions?.name ?? "—",
            is_player_faction: !!p.factions?.is_player_faction,
            initialized: p.initialized,
            isOwnAssignment: true,
          };
        })
        .filter(Boolean) as GameRowInfo[];

      // 3. Non-player factions section (admin only): all AI factions in those same games
      let nonPlayerRows: GameRowInfo[] = [];
      if (isAdmin) {
        const { data: allInGames } = await (supabase as any)
          .from("game_factions")
          .select("game_id, faction_id, initialized, ai_persona_id, user_id, factions:faction_id(name, is_player_faction)")
          .in("game_id", gameIds);

        nonPlayerRows = (allInGames ?? [])
          .filter((p: any) => !p.factions?.is_player_faction && p.ai_persona_id)
          .map((p: any) => {
            const g = gameMap.get(p.game_id) as any;
            if (!g) return null;
            return {
              game_id: g.id,
              game_name: g.name,
              game_status: g.status,
              turn_number: g.turn_number,
              faction_id: p.faction_id,
              faction_name: p.factions?.name ?? "—",
              is_player_faction: false,
              initialized: p.initialized,
              isOwnAssignment: false,
            };
          })
          .filter(Boolean) as GameRowInfo[];
      }

      setPlayerRows(myRows);
      setAiRows(nonPlayerRows);
      setLoadingGames(false);
    };
    load();
  }, [user, isAdmin]);

  if (loading || !user) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <p className="font-heading uppercase tracking-[0.3em] text-bronze">Loading…</p>
      </div>
    );
  }

  const renderRow = (g: GameRowInfo) => {
    const isActive = g.game_status === "active";
    const actionLabel = !isActive
      ? "Awaiting"
      : g.isOwnAssignment
      ? g.initialized ? "Resume" : "Begin"
      : "Log in as";

    const target = g.isOwnAssignment
      ? `/play/${g.game_id}`
      : `/play/${g.game_id}?asFaction=${g.faction_id}`;

    return (
      <button
        key={`${g.game_id}-${g.faction_id}-${g.isOwnAssignment ? "own" : "ai"}`}
        disabled={!isActive}
        onClick={() => isActive && navigate(target)}
        className={`group relative w-full text-left px-7 py-3
          border border-bronze/60
          bg-gradient-to-b from-black/70 via-black/60 to-black/80
          shadow-[inset_0_1px_0_hsl(var(--bronze)/0.35),0_4px_18px_-6px_rgba(0,0,0,0.8)]
          backdrop-blur-[2px]
          transition-all
          ${
            isActive
              ? "hover:border-gold hover:from-black/80 hover:to-black/90 hover:shadow-[inset_0_1px_0_hsl(var(--gold)/0.5),0_6px_24px_-6px_hsl(var(--gold)/0.35)] cursor-pointer"
              : "opacity-50 cursor-not-allowed"
          }`}
        style={{ clipPath: HEX_CLIP }}
      >
        <div className="flex items-center justify-between gap-4 px-2">
          <div className="min-w-0">
            <div className="font-heading uppercase tracking-[0.22em] text-lg text-gold drop-shadow-[0_2px_4px_rgba(0,0,0,0.85)] truncate">
              {g.game_name}
            </div>
            <div className="font-heading text-[11px] uppercase tracking-[0.3em] text-bronze mt-0.5">
              {g.faction_name} · Turn {g.turn_number} · {g.game_status}
            </div>
          </div>
          <div className="font-heading uppercase tracking-[0.25em] text-xs text-gold/90 shrink-0 pl-3 border-l border-bronze/40">
            {actionLabel}
          </div>
        </div>
      </button>
    );
  };

  const SectionHeader = ({ label }: { label: string }) => (
    <h2 className="font-heading uppercase tracking-[0.35em] text-sm text-bronze text-center mt-4 mb-1 drop-shadow-[0_2px_4px_rgba(0,0,0,0.85)]">
      {label}
    </h2>
  );

  const nothing = playerRows.length === 0 && aiRows.length === 0;

  return (
    <div className="min-h-screen flex flex-col bg-black">
      <main
        className="flex-1 relative bg-center bg-cover bg-no-repeat"
        style={{ backgroundImage: `url(${TITLE_BG})` }}
      >
        <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-black/20 to-black/70 pointer-events-none" />

        <div className="relative z-10 flex flex-col items-center min-h-screen px-4 py-10">
          <h1 className="font-heading uppercase tracking-[0.4em] text-3xl md:text-4xl text-gold drop-shadow-[0_2px_6px_rgba(0,0,0,0.85)] mt-[14vh] mb-8 text-center">
            Load Game
          </h1>

          <div className="w-full max-w-xl flex flex-col gap-3">
            {loadingGames ? (
              <p className="font-heading uppercase tracking-[0.3em] text-bronze text-center text-sm">
                Loading games…
              </p>
            ) : nothing ? (
              <p className="font-heading uppercase tracking-[0.3em] text-bronze text-center text-sm">
                No campaigns assigned to your name.
              </p>
            ) : (
              <>
                {playerRows.length > 0 && (
                  <>
                    <SectionHeader label="Players" />
                    {playerRows.map(renderRow)}
                  </>
                )}
                {aiRows.length > 0 && (
                  <>
                    <SectionHeader label="Non-Player Factions" />
                    {aiRows.map(renderRow)}
                  </>
                )}
              </>
            )}

            <button
              onClick={() => navigate("/new-game")}
              className="mt-6 self-center font-heading uppercase tracking-[0.3em] text-xs text-bronze hover:text-gold transition-colors"
            >
              ← Return to Command Console
            </button>
          </div>
        </div>
      </main>
    </div>
  );
};

export default MyGames;
