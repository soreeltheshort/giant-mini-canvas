import { useEffect, useState, useCallback } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import Header from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { importFromSqlite } from "@/lib/mapDatabase";
import { materializeGameFleets } from "@/lib/materializeGameFleets";
import { startGame, processTurn, PROVINCE_NAMES } from "@/lib/gameLifecycle";
import TurnLogViewer from "@/components/game-shell/TurnLogViewer";
import FactionsConfigPicker from "@/components/FactionsConfigPicker";
import MapPicker, { SavedMapRow } from "@/components/MapPicker";
import { applyAndSetDefaultFactionsConfig } from "@/lib/factionsConfig";

interface GameRow {
  id: string;
  name: string;
  status: string;
  turn_number: number;
  created_at: string;
  map_data_json: any;
}
interface PlayerRow {
  id: string;
  game_id: string;
  user_id: string;
  player_slot: number;
}


const SLOTS = [1, 2, 3, 4, 5, 6];

const statusColors: Record<string, string> = {
  setup: "bg-yellow-600",
  active: "bg-green-600",
  paused: "bg-orange-600",
  completed: "bg-muted",
};

const TesterDashboard = () => {
  const { user, isAdmin, isTester } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [chosenMap, setChosenMap] = useState<SavedMapRow | null>(null);
  const [factionsConfigId, setFactionsConfigId] = useState<string | null>(null);
  const [games, setGames] = useState<GameRow[]>([]);
  const [selected, setSelected] = useState<GameRow | null>(null);
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [newGameName, setNewGameName] = useState("");
  const [busy, setBusy] = useState(false);
  const [logRefreshKey, setLogRefreshKey] = useState(0);

  const canUse = isAdmin || isTester;

  const fetchGames = useCallback(async () => {
    if (!user) return;
    const { data } = await (supabase as any)
      .from("games").select("id, name, status, turn_number, created_at, map_data_json")
      .eq("created_by", user.id).order("created_at", { ascending: false });
    setGames(data || []);
  }, [user]);

  const loadPlayers = useCallback(async (gameId: string) => {
    const { data } = await (supabase as any)
      .from("game_factions").select("id, game_id, user_id, player_slot")
      .eq("game_id", gameId).order("player_slot");
    setPlayers(data || []);
  }, []);

  useEffect(() => {
    if (!canUse || !user) return;
    fetchGames();
  }, [canUse, user, fetchGames]);

  useEffect(() => { if (selected) loadPlayers(selected.id); }, [selected, loadPlayers]);

  if (!canUse) { navigate("/"); return null; }

  const selectGame = async (g: GameRow) => {
    setSelected(g);
  };

  const createGame = async () => {
    if (!newGameName.trim() || !user) return;
    if (!chosenMap) { toast({ title: "Pick a map first", variant: "destructive" }); return; }
    setBusy(true);
    try {
      if (factionsConfigId) {
        await applyAndSetDefaultFactionsConfig(factionsConfigId).catch((e) => {
          console.warn("Factions config apply failed", e);
        });
      }

      const { data: g, error } = await (supabase as any)
        .from("games")
        .insert({ name: newGameName.trim(), created_by: user.id })
        .select("id, name, status, turn_number, created_at, map_data_json")
        .single();
      if (error) throw error;

      const { data: file, error: dlErr } = await (supabase as any).storage.from("map-files").download(chosenMap.file_path);
      if (dlErr) throw dlErr;
      const f = new File([file], "map.sqlite");
      const state = await importFromSqlite(f);
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
        message: `Test game "${g.name}" created from map "${chosenMap.name}"`, details_json: {},
      });

      setNewGameName("");
      await fetchGames();
      toast({ title: "Game created", description: g.name });
      const refreshed: GameRow = { ...g, map_data_json: serialized };
      setSelected(refreshed);
    } catch (e: any) {
      toast({ title: "Create failed", description: e.message || String(e), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const deleteGame = async (id: string) => {
    if (!confirm("Delete this game and all its data?")) return;
    await (supabase as any).from("games").delete().eq("id", id);
    if (selected?.id === id) { setSelected(null); setPlayers([]); }
    await fetchGames();
  };

  const addSelfToSlot = async (slot: number) => {
    if (!selected || !user) return;
    const { error } = await (supabase as any).from("game_factions").insert({
      game_id: selected.id, user_id: user.id, player_slot: slot,
    });
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    await loadPlayers(selected.id);
  };

  const removePlayerRow = async (rowId: string) => {
    await (supabase as any).from("game_factions").delete().eq("id", rowId);
    if (selected) await loadPlayers(selected.id);
  };

  const handleStart = async () => {
    if (!selected) return;
    if (players.length === 0) { toast({ title: "Add at least one player slot first", variant: "destructive" }); return; }
    setBusy(true);
    try {
      await startGame(supabase as any, selected.id);
      toast({ title: "Game started" });
      await fetchGames();
      const { data: updated } = await (supabase as any).from("games").select("id, name, status, turn_number, created_at, map_data_json").eq("id", selected.id).single();
      if (updated) setSelected(updated);
      setLogRefreshKey(k => k + 1);
    } catch (e: any) {
      toast({ title: "Start failed", description: e.message || String(e), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const handleProcessTurn = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      const { currentTurn, nextTurn } = await processTurn(supabase as any, selected.id);
      toast({ title: `Turn ${currentTurn} processed`, description: `Now accepting orders for Turn ${nextTurn}` });
      await fetchGames();
      const { data: updated } = await (supabase as any).from("games").select("id, name, status, turn_number, created_at, map_data_json").eq("id", selected.id).single();
      if (updated) setSelected(updated);
      setLogRefreshKey(k => k + 1);
    } catch (e: any) {
      toast({ title: "Process turn failed", description: e.message || String(e), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const mySlots = players.filter(p => p.user_id === user!.id);
  const occupiedBySelf = new Set(mySlots.map(p => p.player_slot));

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Header />
      <div className="container py-6 space-y-6">
        <div className="flex items-baseline justify-between">
          <h1 className="text-2xl font-heading font-bold">Tester Dashboard</h1>
        </div>

        <div className="border border-border rounded-md p-4 space-y-4 bg-card">
          <h2 className="text-sm font-heading font-semibold uppercase tracking-wider text-muted-foreground">New Test Game</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <MapPicker value={chosenMap?.id ?? null} onChange={setChosenMap} disabled={busy} />
            <FactionsConfigPicker value={factionsConfigId} onChange={setFactionsConfigId} disabled={busy} />
          </div>
          <div className="flex gap-2 items-end">
            <Input
              placeholder="New test game name..."
              value={newGameName}
              onChange={e => setNewGameName(e.target.value)}
              className="max-w-xs"
              disabled={busy}
            />
            <Button onClick={createGame} disabled={busy || !newGameName.trim() || !chosenMap}>
              Create Test Game
            </Button>
            {!chosenMap && <span className="text-xs text-crimson">Choose a map to continue.</span>}
          </div>
        </div>

        <div className="border border-border rounded-md">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Turn</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {games.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">No test games yet.</TableCell></TableRow>
              ) : games.map(g => (
                <TableRow key={g.id} className={selected?.id === g.id ? "bg-accent/30" : ""}>
                  <TableCell className="font-medium">{g.name}</TableCell>
                  <TableCell><Badge className={statusColors[g.status] || "bg-muted"}>{g.status}</Badge></TableCell>
                  <TableCell>{g.turn_number}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{new Date(g.created_at).toLocaleDateString()}</TableCell>
                  <TableCell className="text-right space-x-2">
                    <Button size="sm" variant="outline" onClick={() => selectGame(g)}>Manage</Button>
                    <Button size="sm" variant="destructive" onClick={() => deleteGame(g.id)}>Delete</Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {selected && (
          <div className="border border-border rounded-md p-4 space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-heading font-semibold">{selected.name}</h2>
                <p className="text-sm text-muted-foreground">Turn {selected.turn_number} · Status: {selected.status}</p>
              </div>
              <div className="flex gap-2">
                {selected.status === "setup" && (
                  <Button onClick={handleStart} disabled={busy || players.length === 0}>Start Game</Button>
                )}
                {selected.status === "active" && (
                  <Button onClick={handleProcessTurn} disabled={busy}>
                    {busy ? "Processing..." : `Process Turn ${selected.turn_number}`}
                  </Button>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <h3 className="text-lg font-semibold">Province Slots</h3>
              <p className="text-xs text-muted-foreground">Add yourself to as many slots as you want — you can play all of them simultaneously for testing.</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {SLOTS.map(slot => {
                  const row = players.find(p => p.player_slot === slot);
                  const isMine = row && row.user_id === user!.id;
                  return (
                    <div key={slot} className="border border-border rounded-sm p-3 flex items-center justify-between bg-card">
                      <div>
                        <p className="font-semibold text-sm">{PROVINCE_NAMES[slot]}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {row ? (isMine ? "You" : "Other player") : "Empty"}
                        </p>
                      </div>
                      <div className="flex gap-1">
                        {!row && (
                          <Button size="sm" variant="outline" onClick={() => addSelfToSlot(slot)}>Add Self</Button>
                        )}
                        {isMine && (
                          <>
                            {selected.status === "active" && (
                              <Button size="sm" onClick={() => navigate(`/play/${selected.id}`)}>Open</Button>
                            )}
                            <Button size="sm" variant="destructive" onClick={() => removePlayerRow(row!.id)}>Remove</Button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              {selected.status === "active" && occupiedBySelf.size > 1 && (
                <p className="text-[10px] text-muted-foreground italic">
                  Note: the player UI currently picks the first slot you occupy. Slot switching inside /play is a future enhancement.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <h3 className="text-lg font-semibold">Turn Log</h3>
              <TurnLogViewer gameId={selected.id} showDetails recentTurnsLimit={10} refreshKey={logRefreshKey} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TesterDashboard;
