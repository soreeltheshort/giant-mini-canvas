import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { MapFleet } from "@/lib/mapTypes";
import type { ShipTypeLookup } from "./ContextPanel";
import {
  addShipsToFleet,
  removeFleetShipRow,
  setFleetGroundInvasion,
  setFleetSupply,
  setTreasury,
} from "@/lib/testMode/testActions";

interface Props {
  gameId: string;
  turnNumber: number;
  /** Current viewing player faction row id (game_factions.id). */
  gameFactionId: string;
  factionName: string;
  treasury: number;
  /** All fleets on the map — used for the fleet picker. */
  fleets: MapFleet[];
  /** Ships available to add. */
  shipTypes: ShipTypeLookup[];
  /** Currently selected fleet's game_fleets.id (may be null). */
  selectedGameFleetId: string | null;
  /** Toggle teleport picker: when armed, next map click moves the selected fleet. */
  teleportArmed: boolean;
  onArmTeleport: (armed: boolean) => void;
  /** Notify parent when any DB change happens so it can reload the map. */
  onChanged: () => void;
}

interface FleetShipRow {
  id: string;
  ship_type_id: string;
  quantity: number;
  tactical_group: string;
}

interface FleetMeta {
  gameFleetId: string;
  fleetName: string;
  /** fleets.id — supply lives here. */
  sourceFleetId: string;
  currentSupply: number;
  currentGroundInvasion: number;
}

export default function TestModePanel({
  gameId, turnNumber,
  gameFactionId, factionName, treasury,
  fleets, shipTypes,
  selectedGameFleetId, teleportArmed, onArmTeleport,
  onChanged,
}: Props) {
  const { toast } = useToast();
  const [treasuryInput, setTreasuryInput] = useState(String(treasury));
  useEffect(() => { setTreasuryInput(String(treasury)); }, [treasury]);

  const selected = selectedGameFleetId
    ? fleets.find(f => f.fleet_id === selectedGameFleetId) ?? null
    : null;

  const [meta, setMeta] = useState<FleetMeta | null>(null);
  const [supplyInput, setSupplyInput] = useState("0");
  const [giInput, setGiInput] = useState("0");
  const [rows, setRows] = useState<FleetShipRow[]>([]);
  const [addShipTypeId, setAddShipTypeId] = useState<string>(shipTypes[0]?.id ?? "");
  const [addQty, setAddQty] = useState(1);
  const [busy, setBusy] = useState(false);

  // Load fleet meta + ship rows whenever the selected fleet changes.
  useEffect(() => {
    let cancelled = false;
    if (!selected) { setMeta(null); setRows([]); return; }
    (async () => {
      const { data: gf } = await (supabase as any)
        .from("game_fleets")
        .select("id, fleet_name, fleet_id")
        .eq("id", selected.fleet_id).maybeSingle();
      if (!gf || cancelled) return;
      const { data: fl } = await (supabase as any)
        .from("fleets")
        .select("id, current_supply, current_ground_invasion")
        .eq("id", gf.fleet_id).maybeSingle();
      const { data: shipRows } = await (supabase as any)
        .from("game_fleet_ships")
        .select("id, ship_type_id, quantity, tactical_group")
        .eq("game_fleet_id", gf.id)
        .order("tactical_group");
      if (cancelled) return;
      const supply = Number(fl?.current_supply ?? 0);
      const gi = Number(fl?.current_ground_invasion ?? 0);
      setMeta({
        gameFleetId: gf.id,
        fleetName: gf.fleet_name,
        sourceFleetId: gf.fleet_id,
        currentSupply: supply,
        currentGroundInvasion: gi,
      });
      setSupplyInput(String(supply));
      setGiInput(String(gi));
      setRows(shipRows || []);
    })();
    return () => { cancelled = true; };
  }, [selected?.fleet_id]);

  const applyTreasury = async () => {
    const val = parseInt(treasuryInput, 10);
    if (!isFinite(val) || val < 0) {
      toast({ title: "Invalid amount", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      await setTreasury({
        gameId, turnNumber, gameFactionId, factionName,
        fromValue: treasury, toValue: val,
      });
      onChanged();
      toast({ title: "Treasury updated", description: `${factionName} → ${val}` });
    } catch (e: any) {
      toast({ title: "Failed", description: e.message, variant: "destructive" });
    } finally { setBusy(false); }
  };

  const applySupply = async () => {
    if (!meta) return;
    const val = parseInt(supplyInput, 10);
    if (!isFinite(val) || val < 0) {
      toast({ title: "Invalid amount", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      await setFleetSupply({
        gameId, turnNumber,
        fleetsRowId: meta.sourceFleetId, fleetName: meta.fleetName,
        fromValue: meta.currentSupply, toValue: val,
      });
      setMeta({ ...meta, currentSupply: val });
      onChanged();
      toast({ title: "Supply updated" });
    } catch (e: any) {
      toast({ title: "Failed", description: e.message, variant: "destructive" });
    } finally { setBusy(false); }
  };

  const applyGi = async () => {
    if (!meta) return;
    const val = parseInt(giInput, 10);
    if (!isFinite(val) || val < 0) {
      toast({ title: "Invalid amount", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      await setFleetGroundInvasion({
        gameId, turnNumber,
        fleetsRowId: meta.sourceFleetId, fleetName: meta.fleetName,
        fromValue: meta.currentGroundInvasion, toValue: val,
      });
      setMeta({ ...meta, currentGroundInvasion: val });
      onChanged();
      toast({ title: "Ground invasion updated" });
    } catch (e: any) {
      toast({ title: "Failed", description: e.message, variant: "destructive" });
    } finally { setBusy(false); }
  };

  const addShip = async () => {
    if (!meta || !addShipTypeId) return;
    const type = shipTypes.find(t => t.id === addShipTypeId);
    if (!type) return;
    setBusy(true);
    try {
      await addShipsToFleet({
        gameId, turnNumber,
        gameFleetId: meta.gameFleetId, fleetName: meta.fleetName,
        shipTypeId: type.id, shipTypeName: type.name,
        quantity: addQty,
      });
      // Refresh rows.
      const { data: shipRows } = await (supabase as any)
        .from("game_fleet_ships")
        .select("id, ship_type_id, quantity, tactical_group")
        .eq("game_fleet_id", meta.gameFleetId)
        .order("tactical_group");
      setRows(shipRows || []);
      onChanged();
      toast({ title: "Ships added", description: `${addQty}× ${type.name}` });
    } catch (e: any) {
      toast({ title: "Failed", description: e.message, variant: "destructive" });
    } finally { setBusy(false); }
  };

  const removeRow = async (rowId: string, shipTypeId: string) => {
    if (!meta) return;
    const type = shipTypes.find(t => t.id === shipTypeId);
    setBusy(true);
    try {
      await removeFleetShipRow({
        gameId, turnNumber,
        rowId, fleetName: meta.fleetName,
        shipTypeName: type?.name ?? "ship",
      });
      setRows(prev => prev.filter(r => r.id !== rowId));
      onChanged();
    } catch (e: any) {
      toast({ title: "Failed", description: e.message, variant: "destructive" });
    } finally { setBusy(false); }
  };

  // Aggregate rows for display: (ship_type_id, tactical_group) → count.
  const aggregated = new Map<string, { shipTypeId: string; group: string; count: number; rowIds: string[] }>();
  for (const r of rows) {
    const k = `${r.ship_type_id}|${r.tactical_group}`;
    const e = aggregated.get(k) ?? { shipTypeId: r.ship_type_id, group: r.tactical_group, count: 0, rowIds: [] };
    e.count += r.quantity;
    e.rowIds.push(r.id);
    aggregated.set(k, e);
  }

  return (
    <div className="rounded-sm border-2 border-crimson bg-crimson/5 p-2 space-y-2">
      <div className="text-[9px] font-heading uppercase tracking-widest text-crimson font-bold flex items-center justify-between">
        <span>Test Mode</span>
        <span className="text-crimson/60">Admin</span>
      </div>

      {/* Treasury */}
      <div className="space-y-1">
        <label className="text-[9px] font-heading uppercase tracking-wider text-white font-bold block">
          {factionName} Treasury
        </label>
        <div className="flex gap-1">
          <input
            type="number"
            min={0}
            value={treasuryInput}
            onChange={(e) => setTreasuryInput(e.target.value)}
            className="flex-1 h-7 rounded-sm border border-input bg-background px-2 text-[11px]"
          />
          <button
            onClick={applyTreasury}
            disabled={busy}
            className="h-7 px-2 rounded-sm bg-crimson text-primary-foreground text-[10px] font-heading uppercase tracking-wider disabled:opacity-50"
          >Set</button>
        </div>
      </div>

      {/* Fleet-scoped section */}
      {selected ? (
        <div className="space-y-2 border-t border-crimson/30 pt-2">
          <div className="text-[9px] font-heading uppercase tracking-wider text-white font-bold">
            Fleet: {selected.fleet_name}
          </div>

          {/* Teleport */}
          <button
            onClick={() => onArmTeleport(!teleportArmed)}
            className={`w-full h-7 rounded-sm text-[10px] font-heading uppercase tracking-wider ${
              teleportArmed
                ? "bg-crimson text-primary-foreground"
                : "bg-background border border-crimson/60 text-crimson"
            }`}
          >
            {teleportArmed ? "Click a hex to teleport" : "Teleport fleet"}
          </button>

          {/* Supply */}
          {meta && (
            <div className="space-y-1">
              <label className="text-[9px] font-heading uppercase tracking-wider text-white font-bold block">
                Current Supply
              </label>
              <div className="flex gap-1">
                <input
                  type="number"
                  min={0}
                  value={supplyInput}
                  onChange={(e) => setSupplyInput(e.target.value)}
                  className="flex-1 h-7 rounded-sm border border-input bg-background px-2 text-[11px]"
                />
                <button
                  onClick={applySupply}
                  disabled={busy}
                  className="h-7 px-2 rounded-sm bg-crimson text-primary-foreground text-[10px] font-heading uppercase tracking-wider disabled:opacity-50"
                >Set</button>
              </div>
            </div>
          )}

          {/* Ground Invasion Forces */}
          {meta && (
            <div className="space-y-1">
              <label className="text-[9px] font-heading uppercase tracking-wider text-white font-bold block">
                Ground Invasion Forces
              </label>
              <div className="flex gap-1">
                <input
                  type="number"
                  min={0}
                  value={giInput}
                  onChange={(e) => setGiInput(e.target.value)}
                  className="flex-1 h-7 rounded-sm border border-input bg-background px-2 text-[11px]"
                />
                <button
                  onClick={applyGi}
                  disabled={busy}
                  className="h-7 px-2 rounded-sm bg-crimson text-primary-foreground text-[10px] font-heading uppercase tracking-wider disabled:opacity-50"
                >Set</button>
              </div>
            </div>
          )}

          {/* Add Ship */}
          {meta && (
            <div className="space-y-1">
              <label className="text-[9px] font-heading uppercase tracking-wider text-white font-bold block">
                Add Ships (→ Core)
              </label>
              <div className="flex gap-1">
                <select
                  value={addShipTypeId}
                  onChange={(e) => setAddShipTypeId(e.target.value)}
                  className="flex-1 h-7 rounded-sm border border-input bg-background px-1 text-[11px]"
                >
                  {shipTypes.map(t => (
                    <option key={t.id} value={t.id}>{t.name} ({t.hull_class})</option>
                  ))}
                </select>
                <input
                  type="number"
                  min={1}
                  max={99}
                  value={addQty}
                  onChange={(e) => setAddQty(Math.max(1, parseInt(e.target.value, 10) || 1))}
                  className="w-12 h-7 rounded-sm border border-input bg-background px-1 text-[11px]"
                />
                <button
                  onClick={addShip}
                  disabled={busy || !addShipTypeId}
                  className="h-7 px-2 rounded-sm bg-crimson text-primary-foreground text-[10px] font-heading uppercase tracking-wider disabled:opacity-50"
                >Add</button>
              </div>
            </div>
          )}

          {/* Existing rows with delete */}
          {aggregated.size > 0 && (
            <div className="space-y-0.5 max-h-40 overflow-y-auto">
              <div className="text-[9px] font-heading uppercase tracking-wider text-white font-bold">Composition</div>
              {Array.from(aggregated.values()).map(a => {
                const type = shipTypes.find(t => t.id === a.shipTypeId);
                return (
                  <div key={`${a.shipTypeId}|${a.group}`} className="flex items-center gap-1 text-[10px]">
                    <span className="flex-1 truncate">{type?.name ?? a.shipTypeId} · {a.group} × {a.count}</span>
                    <button
                      title="Remove one"
                      onClick={() => removeRow(a.rowIds[0], a.shipTypeId)}
                      disabled={busy}
                      className="h-5 w-5 flex items-center justify-center rounded-sm text-crimson hover:bg-crimson/10 disabled:opacity-50"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <div className="text-[10px] italic text-muted-foreground border-t border-crimson/30 pt-2">
          Select a fleet to edit ships, supply, or teleport.
        </div>
      )}
    </div>
  );
}
