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

    // 4. Apply queued replenish_supply orders.
    //    Max_Supplies = sum(ship.supply_pod * quantity) * supply_capacity_coefficient.
    //    Add the requested amount, capped at (Max - Current); never exceed Max.
    const replenishOrders = ctx.orders.filter(
      o => o.order_type === "other" && o.order_json?.kind === "replenish_supply",
    );
    if (replenishOrders.length > 0) {
      const { data: coeffRow } = await (supabase as any)
        .from("combat_constants").select("value").eq("key", "supply_capacity_coefficient").maybeSingle();
      const supplyCoefficient = Number(coeffRow?.value) || 10;

      const { data: allShipTypes } = await (supabase as any)
        .from("ship_types").select("id, supply_pod");
      const supplyPodMap = new Map<string, number>();
      for (const st of (allShipTypes || [])) supplyPodMap.set(st.id, Number(st.supply_pod) || 0);

      let supplyApplied = 0;
      for (const order of replenishOrders) {
        const gameFleetId = order.order_json?.fleet_id;
        const requested = Math.max(0, Math.floor(Number(order.order_json?.amount) || 0));
        if (!gameFleetId || requested <= 0) continue;

        // Resolve game_fleet -> source fleet (which holds current_supply)
        const { data: gf } = await (supabase as any)
          .from("game_fleets").select("id, fleet_id, fleet_name").eq("id", gameFleetId).maybeSingle();
        if (!gf?.fleet_id) continue;

        const { data: fl } = await (supabase as any)
          .from("fleets").select("id, current_supply").eq("id", gf.fleet_id).maybeSingle();
        if (!fl) continue;

        // Compute Max_Supplies from this game fleet's roster
        const { data: gfShips } = await (supabase as any)
          .from("game_fleet_ships").select("ship_type_id, quantity").eq("game_fleet_id", gameFleetId);
        const totalSupplyPods = (gfShips || []).reduce(
          (sum: number, r: any) => sum + (supplyPodMap.get(r.ship_type_id) || 0) * (Number(r.quantity) || 0),
          0,
        );
        const maxSupplies = totalSupplyPods * supplyCoefficient;
        const current = Math.min(Number(fl.current_supply) || 0, maxSupplies);
        const delta = Math.max(0, maxSupplies - current);
        const granted = Math.min(requested, delta);
        const next = current + granted;

        await (supabase as any).from("fleets").update({ current_supply: next }).eq("id", fl.id);
        supplyApplied++;

        ctx.logs.push({
          game_id: gameId,
          turn_number: currentTurn,
          phase: "economy",
          log_type: "supply_replenished",
          message: `${gf.fleet_name || "Fleet"}: supply ${current} → ${next} / ${maxSupplies} (requested ${requested})`,
          details_json: {
            fleet_id: fl.id, game_fleet_id: gameFleetId,
            current, granted, next, max: maxSupplies, requested,
          },
        });
      }

      if (supplyApplied > 0) {
        ctx.logs.push({
          game_id: gameId,
          turn_number: currentTurn,
          phase: "economy",
          log_type: "supply_summary",
          message: `Applied ${supplyApplied} supply replenishment order(s).`,
        });
      }
    }

    // 5. Apply queued build_strikecraft orders.
    //    Co-mingled with repair orders in the Repair & Replenish UI. Each unit
    //    costs `point_cost` in fleet supply. Capacity is re-checked at process
    //    time and any units that no longer fit are dropped (logged).
    const buildOrders = ctx.orders.filter(
      o => o.order_type === "other" && o.order_json?.kind === "build_strikecraft",
    );
    if (buildOrders.length > 0) {
      // Cache: ship_type lookups (for cost / hull / class / capacity contributions).
      const { data: stData } = await (supabase as any)
        .from("ship_types")
        .select("id, name, ship_id, class, hull, point_cost, fighter_bay, gun_ship_link");
      const stMap = new Map<string, any>();
      for (const r of (stData || [])) stMap.set(r.id, r);

      let buildsApplied = 0;
      for (const order of buildOrders) {
        const gameFleetId = order.order_json?.fleet_id;
        const items = (order.order_json?.items as Array<{ ship_type_id: string; quantity: number }>) || [];
        if (!gameFleetId || items.length === 0) continue;

        const { data: gf } = await (supabase as any)
          .from("game_fleets").select("id, fleet_id, fleet_name").eq("id", gameFleetId).maybeSingle();
        if (!gf?.fleet_id) continue;

        const { data: fl } = await (supabase as any)
          .from("fleets").select("id, current_supply").eq("id", gf.fleet_id).maybeSingle();
        if (!fl) continue;

        // Compute current capacity & usage from the live game roster.
        const { data: gfShips } = await (supabase as any)
          .from("game_fleet_ships").select("ship_type_id, quantity").eq("game_fleet_id", gameFleetId);
        let fighterCap = 0, fighterUsed = 0, gunshipCap = 0, gunshipUsed = 0;
        for (const r of (gfShips || [])) {
          const st = stMap.get(r.ship_type_id);
          if (!st) continue;
          const qty = Number(r.quantity) || 0;
          fighterCap += (Number(st.fighter_bay) || 0) * qty;
          gunshipCap += (Number(st.gun_ship_link) || 0) * qty;
          if (st.class === "FL") fighterUsed += 1 * qty;
          else if (st.class === "FH") fighterUsed += 2 * qty;
          else if (st.class === "GS") gunshipUsed += 1 * qty;
        }

        let supplyAvail = Number(fl.current_supply) || 0;
        const built: Array<{ ship_type_id: string; class: string; granted: number; cost: number }> = [];
        const dropped: Array<{ ship_type_id: string; class: string; reason: string; requested: number }> = [];

        for (const item of items) {
          const st = stMap.get(item.ship_type_id);
          const requested = Math.max(0, Math.floor(Number(item.quantity) || 0));
          if (!st || requested <= 0) continue;
          const cls = String(st.class);
          if (cls !== "FL" && cls !== "FH" && cls !== "GS") {
            dropped.push({ ship_type_id: item.ship_type_id, class: cls, reason: "not a strikecraft class", requested });
            continue;
          }
          const slotsPer = cls === "FH" ? 2 : 1;
          const bucket: "fighter" | "gunship" = cls === "GS" ? "gunship" : "fighter";
          const free = bucket === "fighter"
            ? Math.max(0, fighterCap - fighterUsed)
            : Math.max(0, gunshipCap - gunshipUsed);
          const fitByCapacity = Math.floor(free / slotsPer);
          const cost = Number(st.point_cost) || 0;
          const fitBySupply = cost > 0 ? Math.floor(supplyAvail / cost) : requested;
          const granted = Math.max(0, Math.min(requested, fitByCapacity, fitBySupply));
          if (granted < requested) {
            dropped.push({
              ship_type_id: item.ship_type_id,
              class: cls,
              reason: granted === 0
                ? (fitByCapacity === 0 ? "no capacity" : "no supply")
                : "partial (capacity or supply limited)",
              requested: requested - granted,
            });
          }
          if (granted <= 0) continue;

          // Insert one row per ship at full HP (matches snapshot trigger pattern).
          const inserts = Array.from({ length: granted }).map(() => ({
            game_fleet_id: gameFleetId,
            ship_type_id: item.ship_type_id,
            quantity: 1,
            tactical_group: "Core",
            current_hp: Number(st.hull) || null,
            crippled: false,
          }));
          await (supabase as any).from("game_fleet_ships").insert(inserts);

          // Deduct supply & consume capacity slots immediately so subsequent
          // items in the same order respect the running totals.
          const totalCost = cost * granted;
          supplyAvail -= totalCost;
          if (bucket === "fighter") fighterUsed += slotsPer * granted;
          else gunshipUsed += slotsPer * granted;

          built.push({ ship_type_id: item.ship_type_id, class: cls, granted, cost: totalCost });
        }

        // Persist new supply balance.
        await (supabase as any).from("fleets").update({ current_supply: Math.max(0, supplyAvail) }).eq("id", fl.id);
        buildsApplied++;

        ctx.logs.push({
          game_id: gameId,
          turn_number: currentTurn,
          phase: "economy",
          log_type: "strikecraft_built",
          message: `${gf.fleet_name || "Fleet"}: built ${built.reduce((s, b) => s + b.granted, 0)} strikecraft (${built.length} class(es))`,
          details_json: {
            fleet_id: fl.id,
            game_fleet_id: gameFleetId,
            built,
            dropped,
            supply_remaining: Math.max(0, supplyAvail),
          },
        });
      }

      if (buildsApplied > 0) {
        ctx.logs.push({
          game_id: gameId,
          turn_number: currentTurn,
          phase: "economy",
          log_type: "strikecraft_summary",
          message: `Applied ${buildsApplied} strikecraft build order(s).`,
        });
      }
    }
  },
};
