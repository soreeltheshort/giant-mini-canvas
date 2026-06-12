import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import type { ShipTypeLookup } from "./ContextPanel";
import { offsetToCube, cubeDistance } from "@/lib/hexUtils";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export interface OwnedHex {
  x: number;
  y: number;
  system_name?: string | null;
}

type FilterKey = "invasion" | "sensors" | "repair" | "supply" | "fighters" | "gunship" | "strikecraft";

const FILTERS: { key: FilterKey; label: string; predicate: (s: ShipTypeLookup) => boolean }[] = [
  { key: "invasion",    label: "Invasion",          predicate: (s) => (s.ground_invasion ?? 0) > 0 },
  { key: "sensors",     label: "Sensors",           predicate: (s) => (s.scout_sensors ?? 0)  > 0 },
  { key: "repair",      label: "Repair",            predicate: (s) => (s.repair_pod ?? 0)     > 0 },
  { key: "supply",      label: "Supply",            predicate: (s) => (s.supply_pod ?? 0)     > 0 },
  { key: "fighters",    label: "Carrier",           predicate: (s) => (s.fighter_bay ?? 0)    > 0 },
  { key: "gunship",     label: "GS Tender",         predicate: (s) => (s.gun_ship_link ?? 0)  > 0 },
  { key: "strikecraft", label: "Fighters/Gunships", predicate: (s) => s.hull_class === "Strikecraft" },
];

export interface QueuedShip {
  ship_type_id: string;
  quantity: number;
  destination_fleet_id: string | null; // null = create new fleet at destination_hex
  destination_hex_x: number | null;    // only meaningful when destination_fleet_id is null
  destination_hex_y: number | null;
}

export interface PlayerFleetOption {
  fleet_id: string;
  fleet_name: string;
  atSystem: boolean;
  hex_x: number;
  hex_y: number;
  is_garrison?: boolean;
}

interface PersistedQueueRow {
  id: string;
  ship_type_id: string;
  quantity: number;
  destination_fleet_id: string | null;
  destination_hex_x: number | null;
  destination_hex_y: number | null;
  points_remaining: number;
  cost_paid: number;
  position: number;
}

interface BuildShipsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  systemName: string;
  systemHexX?: number;
  systemHexY?: number;
  /** Ship-build capacity (points/turn) of the producing system. */
  shipBuildCapacity?: number;
  /**
   * max_ship_hull_class code for each shipyard facility on this system.
   * A `null` entry means a shipyard with no class limit (unlimited).
   * Empty array → no shipyards → no hull-class filter is shown.
   */
  shipyardMaxHullCodes?: (string | null)[];
  shipTypes: ShipTypeLookup[];
  playerFleets?: PlayerFleetOption[];
  /** Hexes inside the player's province (where new fleets can spawn). */
  ownedHexes?: OwnedHex[];
  /** Required to load + edit the persisted queue. */
  gameId?: string;
  systemId?: number;
  ownerClassification?: string;
  /** Called after a persisted-queue edit so parent lists can refetch. */
  onQueueChanged?: () => void;
  onConfirm?: (queue: QueuedShip[]) => void;
}

const NEW_FLEET = "__new__";

function hexDist(ax: number, ay: number, bx: number, by: number) {
  const [a1, a2, a3] = offsetToCube(ax, ay);
  const [b1, b2, b3] = offsetToCube(bx, by);
  return cubeDistance(a1, a2, a3, b1, b2, b3);
}

export default function BuildShipsDialog({
  open,
  onOpenChange,
  systemName,
  systemHexX,
  systemHexY,
  shipBuildCapacity = 0,
  shipyardMaxHullCodes = [],
  shipTypes,
  playerFleets = [],
  ownedHexes = [],
  gameId,
  systemId,
  ownerClassification,
  onQueueChanged,
  onConfirm,
}: BuildShipsDialogProps) {
  const { toast } = useToast();
  const [activeFilter, setActiveFilter] = useState<FilterKey | null>(null);
  const [queueOrder, setQueueOrder] = useState<{ id: string; qty: number; destFleetId: string }[]>([]);
  const [newFleetHex, setNewFleetHex] = useState<{ x: number; y: number } | null>(null);
  const [persisted, setPersisted] = useState<PersistedQueueRow[]>([]);
  const [persistedLoading, setPersistedLoading] = useState(false);
  const [hullSort, setHullSort] = useState<Map<string, number>>(new Map());

  // Load hull-class ordering once. Used to enforce shipyard max_ship_hull_class.
  useEffect(() => {
    let cancelled = false;
    (supabase as any)
      .from("ship_hull_classes")
      .select("code, sort_order")
      .then(({ data }: any) => {
        if (cancelled) return;
        const m = new Map<string, number>();
        for (const r of data || []) m.set(String(r.code), Number(r.sort_order) || 0);
        setHullSort(m);
      });
    return () => { cancelled = true; };
  }, []);

  // Compute the highest hull-class sort_order this system can build.
  // - If any shipyard has no class limit (null) → unlimited.
  // - Otherwise take the max sort_order across shipyard caps.
  // - If no shipyards on system at all → undefined (no filter applied here;
  //   shipBuildCapacity == 0 already warns the player nothing will progress).
  const maxHullSort: number | null | undefined = useMemo(() => {
    if (!shipyardMaxHullCodes.length) return undefined;
    if (shipyardMaxHullCodes.some(c => !c)) return null; // unlimited
    let max = -Infinity;
    for (const code of shipyardMaxHullCodes) {
      const so = hullSort.get(String(code));
      if (so !== undefined && so > max) max = so;
    }
    return max === -Infinity ? null : max;
  }, [shipyardMaxHullCodes, hullSort]);

  const maxHullCode: string | null = useMemo(() => {
    if (maxHullSort == null) return null;
    let best: string | null = null;
    let bestSo = -Infinity;
    for (const [code, so] of hullSort) {
      if (so <= maxHullSort && so > bestSo) { best = code; bestSo = so; }
    }
    return best;
  }, [maxHullSort, hullSort]);

  /** True if this ship's hull class is buildable at this system's shipyards. */
  const isHullAllowed = (s: ShipTypeLookup): boolean => {
    if (maxHullSort == null) return true; // unlimited / no shipyards / no codes
    const code = String(s.class || "");
    const so = hullSort.get(code);
    // Unknown class codes (e.g. "FL" not in ship_hull_classes) → allow.
    if (so === undefined) return true;
    return so <= maxHullSort;
  };


  // Load persisted queue rows whenever the dialog opens.
  const reloadPersisted = async () => {
    if (!gameId || systemId === undefined) { setPersisted([]); return; }
    setPersistedLoading(true);
    let q = (supabase as any)
      .from("system_ship_production")
      .select("id, ship_type_id, quantity, destination_fleet_id, destination_hex_x, destination_hex_y, points_remaining, cost_paid, position")
      .eq("game_id", gameId)
      .eq("system_id", systemId)
      .order("position", { ascending: true });
    if (ownerClassification) q = q.eq("owner_classification", ownerClassification);
    const { data } = await q;
    setPersisted((data as PersistedQueueRow[]) || []);
    setPersistedLoading(false);
  };

  useEffect(() => {
    if (open) reloadPersisted();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, gameId, systemId, ownerClassification]);

  // Initialize / reset the new-fleet destination hex to the producing system whenever it opens.
  useEffect(() => {
    if (open && systemHexX !== undefined && systemHexY !== undefined) {
      setNewFleetHex({ x: systemHexX, y: systemHexY });
    }
  }, [open, systemHexX, systemHexY]);

  const cancelPersisted = async (row: PersistedQueueRow) => {
    const { error } = await (supabase as any).from("system_ship_production").delete().eq("id", row.id);
    if (error) {
      toast({ title: "Cancel failed", description: error.message, variant: "destructive" });
      return;
    }
    await reloadPersisted();
    onQueueChanged?.();
  };

  const updatePersistedDest = async (row: PersistedQueueRow, destFleetId: string) => {
    const isNewFleet = destFleetId === NEW_FLEET;
    const patch: any = {
      destination_fleet_id: isNewFleet ? null : destFleetId,
      destination_hex_x: isNewFleet ? (newFleetHex?.x ?? systemHexX ?? null) : null,
      destination_hex_y: isNewFleet ? (newFleetHex?.y ?? systemHexY ?? null) : null,
    };
    const { error } = await (supabase as any).from("system_ship_production").update(patch).eq("id", row.id);
    if (error) {
      toast({ title: "Update failed", description: error.message, variant: "destructive" });
      return;
    }
    await reloadPersisted();
    onQueueChanged?.();
  };


  // Ships must be assigned to an existing fleet. New-fleet creation from
  // production is disallowed — players must form a fleet first.
  const defaultDestination = playerFleets[0]?.fleet_id ?? "";



  const qtyOf = (id: string) => queueOrder.find((q) => q.id === id)?.qty ?? 0;

  const filtered = useMemo(() => {
    const base = activeFilter
      ? shipTypes.filter((s) => FILTERS.find((x) => x.key === activeFilter)!.predicate(s))
      : shipTypes;
    return base.filter(isHullAllowed);
  }, [shipTypes, activeFilter, maxHullSort, hullSort]);

  /** Strikecraft can only target fleets/garrisons within 2 hexes of the producing system. */
  const fleetsForShip = (shipTypeId: string): PlayerFleetOption[] => {
    const st = shipTypes.find(s => s.id === shipTypeId);
    if (!st) return playerFleets;
    if (st.hull_class !== "Strikecraft") return playerFleets;
    if (systemHexX === undefined || systemHexY === undefined) return playerFleets;
    return playerFleets.filter(f => hexDist(systemHexX, systemHexY, f.hex_x, f.hex_y) <= 2);
  };

  const selectFilter = (k: FilterKey) => {
    setActiveFilter((prev) => (prev === k ? null : k));
  };

  const adjust = (id: string, delta: number) => {
    setQueueOrder((prev) => {
      const idx = prev.findIndex((q) => q.id === id);
      if (idx === -1) {
        if (delta <= 0) return prev;
        // Strikecraft must default to a fleet within 2 hexes; otherwise blocked.
        const st = shipTypes.find(s => s.id === id);
        let dflt = defaultDestination;
        if (st?.hull_class === "Strikecraft" && systemHexX !== undefined && systemHexY !== undefined) {
          const ok = playerFleets.find(f => hexDist(systemHexX, systemHexY, f.hex_x, f.hex_y) <= 2);
          if (!ok) return prev; // no eligible fleet → can't queue
          dflt = ok.fleet_id;
        }
        if (!dflt) return prev; // no fleets at all → can't queue
        return [...prev, { id, qty: delta, destFleetId: dflt }];
      }

      const next = [...prev];
      const v = Math.max(0, next[idx].qty + delta);
      if (v === 0) next.splice(idx, 1);
      else next[idx] = { ...next[idx], qty: v };
      return next;
    });
  };

  const setDest = (idx: number, destFleetId: string) => {
    setQueueOrder((prev) => {
      const next = [...prev];
      if (!next[idx]) return prev;
      next[idx] = { ...next[idx], destFleetId };
      return next;
    });
  };

  const move = (idx: number, delta: number) => {
    setQueueOrder((prev) => {
      const target = idx + delta;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  };

  const totalQueued = queueOrder.reduce((a, q) => a + q.qty, 0);
  const totalCost = queueOrder.reduce((sum, q) => {
    const st = shipTypes.find((s) => s.id === q.id);
    return sum + (st?.point_cost ?? 0) * q.qty;
  }, 0);

  // Cumulative ETA estimator (head-first capacity drain).
  const etaForIndex = (idx: number): number | null => {
    if (shipBuildCapacity <= 0) return null;
    let pointsAhead = 0;
    for (let i = 0; i <= idx; i++) {
      const q = queueOrder[i];
      const st = shipTypes.find(s => s.id === q.id);
      pointsAhead += (st?.point_cost ?? 0) * q.qty;
    }
    return Math.max(1, Math.ceil(pointsAhead / shipBuildCapacity));
  };

  const handleDone = () => {
    if (queueOrder.length > 0 && onConfirm) {
      onConfirm(
        queueOrder.map((q) => {
          const isNewFleet = q.destFleetId === NEW_FLEET;
          return {
            ship_type_id: q.id,
            quantity: q.qty,
            destination_fleet_id: isNewFleet ? null : q.destFleetId,
            destination_hex_x: isNewFleet ? (newFleetHex?.x ?? systemHexX ?? null) : null,
            destination_hex_y: isNewFleet ? (newFleetHex?.y ?? systemHexY ?? null) : null,
          };
        }),
      );
    }
    setQueueOrder([]);
    setActiveFilter(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            Build Ships — {systemName}
            {shipBuildCapacity > 0 && (
              <span className="ml-2 text-[10px] font-body font-semibold text-bronze">
                · {shipBuildCapacity} pts/turn
              </span>
            )}
            {maxHullCode && (
              <span className="ml-2 text-[10px] font-body font-semibold text-bronze">
                · max hull {maxHullCode}
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        {shipBuildCapacity <= 0 && (
          <p className="text-[10px] text-crimson italic">
            This system has no shipyards. Builds will not progress until one is commissioned.
          </p>
        )}

        {/* Persisted Manufacturing Queue (already saved to DB) */}
        {(persistedLoading || persisted.length > 0) && (
          <div className="border border-bronze/40 rounded-sm p-2 space-y-1 max-h-48 overflow-y-auto bg-bronze/5">
            <div className="flex items-center justify-between">
              <div className="text-[9px] uppercase tracking-wider text-bronze font-heading font-semibold">
                Manufacturing Queue
              </div>
              {shipBuildCapacity > 0 && (
                <span className="text-[9px] text-muted-foreground">{shipBuildCapacity} pts/turn</span>
              )}
            </div>
            {persistedLoading && persisted.length === 0 ? (
              <p className="text-[10px] text-muted-foreground italic">Loading…</p>
            ) : (
              (() => {
                let pointsAhead = 0;
                return persisted.map((row, idx) => {
                  const st = shipTypes.find((s) => s.id === row.ship_type_id);
                  pointsAhead += row.points_remaining;
                  const eta = shipBuildCapacity > 0 ? Math.max(1, Math.ceil(pointsAhead / shipBuildCapacity)) : null;
                  const inProgress = row.points_remaining < row.cost_paid;
                  const allowedFleets = (() => {
                    if (!st) return playerFleets;
                    if (st.hull_class !== "Strikecraft") return playerFleets;
                    if (systemHexX === undefined || systemHexY === undefined) return playerFleets;
                    return playerFleets.filter(f => hexDist(systemHexX, systemHexY, f.hex_x, f.hex_y) <= 2);
                  })();
                  const currentDest = row.destination_fleet_id ?? "";
                  return (
                    <div key={row.id} className="flex items-center gap-2 text-[10px] flex-wrap">
                      <span className="w-4 text-right text-muted-foreground">{idx + 1}.</span>
                      <span className="flex-1 min-w-0 truncate text-accent font-semibold">
                        {st?.name ?? row.ship_type_id} <span className="text-bronze">×{row.quantity}</span>
                      </span>
                      <span className="text-slate-500">{row.points_remaining}/{row.cost_paid} pts</span>
                      {eta && <span className="text-bronze">ETA {eta}T</span>}
                      <select
                        value={currentDest}
                        onChange={(e) => updatePersistedDest(row, e.target.value)}
                        className="text-[10px] bg-muted border border-border rounded-sm px-1 py-0.5 text-foreground max-w-[12rem]"
                        title="Destination fleet"
                      >
                        {currentDest === "" && <option value="">— select fleet —</option>}
                        {allowedFleets.map((f) => (
                          <option key={f.fleet_id} value={f.fleet_id}>
                            {f.fleet_name}{f.atSystem ? " (here)" : ""}{f.is_garrison ? " ⚓" : ""}
                          </option>
                        ))}
                      </select>

                      <button
                        onClick={() => cancelPersisted(row)}
                        className="px-1.5 py-0.5 rounded-sm bg-muted text-foreground hover:bg-crimson/30 text-[10px] font-bold"
                        title={inProgress ? "Cancel — partial work lost" : "Cancel"}
                      >
                        Cancel
                      </button>
                    </div>
                  );
                });
              })()
            )}
          </div>
        )}

        {/* Build Queue (reorderable) */}
        {queueOrder.length > 0 && (
          <div className="border border-border rounded-sm p-2 space-y-1 max-h-48 overflow-y-auto">
            <div className="text-[9px] uppercase tracking-wider text-muted-foreground font-heading font-semibold">
              Build Queue
            </div>
            {queueOrder.map((q, idx) => {
              const st = shipTypes.find((s) => s.id === q.id);
              if (!st) return null;
              const eta = etaForIndex(idx);
              const allowedFleets = fleetsForShip(q.id);
              return (
                <div key={`${q.id}-${idx}`} className="flex items-center gap-2 text-[10px] flex-wrap">
                  <span className="w-4 text-right text-muted-foreground">{idx + 1}.</span>
                  <span className="flex-1 min-w-0 truncate text-accent font-semibold">
                    {st.name} <span className="text-bronze">×{q.qty}</span>
                  </span>
                  <span className="text-slate-500">₡{((st.point_cost ?? 0) * q.qty).toLocaleString()}</span>
                  {eta && <span className="text-bronze">ETA {eta}T</span>}
                  <select
                    value={q.destFleetId}
                    onChange={(e) => setDest(idx, e.target.value)}
                    className="text-[10px] bg-muted border border-border rounded-sm px-1 py-0.5 text-foreground max-w-[12rem]"
                    title="Destination fleet"
                  >
                    <option value={NEW_FLEET}>🪐 Planet (new fleet)</option>
                    {allowedFleets.map((f) => (
                      <option key={f.fleet_id} value={f.fleet_id}>
                        {f.fleet_name}{f.atSystem ? " (here)" : ""}{f.is_garrison ? " ⚓" : ""}
                      </option>
                    ))}
                  </select>
                  <div className="flex items-center gap-0.5">
                    <button
                      onClick={() => move(idx, -1)}
                      disabled={idx === 0}
                      className="w-5 h-5 rounded-sm bg-muted text-foreground disabled:opacity-30 hover:bg-bronze/20 text-[10px] font-bold leading-none"
                      title="Move up"
                    >
                      ▲
                    </button>
                    <button
                      onClick={() => move(idx, +1)}
                      disabled={idx === queueOrder.length - 1}
                      className="w-5 h-5 rounded-sm bg-muted text-foreground disabled:opacity-30 hover:bg-bronze/20 text-[10px] font-bold leading-none"
                      title="Move down"
                    >
                      ▼
                    </button>
                    <button
                      onClick={() => adjust(q.id, -q.qty)}
                      className="w-5 h-5 rounded-sm bg-muted text-foreground hover:bg-crimson/30 text-[10px] font-bold leading-none ml-1"
                      title="Remove"
                    >
                      ×
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Inline mini-map: pick destination hex for new fleets */}
        {ownedHexes.length > 0 && (queueOrder.length === 0 || queueOrder.some(q => q.destFleetId === NEW_FLEET)) && (
          <NewFleetHexPicker
            ownedHexes={ownedHexes}
            systemHex={systemHexX !== undefined && systemHexY !== undefined ? { x: systemHexX, y: systemHexY } : null}
            selected={newFleetHex}
            onSelect={(h) => setNewFleetHex(h)}
          />
        )}

        {/* Filters */}
        <div className="flex flex-wrap gap-1.5 pb-2 border-b border-border">
          {FILTERS.map((f) => {
            const on = activeFilter === f.key;
            return (
              <button
                key={f.key}
                onClick={() => selectFilter(f.key)}
                className={`px-2 py-1 rounded-sm text-[10px] font-heading font-semibold uppercase tracking-wider transition-colors
                  ${on
                    ? "bg-crimson text-primary-foreground"
                    : "bg-muted text-foreground hover:bg-bronze/20"}`}
              >
                {f.label}
              </button>
            );
          })}
          {activeFilter && (
            <button
              onClick={() => setActiveFilter(null)}
              className="px-2 py-1 rounded-sm text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground"
            >
              Clear
            </button>
          )}
        </div>

        {/* Ship list */}
        <div className="space-y-1.5 max-h-[50vh] overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="text-[10px] text-muted-foreground italic py-4 text-center">
              No ships match the selected filters.
            </p>
          ) : (
            filtered.map((s) => {
              const qty = qtyOf(s.id);
              const tags: string[] = [];
              if ((s.ground_invasion ?? 0) > 0) tags.push(`GI${s.ground_invasion}`);
              if ((s.scout_sensors ?? 0)  > 0) tags.push(`SN${s.scout_sensors}`);
              if ((s.repair_pod ?? 0)     > 0) tags.push(`RP${s.repair_pod}`);
              if ((s.supply_pod ?? 0)     > 0) tags.push(`SP${s.supply_pod}`);
              if ((s.fighter_bay ?? 0)    > 0) tags.push(`FB${s.fighter_bay}`);
              if ((s.gun_ship_link ?? 0)  > 0) tags.push(`GL${s.gun_ship_link}`);
              const isStrikecraft = s.hull_class === "Strikecraft";
              const strikecraftBlocked = isStrikecraft &&
                systemHexX !== undefined && systemHexY !== undefined &&
                !playerFleets.some(f => hexDist(systemHexX, systemHexY, f.hex_x, f.hex_y) <= 2);
              return (
                <div key={s.id} className="border border-border rounded-sm p-2 flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-semibold text-accent truncate">{s.name}</span>
                      <span className="text-[9px] uppercase tracking-wider text-muted-foreground">{s.hull_class}</span>
                      {tags.map((t) => (
                        <span key={t} className="text-[9px] px-1 rounded-sm bg-bronze/20 text-bronze font-semibold">{t}</span>
                      ))}
                      {isStrikecraft && (
                        <span className="text-[9px] text-bronze italic">requires fleet within 2 hexes</span>
                      )}
                    </div>
                    <p className="text-[10px] text-slate-500">
                      ₡{s.point_cost ?? 0} · maint {s.maintenance ?? 0} · spd {s.map_speed ?? 1}
                    </p>
                    {s.flavor_description && (
                      <p className="text-[10px] text-muted-foreground italic mt-0.5 leading-snug">
                        {s.flavor_description}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0 pt-0.5">
                    {isStrikecraft ? (
                      <>
                        <button
                          onClick={() => adjust(s.id, -1)}
                          disabled={qty === 0}
                          className="w-6 h-6 rounded-sm bg-muted text-foreground disabled:opacity-40 hover:bg-bronze/20 text-sm font-bold"
                        >
                          −
                        </button>
                        <span className="w-6 text-center text-xs font-semibold text-bronze">{qty}</span>
                        <button
                          onClick={() => adjust(s.id, +1)}
                          disabled={strikecraftBlocked}
                          title={strikecraftBlocked ? "No friendly fleet within 2 hexes" : ""}
                          className="w-6 h-6 rounded-sm bg-muted text-foreground hover:bg-bronze/20 text-sm font-bold disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          +
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => adjust(s.id, +1)}
                        className="px-2 py-1 rounded-sm text-[10px] font-heading font-semibold uppercase tracking-wider bg-crimson text-primary-foreground hover:bg-crimson-light bronze-glow-hover"
                      >
                        Build{qty > 0 ? ` (${qty})` : ""}
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <DialogFooter className="border-t border-border pt-2 flex-row items-center justify-between gap-2 sm:justify-between">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Queue: {totalQueued} ship{totalQueued === 1 ? "" : "s"} · ₡{totalCost.toLocaleString()}
          </span>
          <button
            onClick={handleDone}
            className="px-3 py-1.5 rounded-sm text-[10px] font-heading font-semibold uppercase tracking-wider bg-crimson text-primary-foreground hover:bg-crimson-light bronze-glow-hover"
          >
            Done
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ───────── Inline hex picker for new-fleet destination ───────── */
function NewFleetHexPicker({
  ownedHexes,
  systemHex,
  selected,
  onSelect,
}: {
  ownedHexes: OwnedHex[];
  systemHex: { x: number; y: number } | null;
  selected: { x: number; y: number } | null;
  onSelect: (h: { x: number; y: number }) => void;
}) {
  const SIZE = 9;
  const SQRT3 = Math.sqrt(3);
  const hexW = SQRT3 * SIZE;
  const hexH = 2 * SIZE;
  const vert = 1.5 * SIZE;

  const positioned = ownedHexes.map((h) => {
    const px = hexW * (h.x + 0.5 * (h.y & 1));
    const py = vert * h.y;
    return { ...h, px, py };
  });

  if (positioned.length === 0) return null;

  const minX = Math.min(...positioned.map((p) => p.px)) - hexW;
  const maxX = Math.max(...positioned.map((p) => p.px)) + hexW;
  const minY = Math.min(...positioned.map((p) => p.py)) - hexH;
  const maxY = Math.max(...positioned.map((p) => p.py)) + hexH;
  const w = maxX - minX;
  const h = maxY - minY;

  const hexPath = (cx: number, cy: number) => {
    const pts: string[] = [];
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 180) * (60 * i - 30);
      pts.push(`${(cx + SIZE * Math.cos(a)).toFixed(2)},${(cy + SIZE * Math.sin(a)).toFixed(2)}`);
    }
    return `M${pts.join("L")}Z`;
  };

  return (
    <div className="border border-border rounded-sm p-2 space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-[9px] uppercase tracking-wider text-muted-foreground font-heading font-semibold">
          New Fleet Destination
        </span>
        <span className="text-[10px] text-bronze font-semibold">
          {selected ? `(${selected.x}, ${selected.y})` : "— pick a hex —"}
        </span>
      </div>
      <p className="text-[9px] text-muted-foreground italic">
        Click any hex in your province. Defaults to the producing system.
      </p>
      <div className="bg-muted/40 rounded-sm overflow-auto max-h-56 flex justify-center">
        <svg
          viewBox={`${minX} ${minY} ${w} ${h}`}
          width={Math.min(420, Math.max(160, w * 1.6))}
          height={Math.min(220, Math.max(120, h * 1.6))}
          className="block"
        >
          {positioned.map((p) => {
            const isSel = !!(selected && selected.x === p.x && selected.y === p.y);
            const isSys = !!(systemHex && systemHex.x === p.x && systemHex.y === p.y);
            return (
              <g key={`${p.x},${p.y}`} onClick={() => onSelect({ x: p.x, y: p.y })} style={{ cursor: "pointer" }}>
                <title>{p.system_name ? `${p.system_name} (${p.x},${p.y})` : `(${p.x},${p.y})`}</title>
                <path
                  d={hexPath(p.px, p.py)}
                  className={
                    isSel
                      ? "fill-crimson stroke-crimson"
                      : isSys
                        ? "fill-bronze/40 stroke-bronze"
                        : "fill-ivory stroke-bronze/50 hover:fill-bronze/20"
                  }
                  strokeWidth={isSel ? 1.5 : 0.8}
                />
                {p.system_name && (
                  <circle cx={p.px} cy={p.py} r={SIZE * 0.25} className="fill-bronze" />
                )}
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
