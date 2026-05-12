import { useEffect, useMemo, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import Header from "@/components/Header";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { importFromSqlite } from "@/lib/mapDatabase";
import { materializeGameFleets } from "@/lib/materializeGameFleets";
import { PROVINCE_NAMES } from "@/lib/gameLifecycle";

const TITLE_BG =
  "https://komjfcrtwzxssugvsbyc.supabase.co/storage/v1/object/public/images/TitleScreenBackground.png";

const HEX_CLIP =
  "polygon(14px 0, calc(100% - 14px) 0, 100% 50%, calc(100% - 14px) 100%, 14px 100%, 0 50%)";

const SLOTS = [1, 2, 3, 4, 5, 6];

type Mode = "root" | "join" | "single" | "multi";

interface SetupGame {
  id: string;
  name: string;
  created_at: string;
  occupied: number[];
}

export default function NewGameModes() {
  const { user, isAdmin, loading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [mode, setMode] = useState<Mode>("root");

  useEffect(() => {
    if (!loading && !user) navigate("/login");
  }, [loading, user, navigate]);

  if (loading || !user) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <p className="font-heading uppercase tracking-[0.3em] text-bronze">Loading…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-black">
      {isAdmin && <Header />}
      <main
        className="flex-1 relative bg-center bg-cover bg-no-repeat"
        style={{ backgroundImage: `url(${TITLE_BG})` }}
      >
        <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-black/20 to-black/70 pointer-events-none" />
        <div className="relative z-10 flex flex-col items-center min-h-[calc(100vh-4rem)] px-4 py-10">
          <div className="w-full max-w-2xl mt-[10vh]">
            {mode === "root" && <RootMenu setMode={setMode} />}
            {mode === "join" && <JoinPanel onBack={() => setMode("root")} />}
            {mode === "single" && <SinglePlayerPanel onBack={() => setMode("root")} />}
            {mode === "multi" && <ComingSoonPanel onBack={() => setMode("root")} />}
          </div>
        </div>
      </main>
    </div>
  );
}

/* ───────────────────────── shared visuals ───────────────────────── */

function MenuPlate({
  label,
  sub,
  onClick,
  to,
  disabled,
}: {
  label: string;
  sub?: string;
  onClick?: () => void;
  to?: string;
  disabled?: boolean;
}) {
  const content = (
    <div
      className={`group relative w-full text-center px-8 py-3
        border border-bronze/60
        bg-gradient-to-b from-black/70 via-black/60 to-black/80
        shadow-[inset_0_1px_0_hsl(var(--bronze)/0.35),0_4px_18px_-6px_rgba(0,0,0,0.8)]
        backdrop-blur-[2px]
        transition-all
        ${disabled
          ? "opacity-40 cursor-not-allowed"
          : "hover:border-gold hover:from-black/80 hover:to-black/90 hover:shadow-[inset_0_1px_0_hsl(var(--gold)/0.5),0_6px_24px_-6px_hsl(var(--gold)/0.35)] cursor-pointer"
        }`}
      style={{ clipPath: HEX_CLIP }}
    >
      <div className="font-heading uppercase tracking-[0.25em] text-xl text-gold drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">
        {label}
      </div>
      {sub && (
        <div className="font-heading text-[11px] uppercase tracking-[0.3em] text-bronze mt-0.5">
          {sub}
        </div>
      )}
    </div>
  );
  if (disabled) return <div>{content}</div>;
  if (to) return <Link to={to}>{content}</Link>;
  return <button onClick={onClick} className="w-full">{content}</button>;
}

function PanelFrame({ title, onBack, children }: { title: string; onBack: () => void; children: React.ReactNode }) {
  return (
    <div
      className="relative border border-bronze/60 bg-black/70 backdrop-blur-[2px] p-6
        shadow-[inset_0_1px_0_hsl(var(--bronze)/0.35),0_8px_32px_-12px_rgba(0,0,0,0.9)]"
    >
      <div className="flex items-center justify-between mb-5 pb-3 border-b border-bronze/40">
        <h2 className="font-heading uppercase tracking-[0.3em] text-xl text-gold">{title}</h2>
        <button
          onClick={onBack}
          className="font-heading uppercase tracking-[0.25em] text-xs text-bronze hover:text-gold transition-colors"
        >
          ← Back
        </button>
      </div>
      {children}
    </div>
  );
}

/* ───────────────────────── root menu ───────────────────────── */

function RootMenu({ setMode }: { setMode: (m: Mode) => void }) {
  return (
    <nav className="flex flex-col gap-3">
      <h1 className="font-heading uppercase tracking-[0.4em] text-2xl text-gold text-center mb-6 drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">
        New Game
      </h1>
      <MenuPlate label="Join Game" sub="Take a seat in an open game" onClick={() => setMode("join")} />
      <MenuPlate label="New Single Player Game" sub="Test mode • default map" onClick={() => setMode("single")} />
      <MenuPlate label="New Multiplayer Game" sub="Coming soon" onClick={() => setMode("multi")} />
      <div className="mt-4 text-center">
        <Link
          to="/new-game"
          className="font-heading uppercase tracking-[0.25em] text-xs text-bronze hover:text-gold transition-colors"
        >
          ← Main Menu
        </Link>
      </div>
    </nav>
  );
}

/* ───────────────────────── Join Game ───────────────────────── */

function JoinPanel({ onBack }: { onBack: () => void }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [games, setGames] = useState<SetupGame[]>([]);
  const [loading, setLoading] = useState(true);
  const [joiningKey, setJoiningKey] = useState<string | null>(null);
  const [mySlots, setMySlots] = useState<Record<string, number>>({});

  const refresh = async () => {
    setLoading(true);
    const { data: gameRows } = await (supabase as any)
      .from("games")
      .select("id, name, created_at")
      .eq("status", "setup")
      .order("created_at", { ascending: false });
    const ids = (gameRows || []).map((g: any) => g.id);
    const occupiedMap = new Map<string, number[]>();
    const mineMap: Record<string, number> = {};
    if (ids.length > 0) {
      const { data: gp } = await (supabase as any)
        .from("game_players")
        .select("game_id, player_slot, user_id")
        .in("game_id", ids);
      (gp || []).forEach((row: any) => {
        const arr = occupiedMap.get(row.game_id) || [];
        arr.push(row.player_slot);
        occupiedMap.set(row.game_id, arr);
        if (user && row.user_id === user.id) mineMap[row.game_id] = row.player_slot;
      });
    }
    setGames(
      (gameRows || []).map((g: any) => ({
        id: g.id,
        name: g.name,
        created_at: g.created_at,
        occupied: occupiedMap.get(g.id) || [],
      }))
    );
    setMySlots(mineMap);
    setLoading(false);
  };

  useEffect(() => { refresh(); }, [user?.id]);

  const join = async (gameId: string, slot: number) => {
    if (!user) return;
    const key = `${gameId}:${slot}`;
    setJoiningKey(key);
    const { error } = await (supabase as any)
      .from("game_players")
      .insert({ game_id: gameId, user_id: user.id, player_slot: slot });
    setJoiningKey(null);
    if (error) {
      toast({ title: "Could not join", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Joined game", description: `You are ${PROVINCE_NAMES[slot]}.` });
    navigate(`/play/${gameId}`);
  };

  return (
    <PanelFrame title="Join Game" onBack={onBack}>
      {loading ? (
        <p className="font-heading uppercase tracking-[0.3em] text-bronze text-center py-8">Loading…</p>
      ) : games.length === 0 ? (
        <p className="font-body text-ivory/70 text-center py-8">No games are currently in setup.</p>
      ) : (
        <ul className="space-y-4">
          {games.map((g) => (
            <li key={g.id} className="border border-bronze/40 bg-black/40 p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="font-heading uppercase tracking-[0.2em] text-gold text-lg">{g.name}</div>
                  <div className="font-body text-xs text-bronze/80">
                    {mySlots[g.id]
                      ? `You are seated as ${PROVINCE_NAMES[mySlots[g.id]]}`
                      : `${SLOTS.length - g.occupied.length} of ${SLOTS.length} seats open`}
                  </div>
                </div>
                {mySlots[g.id] && (
                  <button
                    onClick={() => navigate(`/play/${g.id}`)}
                    className="font-heading uppercase tracking-[0.2em] text-xs px-3 py-1.5 border border-gold/60 text-gold hover:bg-gold/10"
                  >
                    Enter
                  </button>
                )}
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                {SLOTS.map((slot) => {
                  const taken = g.occupied.includes(slot);
                  const mine = mySlots[g.id] === slot;
                  const disabled = taken || !!mySlots[g.id];
                  return (
                    <button
                      key={slot}
                      disabled={disabled || joiningKey === `${g.id}:${slot}`}
                      onClick={() => join(g.id, slot)}
                      className={`px-2 py-2 border text-center transition-colors
                        ${mine
                          ? "border-gold bg-gold/15 text-gold"
                          : taken
                          ? "border-bronze/30 bg-black/40 text-bronze/40 cursor-not-allowed"
                          : mySlots[g.id]
                          ? "border-bronze/30 bg-black/40 text-bronze/40 cursor-not-allowed"
                          : "border-bronze/60 text-ivory hover:border-gold hover:bg-gold/10"}`}
                    >
                      <div className="font-heading uppercase tracking-[0.15em] text-[11px]">
                        {PROVINCE_NAMES[slot]}
                      </div>
                      <div className="font-body text-[10px] opacity-70">
                        {mine ? "You" : taken ? "Taken" : "Open"}
                      </div>
                    </button>
                  );
                })}
              </div>
            </li>
          ))}
        </ul>
      )}
    </PanelFrame>
  );
}

/* ───────────────────────── New Single Player ───────────────────────── */

function SinglePlayerPanel({ onBack }: { onBack: () => void }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [slot, setSlot] = useState<number>(1);
  const [defaultMap, setDefaultMap] = useState<{ id: string; name: string; file_path: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState("");

  useEffect(() => {
    (async () => {
      const { data: settings } = await (supabase as any)
        .from("app_settings").select("default_map_id").eq("id", "global").maybeSingle();
      const mapId = settings?.default_map_id;
      if (!mapId) return;
      const { data: map } = await (supabase as any)
        .from("saved_maps").select("id, name, file_path").eq("id", mapId).maybeSingle();
      setDefaultMap(map || null);
    })();
  }, []);

  const create = async () => {
    if (!user || !name.trim() || !defaultMap) return;
    setBusy(true);
    try {
      setStage("Creating game…");
      const { data: g, error } = await (supabase as any)
        .from("games").insert({ name: name.trim(), created_by: user.id })
        .select("id, name").single();
      if (error) throw error;

      setStage("Loading default map…");
      const { data: file, error: dlErr } = await (supabase as any)
        .storage.from("map-files").download(defaultMap.file_path);
      if (dlErr) throw dlErr;
      const f = new File([file], "map.sqlite");
      const state = await importFromSqlite(f);

      setStage("Materializing fleets…");
      const { updatedMap } = await materializeGameFleets(g.id, state);
      const serialized = {
        mapData: updatedMap.mapData,
        hexes: Array.from(updatedMap.hexes.entries()),
        systems: Array.from(updatedMap.systems.entries()),
        regions: updatedMap.regions,
        facilityTypes: updatedMap.facilityTypes,
        fleets: updatedMap.fleets || [],
      };
      await (supabase as any).from("games").update({ map_data_json: serialized }).eq("id", g.id);
      await (supabase as any).from("game_logs").insert({
        game_id: g.id, turn_number: 0, log_type: "game_created",
        message: `Test game "${g.name}" created from default map "${defaultMap.name}"`, details_json: {},
      });

      setStage("Seating you in the senate…");
      const { error: joinErr } = await (supabase as any)
        .from("game_players").insert({ game_id: g.id, user_id: user.id, player_slot: slot });
      if (joinErr) throw joinErr;

      toast({ title: "Game created", description: `${g.name} — ${PROVINCE_NAMES[slot]}` });
      navigate(`/play/${g.id}`);
    } catch (e: any) {
      toast({ title: "Create failed", description: e.message || String(e), variant: "destructive" });
    } finally {
      setBusy(false);
      setStage("");
    }
  };

  return (
    <PanelFrame title="New Single Player Game" onBack={onBack}>
      <div className="mb-5 border border-amber-500/60 bg-amber-500/10 px-4 py-3">
        <div className="font-heading uppercase tracking-[0.25em] text-xs text-amber-300 mb-1">
          ⚠ Test Mode
        </div>
        <p className="font-body text-sm text-ivory/85">
          Single player games are experimental. State, balance, and rules may change at any time. The default map will be used.
        </p>
      </div>

      <div className="space-y-5">
        <div>
          <label className="font-heading uppercase tracking-[0.25em] text-xs text-bronze block mb-2">
            Game Name
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={busy}
            placeholder="e.g. The Crimson March"
            className="w-full bg-black/60 border border-bronze/60 text-ivory font-body px-3 py-2
              focus:outline-none focus:border-gold"
          />
        </div>

        <div>
          <label className="font-heading uppercase tracking-[0.25em] text-xs text-bronze block mb-2">
            Choose Faction
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {SLOTS.map((s) => (
              <button
                key={s}
                disabled={busy}
                onClick={() => setSlot(s)}
                className={`px-3 py-2 border text-center transition-colors
                  ${slot === s
                    ? "border-gold bg-gold/15 text-gold"
                    : "border-bronze/60 text-ivory hover:border-gold hover:bg-gold/10"}`}
              >
                <div className="font-heading uppercase tracking-[0.2em] text-sm">
                  {PROVINCE_NAMES[s]}
                </div>
                <div className="font-body text-[10px] opacity-70">Province {s}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="font-body text-xs text-bronze/80">
          Default map:{" "}
          <span className="text-ivory">
            {defaultMap ? defaultMap.name : "— none configured —"}
          </span>
        </div>

        <button
          onClick={create}
          disabled={busy || !name.trim() || !defaultMap}
          className="w-full font-heading uppercase tracking-[0.3em] text-sm py-3 border border-gold/70
            bg-gradient-to-b from-gold/20 to-gold/5 text-gold hover:bg-gold/15
            disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {busy ? stage || "Working…" : "Begin Campaign"}
        </button>
      </div>
    </PanelFrame>
  );
}

/* ───────────────────────── Coming Soon ───────────────────────── */

function ComingSoonPanel({ onBack }: { onBack: () => void }) {
  return (
    <PanelFrame title="New Multiplayer Game" onBack={onBack}>
      <div className="py-10 text-center">
        <div className="font-heading uppercase tracking-[0.4em] text-3xl text-gold mb-4">
          Coming Soon
        </div>
        <p className="font-body text-ivory/80 max-w-md mx-auto">
          Multiplayer games are still under construction. In the meantime, you can{" "}
          <button onClick={onBack} className="text-gold underline-offset-2 hover:underline">
            join an existing game
          </button>{" "}
          or start a single-player test.
        </p>
      </div>
    </PanelFrame>
  );
}
