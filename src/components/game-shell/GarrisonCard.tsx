/**
 * GarrisonCard — shows the planet's permanent, immobile fleet of stationed
 * ships. Every system has exactly one garrison (auto-created via
 * `ensure_game_garrisons` RPC). The garrison cannot move, attack, or change
 * readiness — it is purely a container for ships parked at the planet.
 *
 * All ships in a garrison live in the "Core" tactical group.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ImperialCard } from "./ImperialCard";

interface GarrisonShipRow {
  id: string;
  ship_type_id: string;
  quantity: number;
  current_hp: number | null;
  crippled: boolean;
  ship_name: string;
  ship_display_id: string;
  hull_class: string;
  max_hp: number | null;
}

interface Props {
  gameId: string;
  systemId: number;
}

export default function GarrisonCard({ gameId, systemId }: Props) {
  const [loading, setLoading] = useState(true);
  const [ships, setShips] = useState<GarrisonShipRow[]>([]);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data: gf } = await (supabase as any)
        .from("game_fleets")
        .select("id")
        .eq("game_id", gameId)
        .eq("system_id", systemId)
        .eq("is_garrison", true)
        .maybeSingle();
      if (cancelled) return;
      if (!gf?.id) {
        setMissing(true);
        setShips([]);
        setLoading(false);
        return;
      }
      const { data: rows } = await (supabase as any)
        .from("game_fleet_ships")
        .select("id, ship_type_id, quantity, current_hp, crippled, ship_types(name, ship_id, hull, hull_class)")
        .eq("game_fleet_id", gf.id);
      if (cancelled) return;
      setMissing(false);
      setShips(
        (rows || []).map((r: any) => ({
          id: r.id,
          ship_type_id: r.ship_type_id,
          quantity: r.quantity,
          current_hp: r.current_hp ?? null,
          crippled: !!r.crippled,
          ship_name: r.ship_types?.name || r.ship_type_id,
          ship_display_id: r.ship_types?.ship_id || "",
          hull_class: r.ship_types?.hull_class || "",
          max_hp: r.ship_types?.hull ?? null,
        })),
      );
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [gameId, systemId]);

  return (
    <ImperialCard title="Garrison" subtitle="Stationed at planet — Core group, immobile">
      {loading ? (
        <p className="text-[10px] text-muted-foreground italic">Loading garrison…</p>
      ) : missing ? (
        <p className="text-[10px] text-muted-foreground italic">Garrison not yet initialized.</p>
      ) : ships.length === 0 ? (
        <p className="text-[10px] text-muted-foreground italic">No ships stationed.</p>
      ) : (
        <div className="space-y-1">
          {ships.map((s) => {
            const hp = s.current_hp != null && s.max_hp != null
              ? `${s.current_hp}/${s.max_hp}`
              : s.max_hp != null
                ? `${s.max_hp}`
                : "—";
            return (
              <div
                key={s.id}
                className="flex items-center justify-between text-xs py-1 border-b border-border last:border-0 gap-2"
              >
                <span className="text-slate-600 truncate">
                  {s.ship_display_id ? <span className="text-bronze font-semibold mr-1">{s.ship_display_id}</span> : null}
                  {s.ship_name}
                  {s.hull_class ? <span className="ml-1 text-[9px] uppercase text-muted-foreground">{s.hull_class}</span> : null}
                  {s.crippled ? <span className="ml-1 text-[9px] uppercase text-crimson">crippled</span> : null}
                </span>
                <span className="font-semibold text-bronze whitespace-nowrap">
                  ×{s.quantity} <span className="text-[9px] text-muted-foreground">HP {hp}</span>
                </span>
              </div>
            );
          })}
        </div>
      )}
    </ImperialCard>
  );
}
