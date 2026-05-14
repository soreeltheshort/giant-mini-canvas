import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import type { ShipTypeLookup } from "./ContextPanel";
import { offsetToCube, cubeDistance } from "@/lib/hexUtils";

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
  destination_fleet_id: string | null; // null = create new fleet
}

export interface PlayerFleetOption {
  fleet_id: string;
  fleet_name: string;
  atSystem: boolean;
  hex_x: number;
  hex_y: number;
  is_garrison?: boolean;
}

interface BuildShipsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  systemName: string;
  systemHexX?: number;
  systemHexY?: number;
  /** Ship-build capacity (points/turn) of the producing system. */
  shipBuildCapacity?: number;
  shipTypes: ShipTypeLookup[];
  playerFleets?: PlayerFleetOption[];
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
  shipTypes,
  playerFleets = [],
  onConfirm,
}: BuildShipsDialogProps) {
  const [activeFilter, setActiveFilter] = useState<FilterKey | null>(null);
  const [queueOrder, setQueueOrder] = useState<{ id: string; qty: number; destFleetId: string }[]>([]);

  // Default to building at the planet (new fleet); user can pick an existing fleet instead.
  const defaultDestination = NEW_FLEET;

  const qtyOf = (id: string) => queueOrder.find((q) => q.id === id)?.qty ?? 0;

  const filtered = useMemo(() => {
    if (!activeFilter) return shipTypes;
    const f = FILTERS.find((x) => x.key === activeFilter)!;
    return shipTypes.filter((s) => f.predicate(s));
  }, [shipTypes, activeFilter]);

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
        // For strikecraft, default destination must be within 2 hexes.
        const st = shipTypes.find(s => s.id === id);
        let dflt = defaultDestination;
        if (st?.hull_class === "Strikecraft" && systemHexX !== undefined && systemHexY !== undefined) {
          const ok = playerFleets.find(f => hexDist(systemHexX, systemHexY, f.hex_x, f.hex_y) <= 2);
          dflt = ok ? ok.fleet_id : NEW_FLEET;
        }
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
        queueOrder.map((q) => ({
          ship_type_id: q.id,
          quantity: q.qty,
          destination_fleet_id: q.destFleetId === NEW_FLEET ? null : q.destFleetId,
        })),
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
          </DialogTitle>
        </DialogHeader>

        {shipBuildCapacity <= 0 && (
          <p className="text-[10px] text-crimson italic">
            This system has no shipyards. Builds will not progress until one is commissioned.
          </p>
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
                    {allowedFleets.map((f) => (
                      <option key={f.fleet_id} value={f.fleet_id}>
                        {f.fleet_name}{f.atSystem ? " (here)" : ""}{f.is_garrison ? " ⚓" : ""}
                      </option>
                    ))}
                    <option value={NEW_FLEET}>+ New fleet</option>
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
