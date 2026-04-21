/**
 * Economy Phase
 *
 * Steps:
 *  1. Run per-system processNextTurn (advances production, recalculates condition,
 *     morale, population, tribute, and upkeep).
 *  2. Add fleet maintenance to each owner's upkeep.
 *  3. Apply queued readiness orders (set_readiness order_type) — replaces the
 *     legacy `fleets.next_readiness` column write path. Readiness is bounded:
 *     can drop by any amount, can rise by at most 1 per turn.
 *  4. Persist per-player tribute/maintenance deltas via context accumulator.
 */
import { processNextTurn, DEFAULT_TURN_CONSTANTS } from "@/lib/turnEngine";
import type { Phase, TurnContext } from "../types";

const PROVINCE_NAMES: Record<number, string> = {
  1: "Valerian", 2: "Aurelian", 3: "Cassian",
  4: "Dravian", 5: "Marcellan", 6: "Octavian",
};

function ownerToSlot(owner: string | undefined | null): number | undefined {
  if (!owner) return undefined;
  const m = owner.match(/PROVINCE_(\d+)/);
  if (m) return parseInt(m[1], 10);
  const lc = owner.toLowerCase();
  for (const [slot, name] of Object.entries(PROVINCE_NAMES)) {
    if (name.toLowerCase() === lc) return parseInt(slot, 10);
  }
  return undefined;
}

export const economyPhase: Phase = {
  name: "economy",
  label: "Economy",
  async run(ctx: TurnContext) {
    const { supabase, mapState, facilityTypes, shipTypes, gameId, currentTurn } = ctx;

    // 1. Per-system economics
    const systems = Array.from(mapState.systems.values());
    const eligible = systems.filter(
      s => s.current_population > 0 && s.owner && s.owner.toLowerCase() !== "unowned"
    );

    for (const sys of eligible) {
      const result = processNextTurn(sys, facilityTypes, DEFAULT_TURN_CONSTANTS, 0, shipTypes);
      mapState.systems.set(sys.system_id, result.planet);

      const slot = ownerToSlot(sys.owner);
      if (slot !== undefined) {
        const econ = ctx.playerEcon.get(slot) || { tribute: 0, maintenance: 0 };
        econ.tribute += result.tributeBreakdown.totalTribute;
        econ.maintenance += result.upkeepBreakdown.totalUpkeep;
        ctx.playerEcon.set(slot, econ);
      }

      ctx.logs.push({
        game_id: gameId,
        turn_number: currentTurn,
        phase: "economy",
        log_type: "system_processed",
        message: `${sys.system_name}: tribute ${result.tributeBreakdown.totalTribute}, upkeep ${result.upkeepBreakdown.totalUpkeep}`,
        details_json: {
          system_id: sys.system_id,
          tribute: result.tributeBreakdown,
          upkeep: result.upkeepBreakdown,
          completed: result.completedFacilities,
        },
      });
    }

    // 2. Fleet maintenance from game_fleets — read ship counts from per-game
    //    roster (`game_fleet_ships`) so combat losses reduce upkeep.
    const { data: gameFleets } = await (supabase as any)
      .from("game_fleets")
      .select("id, fleet_id, owner_classification")
      .eq("game_id", gameId);

    if (gameFleets && gameFleets.length > 0) {
      const gameFleetIds = gameFleets.map((gf: any) => gf.id);
      const [{ data: fleetShips }, { data: allShipTypes }] = await Promise.all([
        (supabase as any).from("game_fleet_ships").select("game_fleet_id, ship_type_id, quantity").in("game_fleet_id", gameFleetIds),
        (supabase as any).from("ship_types").select("id, maintenance"),
      ]);
      const shipMaintMap = new Map<string, number>();
      for (const st of (allShipTypes || [])) shipMaintMap.set(st.id, Number(st.maintenance));

      for (const gf of gameFleets) {
        const slot = ownerToSlot(gf.owner_classification);
        if (slot === undefined) continue;
        const ships = (fleetShips || []).filter((fs: any) => fs.game_fleet_id === gf.id);
        const fleetMaint = ships.reduce(
          (sum: number, fs: any) => sum + (shipMaintMap.get(fs.ship_type_id) || 0) * fs.quantity,
          0
        );
        if (fleetMaint > 0) {
          const econ = ctx.playerEcon.get(slot) || { tribute: 0, maintenance: 0 };
          econ.maintenance += fleetMaint;
          ctx.playerEcon.set(slot, econ);
        }
      }
    }

    // 3. Apply queued readiness orders (from player_orders, type=set_readiness)
    //    Falls back to legacy fleets.next_readiness column for migration safety.
    const readinessOrders = ctx.orders.filter(o => o.order_type === "set_readiness");
    let readinessApplied = 0;

    for (const order of readinessOrders) {
      const fleetId = order.order_json?.fleet_id;
      const target = Number(order.order_json?.next_readiness);
      if (!fleetId || !Number.isFinite(target)) continue;

      const { data: fl } = await (supabase as any)
        .from("fleets").select("id, readiness").eq("id", fleetId).maybeSingle();
      if (!fl) continue;

      // Enforce: lower freely, raise by at most 1 step (lower number = higher readiness)
      const minAllowed = Math.max(1, fl.readiness - 1);
      const clamped = Math.max(minAllowed, Math.min(4, target));

      await (supabase as any).from("fleets").update({ readiness: clamped, next_readiness: null }).eq("id", fleetId);
      readinessApplied++;

      ctx.logs.push({
        game_id: gameId,
        turn_number: currentTurn,
        phase: "economy",
        log_type: "readiness_changed",
        message: `Fleet ${fleetId.slice(0, 8)}: readiness ${fl.readiness} → ${clamped}`,
        details_json: { fleet_id: fleetId, from: fl.readiness, to: clamped, requested: target },
      });
    }

    // Legacy: any fleet still using next_readiness column
    const { data: legacy } = await (supabase as any)
      .from("fleets").select("id, readiness, next_readiness").not("next_readiness", "is", null);
    for (const fl of (legacy || [])) {
      await (supabase as any).from("fleets")
        .update({ readiness: fl.next_readiness, next_readiness: null }).eq("id", fl.id);
      readinessApplied++;
    }

    if (readinessApplied > 0) {
      ctx.logs.push({
        game_id: gameId,
        turn_number: currentTurn,
        phase: "economy",
        log_type: "readiness_summary",
        message: `Applied ${readinessApplied} readiness order(s).`,
      });
    }
  },
};
