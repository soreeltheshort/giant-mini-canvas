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
import { materializeGameFleets } from "@/lib/materializeGameFleets";
import { processNextTurn, DEFAULT_TURN_CONSTANTS, ShipTypeForUpkeep } from "@/lib/turnEngine";
import { runTurnProcessor } from "@/lib/turnProcessor";
import { runTurnZero } from "@/lib/turnZero";
import { SystemData, MapState } from "@/lib/mapTypes";
import { buildSystemSnapshot } from "@/lib/systemIntel";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import TurnLogViewer from "@/components/game-shell/TurnLogViewer";

const PROVINCE_NAMES: Record<number, string> = {
  1: "Valerian", 2: "Aurelian", 3: "Cassian",
  4: "Dravian", 5: "Marcellan", 6: "Octavian",
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
  orders_locked?: boolean;
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

interface GameSnapshotRow {
  id: string;
  game_id: string;
  turn_number: number;
  label: string;
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
  const [snapshots, setSnapshots] = useState<GameSnapshotRow[]>([]);
  const [logRefreshKey, setLogRefreshKey] = useState(0);

  // new game form
  const [newGameName, setNewGameName] = useState("");
  const [processing, setProcessing] = useState(false);
  const [snapshotLabel, setSnapshotLabel] = useState("");

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

  // Realtime: when a player submits/unsubmits orders, refresh that row in our list.
  useEffect(() => {
    if (!selectedGame) return;
    const channel = (supabase as any)
      .channel(`admin-game-players-${selectedGame.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "game_players", filter: `game_id=eq.${selectedGame.id}` },
        (payload: any) => {
          const updated = payload.new as GamePlayerRow;
          setPlayers(prev => prev.map(p => (p.id === updated.id ? { ...p, ...updated } : p)));
        }
      )
      .subscribe();
    return () => { (supabase as any).removeChannel(channel); };
  }, [selectedGame]);

  /* ── load a game ── */
  const loadGame = useCallback(async (game: GameRow) => {
    setSelectedGame(game);
    // players
    const { data: pData } = await (supabase as any).from("game_players").select("*").eq("game_id", game.id).order("player_slot");
    setPlayers(pData || []);
    // logs
    const { data: lData } = await (supabase as any).from("game_logs").select("id, turn_number, log_type, message, created_at").eq("game_id", game.id).order("created_at", { ascending: false }).limit(100);
    setLogs(lData || []);
    // snapshots
    const { data: sData } = await (supabase as any).from("game_snapshots").select("id, game_id, turn_number, label, created_at").eq("game_id", game.id).order("turn_number", { ascending: false });
    setSnapshots(sData || []);
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
        // Materialize fleets into game_fleets rows so the per-game ship
        // roster (game_fleet_ships) is populated by the snapshot trigger.
        // The map JSON's fleet_id is rewritten to the new game_fleets.id
        // so downstream lookups work.
        const { updatedMap, created, reused } = await materializeGameFleets(
          selectedGame.id,
          state,
        );
        setMapState(updatedMap);
        const serialized = serializeMapState(updatedMap);
        await (supabase as any).from("games").update({ map_data_json: serialized }).eq("id", selectedGame.id);
        await addLog(
          selectedGame.id,
          "map_imported",
          `Map imported from file: ${file.name} (fleets materialized: ${created} new, ${reused} reused)`,
        );
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


  /* ── login as player ── */
  const loginAsPlayer = (player: GamePlayerRow) => {
    if (!selectedGame) return;
    navigate(`/my-games`);
  };

  /* ── snapshot management ── */
  const saveSnapshot = async () => {
    if (!selectedGame || !mapState) return;
    const label = snapshotLabel.trim() || `Turn ${selectedGame.turn_number} snapshot`;
    const serialized = serializeMapState(mapState);
    const { error } = await (supabase as any).from("game_snapshots").insert({
      game_id: selectedGame.id,
      turn_number: selectedGame.turn_number,
      label,
      map_data_json: serialized,
    });
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    await addLog(selectedGame.id, "snapshot_saved", `Snapshot saved: "${label}" at turn ${selectedGame.turn_number}`);
    setSnapshotLabel("");
    await loadGame(selectedGame);
    toast({ title: "Snapshot saved", description: label });
  };

  const loadSnapshot = async (snapshot: GameSnapshotRow) => {
    if (!selectedGame) return;
    if (!confirm(`Restore game to "${snapshot.label}" (turn ${snapshot.turn_number})? This will overwrite the current game state.`)) return;
    // Fetch the full snapshot data
    const { data } = await (supabase as any).from("game_snapshots").select("map_data_json").eq("id", snapshot.id).single();
    if (!data) return;
    // Update the game with the snapshot's map and turn number
    await (supabase as any).from("games").update({ map_data_json: data.map_data_json, turn_number: snapshot.turn_number }).eq("id", selectedGame.id);
    await addLog(selectedGame.id, "snapshot_restored", `Restored to snapshot: "${snapshot.label}" (turn ${snapshot.turn_number})`);
    // Reload
    const updatedGame = { ...selectedGame, turn_number: snapshot.turn_number };
    setSelectedGame(updatedGame);
    try { setMapState(deserializeMapState(data.map_data_json)); } catch { setMapState(null); }
    await fetchGames();
    await refreshLogs(selectedGame.id);
    const { data: sData } = await (supabase as any).from("game_snapshots").select("id, game_id, turn_number, label, created_at").eq("game_id", selectedGame.id).order("turn_number", { ascending: false });
    setSnapshots(sData || []);
    toast({ title: "Snapshot restored", description: `Now at turn ${snapshot.turn_number}` });
  };

  const deleteSnapshot = async (snapshotId: string) => {
    if (!selectedGame) return;
    await (supabase as any).from("game_snapshots").delete().eq("id", snapshotId);
    const { data: sData } = await (supabase as any).from("game_snapshots").select("id, game_id, turn_number, label, created_at").eq("game_id", selectedGame.id).order("turn_number", { ascending: false });
    setSnapshots(sData || []);
    toast({ title: "Snapshot deleted" });
  };

  const updateStatus = async (status: string) => {
    if (!selectedGame) return;

    // When transitioning to active, set turn 1 + orders phase + process visibility + Turn 1 economics
    if (status === "active" && selectedGame.status === "setup") {
      // Run Turn 0 — seeds visibility (and any future start-of-game steps).
      // Loads its own MapState from the DB so it never silently no-ops.
      try {
        const tz = await runTurnZero(supabase as any, selectedGame.id);
        toast({ title: "Turn 0 complete", description: `${tz.systemsSeeded} systems seeded for ${tz.playersUpdated} player(s).` });
      } catch (e: any) {
        toast({ title: "Turn 0 failed", description: e?.message ?? String(e), variant: "destructive" });
        return;
      }
      await (supabase as any).from("games").update({ status, turn_number: 1, turn_phase: "orders" }).eq("id", selectedGame.id);

      // Roll any setup-phase orders (turn_number = 0) forward to turn 1 so they
      // are picked up by the first turn processor pass. Without this, orders
      // queued before the game went active are silently orphaned.
      await (supabase as any)
        .from("player_orders")
        .update({ turn_number: 1 })
        .eq("game_id", selectedGame.id)
        .eq("turn_number", 0);

      // Calculate Turn 1 income/expenses so players see initial economic state
      // STUB: Starting treasury defaults to 300 until final determination
      const STARTING_TREASURY = 300;

      const nameToSlot = new Map<string, number>();
      for (const [slot, name] of Object.entries(PROVINCE_NAMES)) {
        nameToSlot.set(name.toLowerCase(), parseInt(slot, 10));
      }

      const playerEcon = new Map<number, { tribute: number; maintenance: number }>();
      if (mapState) {
        const systems = Array.from(mapState.systems.values());
        const eligible = systems.filter(s => s.current_population > 0 && s.owner && s.owner !== "" && s.owner.toLowerCase() !== "unowned");
        console.log(`[Game Start] mapState loaded, ${systems.length} systems, ${eligible.length} eligible, ${facilityTypes.length} facilityTypes, ${shipTypes.length} shipTypes`);
        for (const sys of eligible) {
          const result = processNextTurn(sys, facilityTypes, DEFAULT_TURN_CONSTANTS, 0, shipTypes);
          let slot: number | undefined;
          const ownerMatch = sys.owner?.match(/PROVINCE_(\d+)/);
          if (ownerMatch) {
            slot = parseInt(ownerMatch[1], 10);
          } else if (sys.owner) {
            slot = nameToSlot.get(sys.owner.toLowerCase());
          }
          if (slot !== undefined) {
            const existing = playerEcon.get(slot) || { tribute: 0, maintenance: 0 };
            existing.tribute += result.tributeBreakdown.totalTribute;
            existing.maintenance += result.upkeepBreakdown.totalUpkeep;
            playerEcon.set(slot, existing);
            console.log(`[Game Start] System "${sys.system_name}" owner="${sys.owner}" slot=${slot} tribute=${result.tributeBreakdown.totalTribute} upkeep=${result.upkeepBreakdown.totalUpkeep}`);
          }
        }
      } else {
        console.warn("[Game Start] mapState is null — no economics calculated");
      }

      // Also calculate fleet maintenance from game_fleets — read ship counts
      // from per-game roster so post-combat losses (in later turn re-runs) are
      // honored. At Game Start the per-game roster is identical to the source
      // fleet (just snapshotted by the trg_game_fleets_snapshot_ships trigger).
      const { data: gameFleets } = await (supabase as any)
        .from("game_fleets")
        .select("id, fleet_id, owner_classification")
        .eq("game_id", selectedGame.id);
      if (gameFleets && gameFleets.length > 0) {
        const gameFleetIds = gameFleets.map((gf: any) => gf.id);
        const { data: fleetShips } = await (supabase as any)
          .from("game_fleet_ships")
          .select("game_fleet_id, ship_type_id, quantity")
          .in("game_fleet_id", gameFleetIds);
        const { data: allShipTypes } = await (supabase as any)
          .from("ship_types")
          .select("id, maintenance");

        if (fleetShips && allShipTypes) {
          const shipMaintMap = new Map<string, number>();
          for (const st of allShipTypes) shipMaintMap.set(st.id, Number(st.maintenance));

          for (const gf of gameFleets) {
            const ownerSlot = nameToSlot.get((gf.owner_classification || "").toLowerCase());
            if (ownerSlot === undefined) continue;
            const ships = fleetShips.filter((fs: any) => fs.game_fleet_id === gf.id);
            let fleetMaint = 0;
            for (const fs of ships) {
              fleetMaint += (shipMaintMap.get(fs.ship_type_id) || 0) * fs.quantity;
            }
            const existing = playerEcon.get(ownerSlot) || { tribute: 0, maintenance: 0 };
            existing.maintenance += fleetMaint;
            playerEcon.set(ownerSlot, existing);
            console.log(`[Game Start] Fleet ${gf.fleet_id} owner="${gf.owner_classification}" slot=${ownerSlot} fleetMaint=${fleetMaint}`);
          }
        }
      }

      // Set starting treasury + Turn 1 income/costs for each player
      const { data: gps } = await (supabase as any).from("game_players").select("id, player_slot, admin_capability, combat_capability").eq("game_id", selectedGame.id);
      if (gps) {
        for (const gp of gps) {
          const econ = playerEcon.get(gp.player_slot) || { tribute: 0, maintenance: 0 };
          console.log(`[Game Start] Player slot=${gp.player_slot} treasury=${STARTING_TREASURY} tribute=${econ.tribute} maintenance=${econ.maintenance}`);
          await (supabase as any).from("game_players").update({
            orders_locked: false,
            treasury: STARTING_TREASURY, // STUB: default starting treasury
            last_tribute: econ.tribute,
            last_maintenance: econ.maintenance,
            admin_points_remaining: gp.admin_capability || 3,
            combat_points_remaining: gp.combat_capability || 3,
          }).eq("id", gp.id);
        }
      }

      const econSummary = Array.from(playerEcon.entries()).map(([s, e]) => `Slot${s}: +${e.tribute}/-${e.maintenance}`).join(", ");
      await addLog(selectedGame.id, "status_changed", `Game started — Turn 1 orders phase. Starting treasury: ${STARTING_TREASURY} (stub default). Economics: ${econSummary || "none calculated"}`);
      setSelectedGame({ ...selectedGame, status, turn_number: 1 });
      await fetchGames();
      return;
    }

    await (supabase as any).from("games").update({ status }).eq("id", selectedGame.id);
    await addLog(selectedGame.id, "status_changed", `Game status changed to ${status}`);
    setSelectedGame({ ...selectedGame, status });
    await fetchGames();
  };

  /** Build the list of system IDs in CORE / PROVINCE hexes */
  const buildVisibleSystemIds = (ms: MapState): number[] => {
    // Build hex_id → classification lookup (used as a fallback)
    const hexClassById = new Map<number, string>();
    for (const h of ms.hexes.values()) {
      hexClassById.set(h.hex_id, h.classification);
    }
    const isBaseline = (cls: string) =>
      cls === "CORE" || cls === "MARCHES" || cls.startsWith("PROVINCE_");
    const ids: number[] = [];
    for (const [, sys] of ms.systems) {
      // Accept the system as baseline if either its own classification or the
      // underlying hex's classification matches. Maps generated before the
      // explored-marches rename can have system.classification = "MARCHES"
      // while the hex is still tagged "UNEXPLORED_MARCHES".
      const sysCls = (sys.classification || "").toUpperCase();
      const hexCls = (hexClassById.get(sys.hex_id) || "").toUpperCase();
      if (isBaseline(sysCls) || isBaseline(hexCls)) {
        ids.push(sys.system_id);
      }
    }
    return ids;
  };

  /** Push visible_system_ids to every player in a game */
  const syncVisibilityToPlayers = async (gameId: string, ms: MapState) => {
    const visibleIds = buildVisibleSystemIds(ms);
    const { data: gamePlayers } = await (supabase as any)
      .from("game_players")
      .select("id")
      .eq("game_id", gameId);

    if (gamePlayers && gamePlayers.length > 0) {
      for (const gp of gamePlayers) {
        await (supabase as any)
          .from("game_players")
          .update({ visible_system_ids: visibleIds })
          .eq("id", gp.id);
      }

      // Pre-populate fog-of-war memory for every baseline (Core/Province/Marches)
      // system. This gives every player a starting "last known state" snapshot
      // for the explored map, even before they move a fleet.
      const visibleSet = new Set(visibleIds);
      const baselineSystems = Array.from(ms.systems.values()).filter(s => visibleSet.has(s.system_id));
      const intelRows: any[] = [];
      for (const gp of gamePlayers) {
        for (const sys of baselineSystems) {
          intelRows.push({
            game_id: gameId,
            observer_player_id: gp.id,
            system_id: sys.system_id,
            last_seen_turn: 0,
            snapshot_json: buildSystemSnapshot(sys),
          });
        }
      }
      const CHUNK = 500;
      for (let i = 0; i < intelRows.length; i += CHUNK) {
        await (supabase as any)
          .from("player_system_intel")
          .upsert(intelRows.slice(i, i + CHUNK), { onConflict: "observer_player_id,system_id" });
      }
    }
    return { count: visibleIds.length, players: gamePlayers?.length ?? 0 };
  };

  /** When a game starts, all players can see every system in Core + Province hexes */
  const processInitialVisibility = async (gameId: string) => {
    if (!mapState) return;
    const { count, players } = await syncVisibilityToPlayers(gameId, mapState);
    toast({ title: "Visibility processed", description: `${count} systems visible to ${players} players` });
  };

  /* ── run turn (delegates to phase-based turnProcessor) ── */
  const runTurn = async () => {
    if (!selectedGame || !mapState) return;
    setProcessing(true);
    try {
      // Set phase to processing
      await (supabase as any).from("games").update({ turn_phase: "processing" }).eq("id", selectedGame.id);

      const currentTurn = selectedGame.turn_number;
      const nextTurn = currentTurn + 1;

      // Run the phase-based processor: it loads orders, runs Economy → Movement
      // → Visibility → Combat, accumulates per-player econ, and bulk-inserts
      // logs tagged by phase.
      const result = await runTurnProcessor({
        supabase: supabase as any,
        gameId: selectedGame.id,
        currentTurn,
        mapState,
        facilityTypes,
        shipTypes,
      });

      const newMapState = result.mapState;
      setMapState(newMapState);

      // Persist updated map and advance turn
      const serialized = serializeMapState(newMapState);
      await (supabase as any).from("games").update({
        map_data_json: serialized,
        turn_number: nextTurn,
        turn_phase: "orders",
      }).eq("id", selectedGame.id);

      // Apply per-player econ deltas + reset action points and order locks
      const { data: gps } = await (supabase as any)
        .from("game_players")
        .select("id, player_slot, treasury, admin_capability, combat_capability")
        .eq("game_id", selectedGame.id);
      if (gps) {
        for (const gp of gps) {
          const econ = result.playerEcon.get(gp.player_slot) || { tribute: 0, maintenance: 0 };
          const newTreasury = (gp.treasury || 0) + econ.tribute - econ.maintenance;
          await (supabase as any).from("game_players").update({
            orders_locked: false,
            treasury: newTreasury,
            last_tribute: econ.tribute,
            last_maintenance: econ.maintenance,
            admin_points_remaining: gp.admin_capability || 3,
            combat_points_remaining: gp.combat_capability || 3,
          }).eq("id", gp.id);
        }
      }

      // Final summary log
      await addLog(
        selectedGame.id,
        "turn_processed",
        `Turn ${currentTurn} processed (${result.logsInserted} log entries). Now accepting orders for Turn ${nextTurn}.`,
      );

      setSelectedGame({ ...selectedGame, turn_number: nextTurn });
      await fetchGames();
      await refreshLogs(selectedGame.id);
      toast({ title: `Turn ${currentTurn} processed`, description: `Now accepting orders for Turn ${nextTurn}` });
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
    setLogRefreshKey(k => k + 1);
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
                    <TableHead>Orders</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {players.map(p => (
                    <TableRow key={p.id}>
                      <TableCell>{PROVINCE_NAMES[p.player_slot] || `Slot ${p.player_slot}`}</TableCell>
                      <TableCell>{getProfileLabel(p.user_id)}</TableCell>
                      <TableCell>
                        {p.orders_locked ? (
                          <Badge variant="default">Submitted</Badge>
                        ) : (
                          <Badge variant="outline">Not Submitted</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right space-x-2">
                        <Button size="sm" variant="secondary" disabled={selectedGame.status !== "active"} title={selectedGame.status !== "active" ? "Game must be active" : undefined} onClick={() => loginAsPlayer(p)}>Log in as</Button>
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
                  {processing ? "Processing..." : `Run Turn ${selectedGame.turn_number}`}
                </Button>
                {!mapState && <span className="text-sm text-destructive">Import a map first</span>}
                {selectedGame.status !== "active" && mapState && <span className="text-sm text-muted-foreground">Set status to Active to run turns</span>}
              </div>
            </div>

            {/* ── Snapshots Section ── */}
            <div className="space-y-2">
              <h3 className="text-lg font-semibold">Snapshots ({snapshots.length})</h3>
              <div className="flex items-center gap-2">
                <Input
                  placeholder={`Label (default: "Turn ${selectedGame.turn_number} snapshot")`}
                  value={snapshotLabel}
                  onChange={e => setSnapshotLabel(e.target.value)}
                  className="max-w-xs"
                />
                <Button variant="outline" onClick={saveSnapshot} disabled={!mapState}>
                  Save Snapshot
                </Button>
              </div>
              {snapshots.length > 0 && (
                <div className="max-h-48 overflow-y-auto border border-border rounded-md">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Label</TableHead>
                        <TableHead className="w-16">Turn</TableHead>
                        <TableHead className="w-32">Saved</TableHead>
                        <TableHead className="text-right w-40">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {snapshots.map(s => (
                        <TableRow key={s.id}>
                          <TableCell className="text-sm">{s.label}</TableCell>
                          <TableCell className="text-xs">{s.turn_number}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{new Date(s.created_at).toLocaleString()}</TableCell>
                          <TableCell className="text-right space-x-2">
                            <Button size="sm" variant="outline" onClick={() => loadSnapshot(s)}>Restore</Button>
                            <Button size="sm" variant="destructive" onClick={() => deleteSnapshot(s.id)}>Delete</Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>

            <Tabs defaultValue="turn-log" className="space-y-2">
              <TabsList>
                <TabsTrigger value="turn-log">Turn Log</TabsTrigger>
                <TabsTrigger value="raw-logs">Raw Logs ({logs.length})</TabsTrigger>
              </TabsList>
              <TabsContent value="turn-log">
                <TurnLogViewer gameId={selectedGame.id} showDetails recentTurnsLimit={10} refreshKey={logRefreshKey} />
              </TabsContent>
              <TabsContent value="raw-logs">
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
              </TabsContent>
            </Tabs>
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
    fleets: state.fleets || [],
  };
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

export default AdminGames;
