import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import type { ShipTypeLookup } from "./ContextPanel";

type FilterKey = "invasion" | "sensors" | "repair" | "supply" | "fighters" | "gunship" | "strikecraft";

const FILTERS: { key: FilterKey; label: string; predicate: (s: ShipTypeLookup) => boolean }[] = [
  { key: "invasion",    label: "Invasion",          predicate: (s) => (s.ground_invasion ?? 0) > 0 },
  { key: "sensors",     label: "Sensors",           predicate: (s) => (s.scout_sensors ?? 0)  > 0 },
  { key: "repair",      label: "Repair",            predicate: (s) => (s.repair_pod ?? 0)     > 0 },
  { key: "supply",      label: "Supply",            predicate: (s) => (s.supply_pod ?? 0)     > 0 },
  { key: "fighters",    label: "Carrier",           predicate: (s) => (s.fighter_bay ?? 0)    > 0 },
  { key: "gunship",     label: "GS Tender",         predicate: (s) => (s.gun_ship_link ?? 0)  > 0 },
  { key: "strikecraft", label: "Fighters/Gunships", predicate: (s) => s.hull_class === "Fighter" || s.hull_class === "Gunship" },
];

export interface QueuedShip {
  ship_type_id: string;
  quantity: number;
}

interface BuildShipsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  systemName: string;
  shipTypes: ShipTypeLookup[];
  onConfirm?: (queue: QueuedShip[]) => void;
}

export default function BuildShipsDialog({
  open,
  onOpenChange,
  systemName,
  shipTypes,
  onConfirm,
}: BuildShipsDialogProps) {
  const [activeFilter, setActiveFilter] = useState<FilterKey | null>(null);
  const [queue, setQueue] = useState<Map<string, number>>(new Map());

  const filtered = useMemo(() => {
    if (!activeFilter) return shipTypes;
    const f = FILTERS.find((x) => x.key === activeFilter)!;
    return shipTypes.filter((s) => f.predicate(s));
  }, [shipTypes, activeFilter]);

  const selectFilter = (k: FilterKey) => {
    setActiveFilter((prev) => (prev === k ? null : k));
  };

  const adjust = (id: string, delta: number) => {
    setQueue((prev) => {
      const next = new Map(prev);
      const cur = next.get(id) ?? 0;
      const v = Math.max(0, cur + delta);
      if (v === 0) next.delete(id); else next.set(id, v);
      return next;
    });
  };

  const totalQueued = Array.from(queue.values()).reduce((a, b) => a + b, 0);
  const totalCost = Array.from(queue.entries()).reduce((sum, [id, qty]) => {
    const st = shipTypes.find((s) => s.id === id);
    return sum + (st?.point_cost ?? 0) * qty;
  }, 0);

  const handleDone = () => {
    if (queue.size > 0 && onConfirm) {
      onConfirm(Array.from(queue.entries()).map(([ship_type_id, quantity]) => ({ ship_type_id, quantity })));
    }
    setQueue(new Map());
    setActiveFilter(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Build Ships — {systemName}</DialogTitle>
        </DialogHeader>

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
              const qty = queue.get(s.id) ?? 0;
              const tags: string[] = [];
              if ((s.ground_invasion ?? 0) > 0) tags.push(`GI${s.ground_invasion}`);
              if ((s.scout_sensors ?? 0)  > 0) tags.push(`SN${s.scout_sensors}`);
              if ((s.repair_pod ?? 0)     > 0) tags.push(`RP${s.repair_pod}`);
              if ((s.supply_pod ?? 0)     > 0) tags.push(`SP${s.supply_pod}`);
              if ((s.fighter_bay ?? 0)    > 0) tags.push(`FB${s.fighter_bay}`);
              if ((s.gun_ship_link ?? 0)  > 0) tags.push(`GL${s.gun_ship_link}`);
              const isStrikecraft = s.hull_class === "Fighter" || s.hull_class === "Gunship";
              return (
                <div key={s.id} className="border border-border rounded-sm p-2 flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-semibold text-accent truncate">{s.name}</span>
                      <span className="text-[9px] uppercase tracking-wider text-muted-foreground">{s.hull_class}</span>
                      {tags.map((t) => (
                        <span key={t} className="text-[9px] px-1 rounded-sm bg-bronze/20 text-bronze font-semibold">{t}</span>
                      ))}
                    </div>
                    <p className="text-[10px] text-slate-500">
                      ₡{s.point_cost ?? 0} · maint {s.maintenance ?? 0}
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
                          className="w-6 h-6 rounded-sm bg-muted text-foreground hover:bg-bronze/20 text-sm font-bold"
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
