import { useEffect, useState, useRef, useCallback } from "react";
import { Trash2 } from "lucide-react";
import { ImperialCard } from "./ImperialCard";
import { StatusBadge } from "./StatusBadge";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { MapFleet } from "@/lib/mapTypes";
import { CLASSIFICATION_LABELS, type HexClassification } from "@/lib/mapTypes";

const READINESS_LEVELS = [
  { value: 1, label: "Readiness 1 – Combat Ready" },
  { value: 2, label: "Readiness 2 – Standard" },
  { value: 3, label: "Readiness 3 – Routine" },
  { value: 4, label: "Readiness 4 – Drydocked" },
];

const STRATEGY_ROLES = ["Flank", "Outflank", "Attack Planet", "Cover Retreat", "Skirmish", "System Defenses"];

interface FleetRow {
  readiness: number;
  special1_role: string;
  special2_role: string;
}

interface ShipRow {
  id: string;
  ship_type_id: string;
  quantity: number;
  ship_name: string;
  hull_class: string;
  point_cost: number;
}

interface Props {
  fleet: MapFleet;
}

export default function FleetDetailContent({ fleet }: Props) {
  const { toast } = useToast();
  const sourceId = fleet.source_fleet_id;
  const ownerLabel = CLASSIFICATION_LABELS[fleet.owner_classification as HexClassification] || fleet.owner_classification;

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<FleetRow | null>(null);
  const [ships, setShips] = useState<ShipRow[]>([]);
  const [savingField, setSavingField] = useState<string | null>(null);
  const debounceRefs = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // Load underlying fleet + ships
  useEffect(() => {
    if (!sourceId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [{ data: fleetRow }, { data: shipRows }] = await Promise.all([
        supabase.from("fleets").select("readiness, special1_role, special2_role").eq("id", sourceId).maybeSingle(),
        supabase
          .from("fleet_ships")
          .select("id, ship_type_id, quantity, ship_types(name, hull_class, point_cost)")
          .eq("fleet_id", sourceId),
      ]);
      if (cancelled) return;
      if (fleetRow) {
        setData({
          readiness: fleetRow.readiness ?? 2,
          special1_role: fleetRow.special1_role ?? "Flank",
          special2_role: fleetRow.special2_role ?? "Flank",
        });
      }
      if (shipRows) {
        setShips(
          (shipRows as any[]).map((r) => ({
            id: r.id,
            ship_type_id: r.ship_type_id,
            quantity: r.quantity,
            ship_name: r.ship_types?.name ?? "Unknown",
            hull_class: r.ship_types?.hull_class ?? "",
            point_cost: r.ship_types?.point_cost ?? 0,
          })),
        );
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [sourceId]);

  const saveFleetField = useCallback(
    async (patch: Partial<FleetRow>, fieldKey: string) => {
      if (!sourceId) return;
      setSavingField(fieldKey);
      const { error } = await supabase.from("fleets").update(patch).eq("id", sourceId);
      setSavingField(null);
      if (error) {
        toast({ title: "Save failed", description: error.message, variant: "destructive" });
      }
    },
    [sourceId, toast],
  );

  const handleReadinessChange = (val: number) => {
    setData((d) => (d ? { ...d, readiness: val } : d));
    void saveFleetField({ readiness: val }, "readiness");
  };

  const handleStrategyChange = (slot: 1 | 2, val: string) => {
    setData((d) => (d ? { ...d, [slot === 1 ? "special1_role" : "special2_role"]: val } : d));
    void saveFleetField(
      slot === 1 ? { special1_role: val } : { special2_role: val },
      `strategy${slot}`,
    );
  };

  const handleQuantityChange = (rowId: string, qty: number) => {
    const safe = Math.max(0, Math.floor(qty));
    setShips((prev) => prev.map((s) => (s.id === rowId ? { ...s, quantity: safe } : s)));

    // Debounce per-row save
    const existing = debounceRefs.current.get(rowId);
    if (existing) clearTimeout(existing);
    const t = setTimeout(async () => {
      setSavingField(`qty-${rowId}`);
      if (safe <= 0) {
        const { error } = await supabase.from("fleet_ships").delete().eq("id", rowId);
        if (!error) setShips((prev) => prev.filter((s) => s.id !== rowId));
        else toast({ title: "Save failed", description: error.message, variant: "destructive" });
      } else {
        const { error } = await supabase.from("fleet_ships").update({ quantity: safe }).eq("id", rowId);
        if (error) toast({ title: "Save failed", description: error.message, variant: "destructive" });
      }
      setSavingField(null);
    }, 600);
    debounceRefs.current.set(rowId, t);
  };

  const handleRemoveShip = async (rowId: string) => {
    setSavingField(`del-${rowId}`);
    const { error } = await supabase.from("fleet_ships").delete().eq("id", rowId);
    setSavingField(null);
    if (error) {
      toast({ title: "Delete failed", description: error.message, variant: "destructive" });
      return;
    }
    setShips((prev) => prev.filter((s) => s.id !== rowId));
  };

  const totalShips = ships.reduce((s, r) => s + r.quantity, 0);
  const totalPoints = ships.reduce((s, r) => s + r.quantity * r.point_cost, 0);

  return (
    <>
      <ImperialCard title={fleet.fleet_name} subtitle={`Owner: ${ownerLabel}`}>
        <div className="space-y-2">
          <div className="flex justify-between items-center text-xs">
            <span className="text-muted-foreground">Status</span>
            <StatusBadge variant="info">Deployed</StatusBadge>
          </div>
          <div className="flex justify-between items-center text-xs">
            <span className="text-muted-foreground">Ships</span>
            <span className="font-semibold text-foreground">{totalShips}</span>
          </div>
          <div className="flex justify-between items-center text-xs">
            <span className="text-muted-foreground">Points</span>
            <span className="font-semibold text-foreground">{totalPoints}</span>
          </div>
        </div>
      </ImperialCard>

      <ImperialCard title="Readiness & Strategy">
        {loading ? (
          <p className="text-[10px] text-muted-foreground italic">Loading…</p>
        ) : !data ? (
          <p className="text-[10px] text-muted-foreground italic">Source fleet not found.</p>
        ) : (
          <div className="space-y-2.5">
            <div className="space-y-1">
              <label className="text-[10px] text-muted-foreground uppercase tracking-wider">
                Readiness Level {savingField === "readiness" && <span className="text-bronze">· saving…</span>}
              </label>
              <select
                value={data.readiness}
                onChange={(e) => handleReadinessChange(Number(e.target.value))}
                className="w-full rounded border border-border bg-background px-2 py-1.5 text-xs text-foreground"
              >
                {READINESS_LEVELS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] text-muted-foreground uppercase tracking-wider">
                Strategy 1 {savingField === "strategy1" && <span className="text-bronze">· saving…</span>}
              </label>
              <select
                value={data.special1_role}
                onChange={(e) => handleStrategyChange(1, e.target.value)}
                className="w-full rounded border border-border bg-background px-2 py-1.5 text-xs text-foreground"
              >
                {STRATEGY_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] text-muted-foreground uppercase tracking-wider">
                Strategy 2 {savingField === "strategy2" && <span className="text-bronze">· saving…</span>}
              </label>
              <select
                value={data.special2_role}
                onChange={(e) => handleStrategyChange(2, e.target.value)}
                className="w-full rounded border border-border bg-background px-2 py-1.5 text-xs text-foreground"
              >
                {STRATEGY_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
      </ImperialCard>

      <ImperialCard title="Fleet Composition">
        {loading ? (
          <p className="text-[10px] text-muted-foreground italic">Loading…</p>
        ) : ships.length === 0 ? (
          <p className="text-[10px] text-muted-foreground italic">No ships in this fleet.</p>
        ) : (
          <div className="space-y-1">
            {ships.map((s) => (
              <div
                key={s.id}
                className="flex items-center gap-1.5 text-xs py-1 border-b border-border last:border-0 group"
              >
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-foreground truncate">{s.ship_name}</div>
                  <div className="text-[10px] text-muted-foreground">
                    {s.hull_class} · {s.point_cost}pts
                  </div>
                </div>
                <input
                  type="number"
                  min={0}
                  value={s.quantity}
                  onChange={(e) => handleQuantityChange(s.id, Number(e.target.value))}
                  className="w-14 h-6 rounded border border-border bg-background px-1.5 text-xs text-foreground text-right"
                />
                <button
                  onClick={() => handleRemoveShip(s.id)}
                  className="p-1 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Remove ship type"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </ImperialCard>
    </>
  );
}
