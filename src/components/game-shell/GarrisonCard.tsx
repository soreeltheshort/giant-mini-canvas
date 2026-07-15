/**
 * GarrisonCard — unified planet-defense panel.
 *
 * Shows three things about a system:
 *   1. Ground Defenses — infantry / militia (`current_ground_defenses` vs
 *      `max_ground_defenses`). Owner can Recruit +1 (cost =
 *      `ground_force_replacement_cost`, requires current<max and treasury)
 *      or Disband -1 (no refund). Admin test mode gets raw current/max
 *      inputs to override arbitrarily.
 *   2. Stationed Ships (Garrison Fleet) — the `is_garrison=true` game_fleet
 *      parked at the planet. If missing, we self-heal by calling
 *      `ensure_game_garrisons` (idempotent RPC).
 *   3. Invaders in Orbit — enemy fleets sharing this system's hex. Purely
 *      informational; combat is resolved by the ground_combat phase.
 *
 * Per-turn upkeep on ground defenses is `ground_defense_maintenance` credits
 * per current unit (default 1) — mirrors facility maintenance and is applied
 * in `turnEngine.processNextTurn`.
 */
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ImperialCard } from "./ImperialCard";
import { DEFAULT_TURN_CONSTANTS } from "@/lib/turnEngine";
import type { SystemData, MapFleet } from "@/lib/mapTypes";
import type { DbFacilityType } from "@/hooks/useFacilityTypes";

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
  /** Live system from mapState — required for garrison/upkeep display. */
  system?: SystemData;
  /** All fleets from mapState — used to enumerate invaders in orbit. */
  fleets?: MapFleet[];
  /** Owner classification of the viewing player. Controls recruit/disband. */
  viewerOwner?: string;
  /** Viewing player's current treasury (for recruit affordability). */
  viewerTreasury?: number;
  /** True when the admin has toggled Test Mode. Unlocks raw editors. */
  testMode?: boolean;
  onRecruitGarrison?: (systemId: number) => void;
  onDisbandGarrison?: (systemId: number) => void;
  /** TEST MODE: set current/max ground defenses on this system. */
  onTestSetGarrison?: (systemId: number, current: number, max: number) => void;
  /** Facility catalog — used to compute the live max = floor(pop/20) + Σ bonuses. */
  facilityTypes?: DbFacilityType[];
}

export default function GarrisonCard({
  gameId,
  systemId,
  system,
  fleets,
  viewerOwner,
  viewerTreasury,
  testMode,
  onRecruitGarrison,
  onDisbandGarrison,
  onTestSetGarrison,
  facilityTypes,
}: Props) {
  const [loading, setLoading] = useState(true);
  const [ships, setShips] = useState<GarrisonShipRow[]>([]);
  const [ensured, setEnsured] = useState(false);

  const cur = Number(system?.current_ground_defenses ?? 0);
  const pop = Number(system?.current_population ?? 0);
  const popBase = Math.floor(Math.max(0, pop) / 20);
  const facilityBonus = useMemo(() => {
    if (!system || !facilityTypes) return 0;
    let sum = 0;
    for (const f of system.facilities || []) {
      const ft = facilityTypes.find((t) => String(t.id) === String(f.facility_type_id));
      if (ft?.ground_defense_bonus) sum += ft.ground_defense_bonus * f.quantity;
    }
    return sum;
  }, [system, facilityTypes]);
  const max = facilityTypes
    ? popBase + facilityBonus
    : Number(system?.max_ground_defenses ?? 0);
  const owner = String(system?.owner ?? "");
  const isOwner = !!viewerOwner && viewerOwner === owner;
  const canRecruit = isOwner && cur < max && (viewerTreasury ?? 0) >= DEFAULT_TURN_CONSTANTS.ground_force_replacement_cost;
  const canDisband = isOwner && cur > 0;
  const upkeepPerTurn = cur * DEFAULT_TURN_CONSTANTS.ground_defense_maintenance;

  const [curInput, setCurInput] = useState<string>(String(cur));
  const [maxInput, setMaxInput] = useState<string>(String(max));
  useEffect(() => { setCurInput(String(cur)); setMaxInput(String(max)); }, [systemId, cur, max]);

  // Real invader enumeration below.

  const invadersReal: MapFleet[] = useMemo(() => {
    if (!system || !fleets) return [];
    // Find this system's hex via any garrison fleet at the same system_id if present,
    // otherwise fall back to matching by system_id on garrison rows in `fleets`.
    const garrison = fleets.find((f) => f.system_id === system.system_id && f.is_garrison);
    if (!garrison) return [];
    return fleets.filter(
      (f) =>
        !f.is_garrison &&
        f.hex_x === garrison.hex_x &&
        f.hex_y === garrison.hex_y &&
        f.owner_classification !== owner,
    );
  }, [system, fleets, owner]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const loadShips = async () => {
        const { data: gf } = await (supabase as any)
          .from("game_fleets")
          .select("id")
          .eq("game_id", gameId)
          .eq("system_id", systemId)
          .eq("is_garrison", true)
          .maybeSingle();
        if (!gf?.id) return null;
        const { data: rows } = await (supabase as any)
          .from("game_fleet_ships")
          .select("id, ship_type_id, quantity, current_hp, crippled, ship_types(name, ship_id, hull, hull_class)")
          .eq("game_fleet_id", gf.id);
        return (rows || []).map((r: any) => ({
          id: r.id,
          ship_type_id: r.ship_type_id,
          quantity: r.quantity,
          current_hp: r.current_hp ?? null,
          crippled: !!r.crippled,
          ship_name: r.ship_types?.name || r.ship_type_id,
          ship_display_id: r.ship_types?.ship_id || "",
          hull_class: r.ship_types?.hull_class || "",
          max_hp: r.ship_types?.hull ?? null,
        })) as GarrisonShipRow[];
      };

      let list = await loadShips();
      if (cancelled) return;
      if (list === null && !ensured) {
        // Self-heal: no garrison fleet row yet. Call the idempotent RPC.
        try {
          await (supabase as any).rpc("ensure_game_garrisons", { _game_id: gameId });
        } catch { /* ignore — surfaced below as empty state */ }
        setEnsured(true);
        list = await loadShips();
        if (cancelled) return;
      }
      setShips(list || []);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [gameId, systemId, ensured]);

  return (
    <ImperialCard title="Garrison" subtitle="Ground defenses, stationed ships, and orbiting threats">
      {/* --- Ground defenses --- */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Ground Defenses</span>
          <span
            className="font-semibold text-bronze"
            title={`Current garrison / maximum capacity. Max ${max} = floor(population ${pop} / 20) = ${popBase}${facilityBonus ? ` + facility bonuses ${facilityBonus}` : ""}.`}
          >
            {cur} / {max}
          </span>
        </div>
        <div className="h-1.5 rounded-sm bg-muted overflow-hidden">
          <div
            className="h-full bg-crimson"
            style={{ width: `${max > 0 ? Math.min(100, (cur / max) * 100) : 0}%` }}
          />
        </div>
        <div className="flex items-center justify-between text-[10px] text-muted-foreground">
          <span>Upkeep</span>
          <span>{upkeepPerTurn} ₡ / turn</span>
        </div>

        {(onRecruitGarrison || onDisbandGarrison) ? (
          <div className="flex gap-1.5 pt-0.5">
            {onRecruitGarrison ? (
              <button
                disabled={!canRecruit}
                onClick={() => onRecruitGarrison(systemId)}
                title={
                  !isOwner
                    ? "You do not control this system"
                    : cur >= max
                      ? "At maximum — build facilities that grant ground defense capacity"
                      : (viewerTreasury ?? 0) < DEFAULT_TURN_CONSTANTS.ground_force_replacement_cost
                        ? "Insufficient treasury"
                        : `Draft +1 (${DEFAULT_TURN_CONSTANTS.ground_force_replacement_cost} ₡)`
                }
                className={`flex-1 h-6 rounded-sm text-[9px] font-heading uppercase tracking-wider ${
                  canRecruit
                    ? "bg-crimson text-primary-foreground hover:bg-crimson-light"
                    : "bg-crimson/40 text-primary-foreground/70 cursor-not-allowed"
                }`}
              >
                Draft Garrison · {DEFAULT_TURN_CONSTANTS.ground_force_replacement_cost}₡
              </button>
            ) : null}
            {onDisbandGarrison ? (
              <button
                disabled={!canDisband}
                onClick={() => onDisbandGarrison(systemId)}
                title={!isOwner ? "You do not control this system" : cur <= 0 ? "No garrison to disband" : "Disband −1"}
                className={`flex-1 h-6 rounded-sm text-[9px] font-heading uppercase tracking-wider ${
                  canDisband
                    ? "bg-muted text-foreground hover:bg-destructive hover:text-destructive-foreground"
                    : "bg-muted text-muted-foreground cursor-not-allowed"
                }`}
              >
                Disband −1
              </button>
            ) : null}
          </div>
        ) : null}

        {testMode && onTestSetGarrison ? (
          <div className="pt-1.5 mt-1.5 border-t border-border space-y-1">
            <div className="text-[9px] font-heading uppercase tracking-wider text-muted-foreground">
              Test Mode Override
            </div>
            <div className="flex items-center gap-1.5">
              <label className="text-[10px] text-slate-500 w-10">Cur</label>
              <input
                type="number" min={0} value={curInput}
                onChange={(e) => setCurInput(e.target.value)}
                className="flex-1 h-6 px-1.5 rounded-sm border border-border bg-background text-xs"
              />
              <label className="text-[10px] text-slate-500 w-8 text-right">Max</label>
              <input
                type="number" min={0} value={maxInput}
                onChange={(e) => setMaxInput(e.target.value)}
                className="flex-1 h-6 px-1.5 rounded-sm border border-border bg-background text-xs"
              />
              <button
                onClick={() =>
                  onTestSetGarrison(
                    systemId,
                    parseInt(curInput || "0", 10) || 0,
                    parseInt(maxInput || "0", 10) || 0,
                  )
                }
                className="h-6 px-2 rounded-sm text-[9px] font-heading uppercase tracking-wider bg-crimson text-primary-foreground hover:bg-crimson-light"
              >
                Save
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {/* --- Stationed ships --- */}
      <div className="mt-3 pt-2 border-t border-border">
        <div className="text-[10px] font-heading uppercase tracking-wider text-muted-foreground mb-1">
          Stationed Ships
        </div>
        {loading ? (
          <p className="text-[10px] text-muted-foreground italic">Loading…</p>
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
      </div>

    </ImperialCard>
  );
}
