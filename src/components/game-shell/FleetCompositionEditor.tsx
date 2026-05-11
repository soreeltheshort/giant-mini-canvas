import { useCallback, useMemo, useState } from "react";
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
  const [dragOverGroup, setDragOverGroup] = useState<string | null>(null);

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

  const handleDrop = useCallback(
    (targetGroup: string) => {
      if (dragId !== null) {
        setShips((prev) =>
          prev.map((s) =>
            s.id === dragId ? { ...s, tactical_group: targetGroup } : s
          )
        );
        persistGroup(dragId, targetGroup);
        onCompositionChanged?.();
      }
      setDragId(null);
      setDragOverGroup(null);
    },
    [dragId, setShips, onCompositionChanged]
  );

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
        const displayShips: FleetShipRow[] = listEachShip
          ? groupShips.flatMap((s) =>
              Array.from({ length: s.quantity }, (_, i) => ({
                ...s,
                quantity: 1,
                // Suffix the key so React doesn't collide; id stays for drag mapping.
                id: `${s.id}__${i}`,
              }))
            )
          : groupShips;
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
              {displayShips.length === 0 && canEdit && (
                <p className="text-[9px] text-foreground/60 italic px-1">
                  Drop ships here
                </p>
              )}
              {displayShips.map((s) => {
                // In listEachShip mode the row id is suffixed (`${realId}__${i}`)
                // so React keys stay unique; strip it to get the underlying DB id.
                const realId = listEachShip ? s.id.split("__")[0] : s.id;
                return (
                <div
                  key={s.id}
                  draggable={canEdit}
                  onDragStart={() => canEdit && setDragId(realId)}
                  onDragEnd={() => {
                    setDragId(null);
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
                  } ${dragId === realId ? "opacity-40" : ""}`}
                >
                  {canEdit && (
                    <GripVertical className="h-3 w-3 text-foreground/60 flex-shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="truncate text-[11px] font-bold text-foreground">
                      {s.ship_display_id ? `${s.ship_display_id} ` : ""}
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
                        if (max != null && cur != null && cur < max) {
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
                  {!listEachShip && (canEdit ? (
                    <>
                      <input
                        type="number"
                        min={0}
                        value={s.quantity}
                        onChange={(e) =>
                          handleQtyChange(s.id, Number(e.target.value))
                        }
                        onClick={(e) => e.stopPropagation()}
                        className="w-12 h-6 rounded-sm border border-input bg-background px-1 text-[11px] text-right font-semibold"
                      />
                      <button
                        onClick={() => removeRow(s.id)}
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
    </div>
  );
}
