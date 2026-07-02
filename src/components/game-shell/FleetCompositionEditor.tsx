import { useCallback, useEffect, useMemo, useState } from "react";
import { GripVertical, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { ShipTypeLookup } from "./ContextPanel";

export interface FleetShipRow {
  id: string;
  ship_type_id: string;
  quantity: number;
  tactical_group: string;
  ship_name: string;
  ship_display_id: string;
  hull_class: string;
  /** Per-ship HP fields (per-game roster only). max_hp comes from ship type. */
  max_hp?: number | null;
  current_hp?: number | null;
  crippled?: boolean;
  /** Class designator (FL/FH/GS/etc.) — used for strikecraft capacity math. */
  ship_class?: string;
  /** Fighter bay slots provided by this ship type (per ship). */
  fighter_bay?: number;
  /** Gunship link slots provided by this ship type (per ship). */
  gun_ship_link?: number;
  /** Ground-invasion units this ship type can carry (per ship). */
  ground_invasion?: number;
}

/** Slots a single strikecraft consumes in its bucket (FL=1, FH=2, GS=1). */
function strikecraftSlots(cls: string): { bucket: "fighter" | "gunship"; slots: number } | null {
  if (cls === "FL") return { bucket: "fighter", slots: 1 };
  if (cls === "FH") return { bucket: "fighter", slots: 2 };
  if (cls === "GS") return { bucket: "gunship", slots: 1 };
  return null;
}

/**
 * Compute per-tactical-group fighter/gunship capacity & usage from a flat
 * list of FleetShipRow. Capacity comes from host ships' fighter_bay /
 * gun_ship_link fields; usage comes from FL/FH/GS ships in the same group.
 *
 * Exported so other components (e.g. PlayerGame's issues list) can reuse the
 * exact same logic without duplicating it.
 */
export function computeGroupStrikecraftCapacity(ships: FleetShipRow[]) {
  const map = new Map<
    string,
    { fighterCap: number; fighterUsed: number; gunshipCap: number; gunshipUsed: number }
  >();
  for (const s of ships) {
    const entry =
      map.get(s.tactical_group) ??
      { fighterCap: 0, fighterUsed: 0, gunshipCap: 0, gunshipUsed: 0 };
    entry.fighterCap += (s.fighter_bay || 0) * s.quantity;
    entry.gunshipCap += (s.gun_ship_link || 0) * s.quantity;
    const sc = strikecraftSlots(s.ship_class || "");
    if (sc) {
      if (sc.bucket === "fighter") entry.fighterUsed += sc.slots * s.quantity;
      else entry.gunshipUsed += sc.slots * s.quantity;
    }
    map.set(s.tactical_group, entry);
  }
  return map;
}

interface Props {
  ships: FleetShipRow[];
  setShips: (updater: (prev: FleetShipRow[]) => FleetShipRow[]) => void;
  shipTypes: ShipTypeLookup[];
  canEdit: boolean;
  /** Strategy roles drive which lanes are shown (mirrors FleetBuilder). */
  special1Role: string;
  special2Role: string;
  /** When true, each ship is listed individually (no quantity, no remove button). */
  listEachShip?: boolean;
  /** Called after any composition mutation (group move, qty change, removal)
   *  so the parent can re-validate submission issues (e.g. strikecraft over-capacity). */
  onCompositionChanged?: () => void;
}

const BASE_GROUPS = ["Core", "Attack"];
const TAIL_GROUPS = ["Rear", "Retreat"];
const FIXED_TAIL = ["System Defenses"];
/** Crippled ships are confined to these groups only. Scuttle is allowed because the ships are being removed at end of turn anyway. */
const CRIPPLED_ALLOWED_GROUPS = new Set(["Rear", "Retreat", "Scuttle"]);

export default function FleetCompositionEditor({
  ships,
  setShips,
  canEdit,
  special1Role,
  special2Role,
  listEachShip = false,
  onCompositionChanged,
}: Props) {
  const { toast } = useToast();
  const [dragId, setDragId] = useState<string | null>(null);
  /** When dragging an aggregated strikecraft row, carries every underlying DB id. */
  const [dragAggregateIds, setDragAggregateIds] = useState<string[] | null>(null);
  const [dragOverGroup, setDragOverGroup] = useState<string | null>(null);
  /** Pending strikecraft move awaiting a count from the user. */
  const [pendingMove, setPendingMove] = useState<{
    ids: string[];
    targetGroup: string;
    label: string;
    max: number;
    count: number;
  } | null>(null);


  const GROUPS = useMemo(
    () => [
      ...BASE_GROUPS,
      special1Role,
      ...(special2Role !== special1Role ? [special2Role] : []),
      ...TAIL_GROUPS,
      ...FIXED_TAIL,
    ],
    [special1Role, special2Role]
  );

  // NOTE: this editor mutates the per-game roster (`game_fleet_ships`), never
  // the player's saved Fleet Builder rows in `fleet_ships`. The row ids in
  // `ships` come from `game_fleet_ships`.
  const persistGroup = async (rowId: string, newGroup: string) => {
    const { error } = await supabase
      .from("game_fleet_ships")
      .update({ tactical_group: newGroup })
      .eq("id", rowId);
    if (error) {
      toast({
        title: "Failed to move ship",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const moveOneId = async (rowId: string, targetGroup: string) => {
    const dragged = ships.find((s) => s.id === rowId);
    if (dragged?.crippled && !CRIPPLED_ALLOWED_GROUPS.has(targetGroup)) {
      toast({
        title: "Crippled ships restricted",
        description: "Crippled ships can only be placed in Rear or Retreat.",
        variant: "destructive",
      });
      return;
    }
    setShips((prev) =>
      prev.map((s) => (s.id === rowId ? { ...s, tactical_group: targetGroup } : s))
    );
    await persistGroup(rowId, targetGroup);
  };

  const commitAggregateMove = async (ids: string[], targetGroup: string) => {
    // Check crippled restriction across the chosen subset
    const subset = ships.filter((s) => ids.includes(s.id));
    if (subset.some((s) => s.crippled) && !CRIPPLED_ALLOWED_GROUPS.has(targetGroup)) {
      toast({
        title: "Crippled ships restricted",
        description: "Crippled ships can only be placed in Rear or Retreat.",
        variant: "destructive",
      });
      return;
    }
    setShips((prev) =>
      prev.map((s) => (ids.includes(s.id) ? { ...s, tactical_group: targetGroup } : s))
    );
    await Promise.all(ids.map((id) => persistGroup(id, targetGroup)));
    onCompositionChanged?.();
  };

  const handleDrop = useCallback(
    (targetGroup: string) => {
      // Aggregate drop → prompt for count
      if (dragAggregateIds && dragAggregateIds.length > 0) {
        const first = ships.find((s) => s.id === dragAggregateIds[0]);
        if (first && first.tactical_group !== targetGroup) {
          setPendingMove({
            ids: dragAggregateIds,
            targetGroup,
            label: `${first.ship_name}`,
            max: dragAggregateIds.length,
            count: dragAggregateIds.length,
          });
        }
        setDragAggregateIds(null);
        setDragId(null);
        setDragOverGroup(null);
        return;
      }
      if (dragId !== null) {
        moveOneId(dragId, targetGroup).then(() => onCompositionChanged?.());
      }

      setDragId(null);
      setDragOverGroup(null);
    },
    [dragId, dragAggregateIds, ships, setShips, onCompositionChanged, toast]
  );

  // Auto-relocate any crippled ships outside Rear/Retreat into Rear.
  useEffect(() => {
    if (!canEdit) return;
    const strays = ships.filter(
      (s) => s.crippled && !CRIPPLED_ALLOWED_GROUPS.has(s.tactical_group)
    );
    if (strays.length === 0) return;
    setShips((prev) =>
      prev.map((s) =>
        s.crippled && !CRIPPLED_ALLOWED_GROUPS.has(s.tactical_group)
          ? { ...s, tactical_group: "Rear" }
          : s
      )
    );
    for (const s of strays) persistGroup(s.id, "Rear");
    onCompositionChanged?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ships, canEdit]);

  const handleQtyChange = async (rowId: string, qty: number) => {
    const safe = Math.max(0, Math.floor(qty));
    setShips((prev) =>
      prev.map((s) => (s.id === rowId ? { ...s, quantity: safe } : s))
    );
    if (safe <= 0) {
      await supabase.from("game_fleet_ships").delete().eq("id", rowId);
      setShips((prev) => prev.filter((s) => s.id !== rowId));
    } else {
      await supabase.from("game_fleet_ships").update({ quantity: safe }).eq("id", rowId);
    }
    onCompositionChanged?.();
  };

  const removeRow = async (rowId: string) => {
    await supabase.from("game_fleet_ships").delete().eq("id", rowId);
    setShips((prev) => prev.filter((s) => s.id !== rowId));
    onCompositionChanged?.();
  };

  if (ships.length === 0) {
    return (
      <p className="text-[10px] text-foreground/80 italic">
        No ships in this fleet.
      </p>
    );
  }

  const groupCapacity = useMemo(() => computeGroupStrikecraftCapacity(ships), [ships]);

  return (
    <div className="space-y-2">
      {GROUPS.map((group) => {
        const groupShips = ships.filter((s) => s.tactical_group === group);
        const isOver = dragOverGroup === group;
        const totalQty = groupShips.reduce((sum, s) => sum + s.quantity, 0);
        const cap = groupCapacity.get(group) ?? { fighterCap: 0, fighterUsed: 0, gunshipCap: 0, gunshipUsed: 0 };
        const fighterOver = cap.fighterUsed > cap.fighterCap;
        const gunshipOver = cap.gunshipUsed > cap.gunshipCap;
        const showFighter = cap.fighterCap > 0 || cap.fighterUsed > 0;
        const showGunship = cap.gunshipCap > 0 || cap.gunshipUsed > 0;
        // Build display items. In !listEachShip mode, collapse strikecraft
        // (FL/FH/GS) of the same ship_type_id within a group into one row;
        // drag/move on that row prompts for a count.
        type DisplayItem = { key: string; ids: string[]; sample: FleetShipRow; aggregate: boolean };
        let displayItems: DisplayItem[] = [];
        {
          const byType = new Map<string, FleetShipRow[]>();
          const others: FleetShipRow[] = [];
          for (const s of groupShips) {
            const cls = s.ship_class || "";
            const isStrikecraft = cls === "FL" || cls === "FH" || cls === "GS" || s.hull_class === "Strikecraft";
            if (isStrikecraft && !s.crippled && (s.max_hp == null || s.current_hp == null || s.current_hp >= s.max_hp)) {
              // Always collapse healthy, non-crippled strikecraft into a single row
              // (both in editor and fleet-detail views). HP/crippled rows remain
              // individually visible.
              const arr = byType.get(s.ship_type_id) || [];
              arr.push(s);
              byType.set(s.ship_type_id, arr);
            } else if (listEachShip) {
              // Non-strikecraft in fleet-detail view: expand each ship individually.
              for (let i = 0; i < s.quantity; i++) {
                others.push({ ...s, quantity: 1 });
                // Track an index suffix via a parallel key generator below.
              }
            } else {
              others.push(s);
            }
          }
          for (const [typeId, rows] of byType) {
            const totalCount = rows.reduce((sum, r) => sum + r.quantity, 0);
            displayItems.push({
              key: `agg-${typeId}-${group}`,
              ids: rows.map((r) => r.id),
              sample: { ...rows[0], quantity: totalCount },
              aggregate: rows.length > 1 || totalCount > 1,
            });
          }
          const keyCounts = new Map<string, number>();
          for (const s of others) {
            const n = keyCounts.get(s.id) ?? 0;
            keyCounts.set(s.id, n + 1);
            displayItems.push({
              key: listEachShip ? `${s.id}__${n}` : s.id,
              ids: [s.id],
              sample: s,
              aggregate: false,
            });
          }
        }

        return (
          <div
            key={group}
            onDragOver={(e) => {
              if (!canEdit) return;
              e.preventDefault();
              setDragOverGroup(group);
            }}
            onDragLeave={() => setDragOverGroup(null)}
            onDrop={(e) => {
              if (!canEdit) return;
              e.preventDefault();
              handleDrop(group);
            }}
            className={`rounded-sm border p-2 transition-colors min-h-[44px] ${
              isOver
                ? "border-crimson bg-crimson/5"
                : "border-border bg-background/40"
            }`}
          >
            <div className="flex items-center justify-between mb-1 gap-2">
              <h4 className="text-[10px] font-heading uppercase tracking-wider text-bronze-dark font-bold">
                {group}
                {totalQty > 0 && (
                  <span className="ml-1.5 text-foreground/70 normal-case font-semibold">
                    ({totalQty})
                  </span>
                )}
              </h4>
              {(showFighter || showGunship) && (
                <div className="flex items-center gap-2 text-[9px] font-semibold uppercase tracking-wider">
                  {showFighter && (
                    <span
                      className={fighterOver ? "text-crimson" : "text-foreground/70"}
                      title="Fighter slots used / capacity in this group"
                    >
                      FI {cap.fighterUsed}/{cap.fighterCap}
                    </span>
                  )}
                  {showGunship && (
                    <span
                      className={gunshipOver ? "text-crimson" : "text-foreground/70"}
                      title="Gunship slots used / capacity in this group"
                    >
                      GS {cap.gunshipUsed}/{cap.gunshipCap}
                    </span>
                  )}
                </div>
              )}
            </div>
            <div className="space-y-1">
              {displayItems.length === 0 && canEdit && (
                <p className="text-[9px] text-foreground/60 italic px-1">
                  Drop ships here
                </p>
              )}
              {displayItems.map((item) => {
                const s = item.sample;
                const realId = item.ids[0];
                const isDragging =
                  item.aggregate
                    ? dragAggregateIds != null && dragAggregateIds[0] === item.ids[0]
                    : dragId === realId;
                return (
                <div
                  key={item.key}
                  draggable={canEdit}
                  onDragStart={() => {
                    if (!canEdit) return;
                    if (item.aggregate) {
                      setDragAggregateIds(item.ids);
                      setDragId(null);
                    } else {
                      setDragId(realId);
                      setDragAggregateIds(null);
                    }
                  }}
                  onDragEnd={() => {
                    setDragId(null);
                    setDragAggregateIds(null);
                    setDragOverGroup(null);
                  }}
                  className={`flex items-center gap-1.5 rounded-sm px-1.5 py-1 transition-opacity ${
                    s.crippled
                      ? "bg-crimson/15"
                      : (s.max_hp != null && s.current_hp != null && s.current_hp < s.max_hp)
                      ? "bg-yellow-200/40"
                      : ""
                  } ${
                    canEdit
                      ? "cursor-grab active:cursor-grabbing hover:bg-muted/50"
                      : ""
                  } ${isDragging ? "opacity-40" : ""}`}
                >
                  {canEdit && (
                    <GripVertical className="h-3 w-3 text-foreground/60 flex-shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="truncate text-[11px] font-bold text-foreground">
                      {!item.aggregate && s.ship_display_id ? `${s.ship_display_id} ` : ""}
                      {s.ship_name}
                    </div>
                    <div className="text-[9px] text-foreground/85 uppercase tracking-wider font-semibold flex items-center gap-1.5">
                      <span>{s.hull_class}</span>
                      {(() => {
                        const max = s.max_hp ?? null;
                        const cur = s.current_hp ?? null;
                        if (s.crippled) {
                          const shown = cur != null ? cur : 0;
                          return (
                            <span className="text-crimson/70 normal-case tracking-normal font-semibold">
                              {max != null ? `${shown}/${max} · ` : ""}Crippled
                            </span>
                          );
                        }
                        if (!item.aggregate && max != null && cur != null && cur < max) {
                          return (
                            <span className="text-amber-700/70 normal-case tracking-normal font-semibold">
                              {cur}/{max}
                            </span>
                          );
                        }
                        return null;
                      })()}
                      {(s.fighter_bay || 0) > 0 && (
                        <span className="text-foreground/70 normal-case tracking-normal font-semibold" title="Fighter bay slots">
                          FB {s.fighter_bay}
                        </span>
                      )}
                      {(s.gun_ship_link || 0) > 0 && (
                        <span className="text-foreground/70 normal-case tracking-normal font-semibold" title="Gunship link slots">
                          GL {s.gun_ship_link}
                        </span>
                      )}
                      {(s.ground_invasion || 0) > 0 && (
                        <span className="text-foreground/70 normal-case tracking-normal font-semibold" title="Ground invasion capacity">
                          GI {s.ground_invasion}
                        </span>
                      )}
                    </div>
                  </div>
                  {!listEachShip && (item.aggregate ? (
                    <span className="font-bold text-bronze text-xs">×{s.quantity}</span>
                  ) : canEdit ? (
                    <>
                      <input
                        type="number"
                        min={0}
                        value={s.quantity}
                        onChange={(e) =>
                          handleQtyChange(realId, Number(e.target.value))
                        }
                        onClick={(e) => e.stopPropagation()}
                        className="w-12 h-6 rounded-sm border border-input bg-background px-1 text-[11px] text-right font-semibold"
                      />
                      <button
                        onClick={() => removeRow(realId)}
                        className="text-crimson hover:text-crimson-light p-0.5"
                        title="Remove"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </>
                  ) : (
                    <span className="font-bold text-bronze text-xs">
                      ×{s.quantity}
                    </span>
                  ))}
                </div>
                );
              })}

            </div>
          </div>
        );
      })}

      {pendingMove && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40"
          onClick={() => setPendingMove(null)}
        >
          <div
            className="bg-background border border-bronze rounded-sm p-4 w-[280px] space-y-3 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h4 className="text-[11px] font-heading uppercase tracking-wider text-bronze-dark font-bold">
              Move {pendingMove.label} → {pendingMove.targetGroup}
            </h4>
            <div className="flex items-center gap-2">
              <input
                type="range"
                min={1}
                max={pendingMove.max}
                value={pendingMove.count}
                onChange={(e) =>
                  setPendingMove((p) => (p ? { ...p, count: Number(e.target.value) } : p))
                }
                className="flex-1"
              />
              <input
                type="number"
                min={1}
                max={pendingMove.max}
                value={pendingMove.count}
                onChange={(e) =>
                  setPendingMove((p) => {
                    if (!p) return p;
                    const n = Math.max(1, Math.min(p.max, Number(e.target.value) || 1));
                    return { ...p, count: n };
                  })
                }
                className="w-14 h-7 rounded-sm border border-input bg-background px-1 text-[11px] text-right font-semibold"
              />
              <span className="text-[10px] text-foreground/70">/ {pendingMove.max}</span>
            </div>
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => setPendingMove(null)}
                className="px-2 py-1 rounded-sm text-[10px] font-heading uppercase tracking-wider bg-muted text-foreground hover:bg-bronze/20"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  const subset = pendingMove.ids.slice(0, pendingMove.count);
                  const target = pendingMove.targetGroup;
                  setPendingMove(null);
                  await commitAggregateMove(subset, target);
                }}
                className="px-2 py-1 rounded-sm text-[10px] font-heading uppercase tracking-wider bg-crimson text-primary-foreground hover:bg-crimson-light"
              >
                Move
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

