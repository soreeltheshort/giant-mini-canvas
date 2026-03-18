import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import Header from "@/components/Header";
import { supabase } from "@/integrations/supabase/client";

import { useFacilityTypes } from "@/hooks/useFacilityTypes";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { importFromSqlite, exportToSqlite } from "@/lib/mapDatabase";
import { processNextTurn, DEFAULT_TURN_CONSTANTS, ShipTypeForUpkeep } from "@/lib/turnEngine";
import { SystemData, MapState } from "@/lib/mapTypes";
import { Badge } from "@/components/ui/badge";

const PROVINCE_NAMES: Record<number, string> = {
  1: "Valerian", 2: "Aurelian", 3: "Cassian",
  4: "Dravian", 5: "Marcellan", 6: "Octavan",
};

/* ───────── types ───────── */
interface GameRow {
  id: string;
  name: string;
  status: string;
  turn_number: number;
  created_at: string;
}

interface GamePlayerRow {
  id: string;
  game_id: string;
  user_id: string;
  faction_id: string | null;
  player_slot: number;
}

interface ProfileRow {
  user_id: string;
  display_name: string | null;
  email: string | null;
}

interface GameLogRow {
  id: string;
  turn_number: number;
  log_type: string;
  message: string;
  created_at: string;
}

/* ───────── component ───────── */
const AdminGames = () => {
  const { user, isAdmin } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const { facilityTypes } = useFacilityTypes();

  // games list
  const [games, setGames] = useState<GameRow[]>([]);
  const [loadingGames, setLoadingGames] = useState(true);

  // selected game
  const [selectedGame, setSelectedGame] = useState<GameRow | null>(null);
  const [players, setPlayers] = useState<GamePlayerRow[]>([]);
  const [logs, setLogs] = useState<GameLogRow[]>([]);
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [mapState, setMapState] = useState<MapState | null>(null);
  const [shipTypes, setShipTypes] = useState<ShipTypeForUpkeep[]>([]);

  // new game form
  const [newGameName, setNewGameName] = useState("");
  const [processing, setProcessing] = useState(false);

  /* ── fetch helpers ── */
  const fetchGames = useCallback(async () => {
    const { data } = await (supabase as any).from("games").select("id, name, status, turn_number, created_at").order("created_at", { ascending: false });
    setGames(data || []);
    setLoadingGames(false);
  }, []);

  const fetchProfiles = useCallback(async () => {
    const { data } = await (supabase as any).from("profiles").select("user_id, display_name, email");
    setProfiles(data || []);
  }, []);

  const fetchShipTypes = useCallback(async () => {
    const { data } = await (supabase as any).from("ship_types").select("id, name, class, maintenance");
    setShipTypes((data || []).map((s: any) => ({ id: s.id, name: s.name, class: s.class, maintenance: Number(s.maintenance) })));
  }, []);

  useEffect(() => { fetchGames(); fetchProfiles(); fetchShipTypes(); }, [fetchGames, fetchProfiles, fetchShipTypes]);

  /* ── load a game ── */
  const loadGame = useCallback(async (game: GameRow) => {
    setSelectedGame(game);
    // players
    const { data: pData } = await (supabase as any).from("game_players").select("*").eq("game_id", game.id).order("player_slot");
    setPlayers(pData || []);
    // logs
    const { data: lData } = await (supabase as any).from("game_logs").select("id, turn_number, log_type, message, created_at").eq("game_id", game.id).order("created_at", { ascending: false }).limit(100);
    setLogs(lData || []);
    // map state from json
    const { data: gData } = await (supabase as any).from("games").select("map_data_json").eq("id", game.id).single();
    if (gData?.map_data_json && Object.keys(gData.map_data_json).length > 0) {
      try {
        setMapState(deserializeMapState(gData.map_data_json));
      } catch { setMapState(null); }
    } else {
      setMapState(null);
    }
  }, []);

  /* ── create game ── */
  const createGame = async () => {
    if (!newGameName.trim()) return;
    const { error } = await (supabase as any).from("games").insert({ name: newGameName.trim(), created_by: user!.id });
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    setNewGameName("");
    await addLog(undefined, "game_created", `Game "${newGameName.trim()}" created`);
    await fetchGames();
    toast({ title: "Game created" });
  };

  /* ── delete game ── */
  const deleteGame = async (id: string) => {
    if (!confirm("Delete this game and all its data?")) return;
    await (supabase as any).from("games").delete().eq("id", id);
    if (selectedGame?.id === id) { setSelectedGame(null); setPlayers([]); setLogs([]); setMapState(null); }
    await fetchGames();
    toast({ title: "Game deleted" });
  };

  /* ── import map from .sqlite ── */
  const handleImportMap = async () => {
    if (!selectedGame) return;
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".sqlite,.db";
    input.onchange = async (e: any) => {
      const file = e.target.files?.[0] as File | undefined;
      if (!file) return;
      try {
        const state = await importFromSqlite(file);
        setMapState(state);
        const serialized = serializeMapState(state);
        await (supabase as any).from("games").update({ map_data_json: serialized }).eq("id", selectedGame.id);
        await addLog(selectedGame.id, "map_imported", `Map imported from file: ${file.name}`);
        toast({ title: "Map imported and saved" });
        await refreshLogs(selectedGame.id);
      } catch (err: any) {
        toast({ title: "Import failed", description: err.message, variant: "destructive" });
      }
    };
    input.click();
  };

  /* ── player management ── */
  const addPlayer = async (userId: string, slot: number) => {
    if (!selectedGame) return;
    const { error } = await (supabase as any).from("game_players").insert({ game_id: selectedGame.id, user_id: userId, player_slot: slot });
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    const profile = profiles.find(p => p.user_id === userId);
    await addLog(selectedGame.id, "player_added", `Player ${profile?.display_name || profile?.email || userId} assigned to slot ${slot}`);
    await loadGame(selectedGame);
  };

  const removePlayer = async (playerId: string) => {
    if (!selectedGame) return;
    await (supabase as any).from("game_players").delete().eq("id", playerId);
    await addLog(selectedGame.id, "player_removed", `Player removed from game`);
    await loadGame(selectedGame);
  };


  /* ── update game status ── */
  const updateStatus = async (status: string) => {
    if (!selectedGame) return;
    await (supabase as any).from("games").update({ status }).eq("id", selectedGame.id);
    await addLog(selectedGame.id, "status_changed", `Game status changed to ${status}`);
    setSelectedGame({ ...selectedGame, status });
    await fetchGames();
  };

  /* ── run turn ── */
  const runTurn = async () => {
    if (!selectedGame || !mapState) return;
    setProcessing(true);
    try {
      const nextTurn = selectedGame.turn_number + 1;
      const systems = Array.from(mapState.systems.values());
      const eligible = systems.filter(s => s.current_population > 0 && s.owner && s.owner !== "" && s.owner.toLowerCase() !== "unowned");

      let turnLogs: string[] = [];
      const updatedSystems = new Map(mapState.systems);

      for (const sys of eligible) {
        const result = processNextTurn(sys, facilityTypes, DEFAULT_TURN_CONSTANTS, 0, shipTypes);
        updatedSystems.set(sys.system_id, result.planet);
        turnLogs.push(`[${sys.system_name}] Tribute: ${result.tributeBreakdown.totalTribute}, Upkeep: ${result.upkeepBreakdown.totalUpkeep}`);
        if (result.completedFacilities.length > 0) {
          turnLogs.push(`  → Completed: ${result.completedFacilities.join(", ")}`);
        }
      }

      const newMapState: MapState = { ...mapState, systems: updatedSystems };
      setMapState(newMapState);

      // Save updated map and turn number
      const serialized = serializeMapState(newMapState);
      await (supabase as any).from("games").update({ map_data_json: serialized, turn_number: nextTurn }).eq("id", selectedGame.id);

      // Log the turn
      await addLog(selectedGame.id, "turn_processed", `Turn ${nextTurn} processed. ${eligible.length} systems updated.`, { details: turnLogs });

      setSelectedGame({ ...selectedGame, turn_number: nextTurn });
      await fetchGames();
      await refreshLogs(selectedGame.id);
      toast({ title: `Turn ${nextTurn} processed`, description: `${eligible.length} systems updated` });
    } catch (err: any) {
      toast({ title: "Turn failed", description: err.message, variant: "destructive" });
    } finally {
      setProcessing(false);
    }
  };

  /* ── helpers ── */
  const addLog = async (gameId: string | undefined, logType: string, message: string, detailsJson: any = {}) => {
    if (!gameId) {
      // find the latest game
      const { data } = await (supabase as any).from("games").select("id").order("created_at", { ascending: false }).limit(1).single();
      gameId = data?.id;
    }
    if (!gameId) return;
    const turn = selectedGame?.turn_number ?? 0;
    await (supabase as any).from("game_logs").insert({ game_id: gameId, turn_number: turn, log_type: logType, message, details_json: detailsJson });
  };

  const refreshLogs = async (gameId: string) => {
    const { data } = await (supabase as any).from("game_logs").select("id, turn_number, log_type, message, created_at").eq("game_id", gameId).order("created_at", { ascending: false }).limit(100);
    setLogs(data || []);
  };

  const getProfileLabel = (userId: string) => {
    const p = profiles.find(pr => pr.user_id === userId);
    return p?.display_name || p?.email || userId.slice(0, 8);
  };

  const usedSlots = players.map(p => p.player_slot);
  const usedUserIds = players.map(p => p.user_id);
  const availableSlots = [1, 2, 3, 4, 5, 6].filter(s => !usedSlots.includes(s));
  const availableUsers = profiles.filter(p => !usedUserIds.includes(p.user_id));

  const systemCount = mapState ? mapState.systems.size : 0;

  const statusColors: Record<string, string> = {
    setup: "bg-yellow-600",
    active: "bg-green-600",
    paused: "bg-orange-600",
    completed: "bg-muted",
  };

  if (!isAdmin) { navigate("/"); return null; }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Header />
      <div className="container py-6 space-y-6">
        <h1 className="text-2xl font-heading font-bold">Game Management</h1>

        {/* ── Create Game ── */}
        <div className="flex gap-2 items-end">
          <Input placeholder="New game name..." value={newGameName} onChange={e => setNewGameName(e.target.value)} className="max-w-xs" />
          <Button onClick={createGame} disabled={!newGameName.trim()}>Create Game</Button>
        </div>

        {/* ── Games List ── */}
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
              {loadingGames ? (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">Loading...</TableCell></TableRow>
              ) : games.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">No games yet</TableCell></TableRow>
              ) : games.map(g => (
                <TableRow key={g.id} className={selectedGame?.id === g.id ? "bg-accent/30" : ""}>
                  <TableCell className="font-medium">{g.name}</TableCell>
                  <TableCell><Badge className={statusColors[g.status]}>{g.status}</Badge></TableCell>
                  <TableCell>{g.turn_number}</TableCell>
                  <TableCell className="text-muted-foreground text-xs">{new Date(g.created_at).toLocaleDateString()}</TableCell>
                  <TableCell className="text-right space-x-2">
                    <Button size="sm" variant="outline" onClick={() => loadGame(g)}>Load</Button>
                    <Button size="sm" variant="destructive" onClick={() => deleteGame(g.id)}>Delete</Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* ── Selected Game Detail ── */}
        {selectedGame && (
          <div className="space-y-6 border border-border rounded-md p-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-heading font-semibold">{selectedGame.name}</h2>
                <p className="text-sm text-muted-foreground">Turn {selectedGame.turn_number} · Status: {selectedGame.status}</p>
              </div>
              <div className="flex gap-2">
                <Select value={selectedGame.status} onValueChange={updateStatus}>
                  <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="setup">Setup</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="paused">Paused</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* ── Map Section ── */}
            <div className="space-y-2">
              <h3 className="text-lg font-semibold">Map</h3>
              <div className="flex items-center gap-3">
                <Button variant="outline" onClick={handleImportMap}>Import Map (.sqlite)</Button>
                {mapState && <span className="text-sm text-muted-foreground">{systemCount} systems loaded</span>}
              </div>
            </div>

            {/* ── Players Section ── */}
            <div className="space-y-2">
              <h3 className="text-lg font-semibold">Players ({players.length}/6) — Provinces</h3>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Province / Faction</TableHead>
                    <TableHead>Player</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {players.map(p => (
                    <TableRow key={p.id}>
                      <TableCell>{PROVINCE_NAMES[p.player_slot] || `Slot ${p.player_slot}`}</TableCell>
                      <TableCell>{getProfileLabel(p.user_id)}</TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="destructive" onClick={() => removePlayer(p.id)}>Remove</Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {availableSlots.length > 0 && availableUsers.length > 0 && (
                <AddPlayerForm availableSlots={availableSlots} availableUsers={availableUsers} onAdd={addPlayer} />
              )}
            </div>

            {/* ── Turn Section ── */}
            <div className="space-y-2">
              <h3 className="text-lg font-semibold">Turn Processing</h3>
              <div className="flex items-center gap-3">
                <Button onClick={runTurn} disabled={processing || !mapState || selectedGame.status !== "active"}>
                  {processing ? "Processing..." : `Run Turn ${selectedGame.turn_number + 1}`}
                </Button>
                {!mapState && <span className="text-sm text-destructive">Import a map first</span>}
                {selectedGame.status !== "active" && mapState && <span className="text-sm text-muted-foreground">Set status to Active to run turns</span>}
              </div>
            </div>

            {/* ── Logs Section ── */}
            <div className="space-y-2">
              <h3 className="text-lg font-semibold">Game Log ({logs.length})</h3>
              <div className="max-h-64 overflow-y-auto border border-border rounded-md">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-16">Turn</TableHead>
                      <TableHead className="w-24">Type</TableHead>
                      <TableHead>Message</TableHead>
                      <TableHead className="w-32">Time</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {logs.length === 0 ? (
                      <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">No logs</TableCell></TableRow>
                    ) : logs.map(l => (
                      <TableRow key={l.id}>
                        <TableCell className="text-xs">{l.turn_number}</TableCell>
                        <TableCell><Badge variant="outline" className="text-xs">{l.log_type}</Badge></TableCell>
                        <TableCell className="text-sm">{l.message}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{new Date(l.created_at).toLocaleString()}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

/* ── Add Player inline form ── */
function AddPlayerForm({ availableSlots, availableUsers, onAdd }: { availableSlots: number[]; availableUsers: ProfileRow[]; onAdd: (userId: string, slot: number) => void }) {
  const [userId, setUserId] = useState("");
  const [slot, setSlot] = useState("");
  return (
    <div className="flex gap-2 items-end">
      <Select value={userId} onValueChange={setUserId}>
        <SelectTrigger className="w-48"><SelectValue placeholder="Select user" /></SelectTrigger>
        <SelectContent>
          {availableUsers.map(u => (
            <SelectItem key={u.user_id} value={u.user_id}>{u.display_name || u.email || u.user_id.slice(0, 8)}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={slot} onValueChange={setSlot}>
        <SelectTrigger className="w-40"><SelectValue placeholder="Province" /></SelectTrigger>
        <SelectContent>
          {availableSlots.map(s => <SelectItem key={s} value={String(s)}>{PROVINCE_NAMES[s] || `Slot ${s}`}</SelectItem>)}
        </SelectContent>
      </Select>
      <Button size="sm" onClick={() => { if (userId && slot) { onAdd(userId, Number(slot)); setUserId(""); setSlot(""); } }} disabled={!userId || !slot}>Add</Button>
    </div>
  );
}

/* ── Map state serialization (Map→JSON and back) ── */
function serializeMapState(state: MapState): any {
  return {
    mapData: state.mapData,
    hexes: Array.from(state.hexes.entries()),
    systems: Array.from(state.systems.entries()),
    regions: state.regions,
    facilityTypes: state.facilityTypes,
  };
}

function deserializeMapState(json: any): MapState {
  return {
    mapData: json.mapData,
    hexes: new Map(json.hexes),
    systems: new Map(json.systems),
    regions: json.regions || [],
    facilityTypes: json.facilityTypes || [],
  };
}

export default AdminGames;
