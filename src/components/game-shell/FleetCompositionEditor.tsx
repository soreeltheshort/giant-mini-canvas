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
}

interface Props {
  ships: FleetShipRow[];
  setShips: (updater: (prev: FleetShipRow[]) => FleetShipRow[]) => void;
  shipTypes: ShipTypeLookup[];
  canEdit: boolean;
  /** Strategy roles drive which lanes are shown (mirrors FleetBuilder). */
  special1Role: string;
  special2Role: string;
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

  const persistGroup = async (rowId: string, newGroup: string) => {
    const { error } = await supabase
      .from("fleet_ships")
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
      }
      setDragId(null);
      setDragOverGroup(null);
    },
    [dragId, setShips]
  );

  const handleQtyChange = async (rowId: string, qty: number) => {
    const safe = Math.max(0, Math.floor(qty));
    setShips((prev) =>
      prev.map((s) => (s.id === rowId ? { ...s, quantity: safe } : s))
    );
    if (safe <= 0) {
      await supabase.from("fleet_ships").delete().eq("id", rowId);
      setShips((prev) => prev.filter((s) => s.id !== rowId));
    } else {
      await supabase.from("fleet_ships").update({ quantity: safe }).eq("id", rowId);
    }
  };

  const removeRow = async (rowId: string) => {
    await supabase.from("fleet_ships").delete().eq("id", rowId);
    setShips((prev) => prev.filter((s) => s.id !== rowId));
  };

  if (ships.length === 0) {
    return (
      <p className="text-[10px] text-foreground/80 italic">
        No ships in this fleet.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {GROUPS.map((group) => {
        const groupShips = ships.filter((s) => s.tactical_group === group);
        const isOver = dragOverGroup === group;
        const totalQty = groupShips.reduce((sum, s) => sum + s.quantity, 0);
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
            <div className="flex items-center justify-between mb-1">
              <h4 className="text-[10px] font-heading uppercase tracking-wider text-bronze-dark font-bold">
                {group}
                {totalQty > 0 && (
                  <span className="ml-1.5 text-foreground/70 normal-case font-semibold">
                    ({totalQty})
                  </span>
                )}
              </h4>
            </div>
            <div className="space-y-1">
              {groupShips.length === 0 && canEdit && (
                <p className="text-[9px] text-foreground/60 italic px-1">
                  Drop ships here
                </p>
              )}
              {groupShips.map((s) => (
                <div
                  key={s.id}
                  draggable={canEdit}
                  onDragStart={() => canEdit && setDragId(s.id)}
                  onDragEnd={() => {
                    setDragId(null);
                    setDragOverGroup(null);
                  }}
                  className={`flex items-center gap-1.5 rounded-sm px-1.5 py-1 transition-opacity ${
                    canEdit
                      ? "cursor-grab active:cursor-grabbing hover:bg-muted/50"
                      : ""
                  } ${dragId === s.id ? "opacity-40" : ""}`}
                >
                  {canEdit && (
                    <GripVertical className="h-3 w-3 text-foreground/60 flex-shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="truncate text-[11px] font-bold text-foreground">
                      {s.ship_display_id ? `${s.ship_display_id} ` : ""}
                      {s.ship_name}
                    </div>
                    <div className="text-[9px] text-foreground/85 uppercase tracking-wider font-semibold">
                      {s.hull_class}
                    </div>
                  </div>
                  {canEdit ? (
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
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
