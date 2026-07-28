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
import { ownerToEconKey, rowEconKey } from "../ownerKey";
import { ownerMatchesFaction } from "@/lib/factionUtils";
import { computeSupplyGrid } from "@/lib/supplyGrid";
import { hexKey } from "@/lib/mapTypes";

export const economyPhase: Phase = {
  name: "economy",
  label: "Economy",
  async run(ctx: TurnContext) {
    const { supabase, mapState, facilityTypes, shipTypes, gameId, currentTurn } = ctx;

    // Per-faction supply-grid cache. Computed lazily on first use per owner
    // classification and reused across orders. See src/lib/supplyGrid.ts.
    const supplyGridByOwner = new Map<string, Set<string>>();
    const getSupplyGrid = (ownerClass: string | undefined | null): Set<string> => {
      const key = String(ownerClass || "");
      if (!key) return new Set<string>();
      const cached = supplyGridByOwner.get(key);
      if (cached) return cached;
      const grid = computeSupplyGrid(key, mapState.systems, mapState.hexes, facilityTypes as any);
      supplyGridByOwner.set(key, grid);
      return grid;
    };
    const ownerForPlayer = (playerId: string): string | undefined => {
      const p = ctx.players.find(pp => pp.id === playerId);
      if (!p) return undefined;
      const f = ctx.factions.find(ff => ff.id === (p as any).faction_id);
      return (f?.name || (f as any)?.code_name) as string | undefined;
    };


    // 0. Apply queued cancel_build orders (no refund) — strip the matching
    //    facility from facilities_in_production BEFORE production advances.
    const cancelBuildOrders = ctx.orders.filter(o => o.order_type === "other" && o.order_json?.kind === "cancel_build");
    for (const order of cancelBuildOrders) {
      const sysId = Number(order.order_json?.system_id);
      const ftId = order.order_json?.facility_type_id;
      if (!Number.isFinite(sysId) || !ftId) continue;
      const sys = mapState.systems.get(sysId);
      if (!sys) continue;
      const list = [...(sys.facilities_in_production || [])];
      const idx = list.findIndex(f => String(f.facility_type_id) === String(ftId));
      if (idx >= 0) {
        const removed = list.splice(idx, 1)[0];
        mapState.systems.set(sysId, { ...sys, facilities_in_production: list });
        ctx.logs.push({
          game_id: gameId, turn_number: currentTurn, phase: "economy",
          log_type: "facility_build_cancelled",
          message: `${sys.system_name}: cancelled in-production facility (no refund)`,
          details_json: { system_id: sysId, facility_type_id: ftId, turns_remaining_at_cancel: removed.turns_remaining },
        });
      }
    }

    // 0b. Apply queued build_facility orders — append to facilities_in_production
    //     with the facility type's full turns_to_build. Upfront ₡ cost is added
    //     to the owning player's maintenance accumulator (charged this turn).
    const buildFacilityOrders = ctx.orders.filter(o => o.order_type === "build_facility");
    for (const order of buildFacilityOrders) {
      const sysId = Number(order.order_json?.system_id);
      const ftId = order.order_json?.facility_type_id;
      if (!Number.isFinite(sysId) || !ftId) continue;
      const sys = mapState.systems.get(sysId);
      if (!sys) continue;
      const ft = facilityTypes.find(t => String(t.id) === String(ftId));
      if (!ft) continue;

      // Supply-grid gating: reject when the target hex is not in the ordering
      // player's supply grid AND the facility requires supply. Admin pioneer
      // facilities can bypass by setting requires_supply=false.
      const requiresSupply = (ft as any).requires_supply !== false;
      if (requiresSupply) {
        const ownerClass = ownerForPlayer(order.player_id);
        const grid = getSupplyGrid(ownerClass);
        const hex = Array.from(mapState.hexes.values()).find(h => h.hex_id === sys.hex_id);
        const inGrid = hex ? grid.has(hexKey(hex.x, hex.y)) : false;
        if (!inGrid) {
          ctx.logs.push({
            game_id: gameId, turn_number: currentTurn, phase: "economy",
            log_type: "facility_build_rejected",
            message: `${sys.system_name}: ${ft.name} rejected — target hex out of supply`,
            details_json: { system_id: sysId, facility_type_id: ftId, reason: "out_of_supply" },
          });
          continue;
        }
      }

      const turns = Math.max(1, Number(ft.turns_to_build) || 1);
      const list = [...(sys.facilities_in_production || []), {
        facility_type_id: ftId,
        turns_remaining: turns,
      }];
      mapState.systems.set(sysId, { ...sys, facilities_in_production: list });

      const key = ownerToEconKey(sys.owner, ctx.factions);
      const upfront = Math.max(0, Number(ft.cost) || 0);
      if (key && upfront > 0) {
        const econ = ctx.playerEcon.get(key) || { tribute: 0, maintenance: 0 };
        econ.maintenance += upfront;
        ctx.playerEcon.set(key, econ);
      }
      ctx.logs.push({
        game_id: gameId, turn_number: currentTurn, phase: "economy",
        log_type: "facility_build_started",
        message: `${sys.system_name}: started building ${ft.name} (${turns}T, ₡${upfront})`,
        details_json: { system_id: sysId, facility_type_id: ftId, turns_to_build: turns, cost: upfront },
      });
    }

    // 0c. Apply queued recruit_garrison / disband_garrison orders.
    //     Each recruit: +1 current_ground_defenses (bounded by max), charged
    //     ground_force_replacement_cost to the owning player's maintenance
    //     accumulator. Each disband: -1 (no refund, floor at 0). Owner
    //     validation is re-checked here — orders for planets that flipped
    //     ownership since the click are dropped.
    const recruitOrders = ctx.orders.filter(
      o => o.order_type === "other" && (o.order_json as any)?.kind === "recruit_garrison",
    );
    const disbandOrders = ctx.orders.filter(
      o => o.order_type === "other" && (o.order_json as any)?.kind === "disband_garrison",
    );
    const recruitCost = DEFAULT_TURN_CONSTANTS.ground_force_replacement_cost;
    for (const order of recruitOrders) {
      const sysId = Number((order.order_json as any)?.system_id);
      if (!Number.isFinite(sysId)) continue;
      const sys = mapState.systems.get(sysId);
      if (!sys) continue;
      const orderingPlayer = ctx.players.find(p => p.id === order.player_id);
      const playerFaction = orderingPlayer
        ? ctx.factions.find(f => f.id === (orderingPlayer as any).faction_id)
        : undefined;
      const playerOwner = playerFaction?.name || (playerFaction as any)?.code_name;
      if (!ownerMatchesFaction(sys.owner, playerOwner)) {
        ctx.logs.push({
          game_id: gameId, turn_number: currentTurn, phase: "economy",
          log_type: "garrison_recruit_skipped",
          message: `${sys.system_name}: recruit order dropped — no longer owned by ${playerOwner || "player"}`,
          details_json: { system_id: sysId, sys_owner: sys.owner, requested_by: playerOwner },
        });
        continue;
      }
      const curVal = Number(sys.current_ground_defenses) || 0;
      const maxVal = Number(sys.max_ground_defenses) || 0;
      if (curVal >= maxVal) {
        ctx.logs.push({
          game_id: gameId, turn_number: currentTurn, phase: "economy",
          log_type: "garrison_recruit_skipped",
          message: `${sys.system_name}: recruit skipped — at capacity (${curVal}/${maxVal})`,
          details_json: { system_id: sysId, cur: curVal, max: maxVal },
        });
        continue;
      }
      mapState.systems.set(sysId, { ...sys, current_ground_defenses: curVal + 1 });
      const key = ownerToEconKey(sys.owner, ctx.factions);
      if (key) {
        const econ = ctx.playerEcon.get(key) || { tribute: 0, maintenance: 0 };
        econ.maintenance += recruitCost;
        ctx.playerEcon.set(key, econ);
      }
      ctx.logs.push({
        game_id: gameId, turn_number: currentTurn, phase: "economy",
        log_type: "garrison_recruited",
        message: `${sys.system_name}: drafted +1 ground defense (₡${recruitCost})`,
        details_json: { system_id: sysId, cost: recruitCost, cur_after: curVal + 1, max: maxVal },
      });
    }
    for (const order of disbandOrders) {
      const sysId = Number((order.order_json as any)?.system_id);
      if (!Number.isFinite(sysId)) continue;
      const sys = mapState.systems.get(sysId);
      if (!sys) continue;
      const orderingPlayer = ctx.players.find(p => p.id === order.player_id);
      const playerFaction = orderingPlayer
        ? ctx.factions.find(f => f.id === (orderingPlayer as any).faction_id)
        : undefined;
      const playerOwner = playerFaction?.name || (playerFaction as any)?.code_name;
      if (!ownerMatchesFaction(sys.owner, playerOwner)) continue;
      const curVal = Number(sys.current_ground_defenses) || 0;
      if (curVal <= 0) continue;
      mapState.systems.set(sysId, { ...sys, current_ground_defenses: curVal - 1 });
      ctx.logs.push({
        game_id: gameId, turn_number: currentTurn, phase: "economy",
        log_type: "garrison_disbanded",
        message: `${sys.system_name}: disbanded 1 ground defense (no refund)`,
        details_json: { system_id: sysId, cur_after: curVal - 1 },
      });
    }

    // 0d. Defensive normalization — any landed_forces bucket whose owner
    //     matches the system's owner is friendly reinforcement, not an
    //     invader; fold it into current_ground_defenses so the owner is
    //     never billed maintenance for enemy troops, and enemy troops are
    //     never shown as friendly garrison. Post-refactor Stage 1 already
    //     handles this on landing; this catches pre-refactor state.
    for (const sys of mapState.systems.values()) {
      const buckets = (sys as any).landed_forces as Array<{ owner_classification: string; quantity: number }> | undefined;
      if (!buckets || buckets.length === 0) continue;
      let friendlyFolded = 0;
      const kept: typeof buckets = [];
      for (const b of buckets) {
        if (ownerMatchesFaction(b.owner_classification, sys.owner) && (b.quantity || 0) > 0) {
          friendlyFolded += b.quantity;
        } else if ((b.quantity || 0) > 0) {
          kept.push(b);
        }
      }
      if (friendlyFolded > 0 || kept.length !== buckets.length) {
        mapState.systems.set(sys.system_id, {
          ...sys,
          current_ground_defenses: (Number(sys.current_ground_defenses) || 0) + friendlyFolded,
          landed_forces: kept,
        } as any);
      }
    }

    // 1. Per-system economics
    const systems = Array.from(mapState.systems.values());
    const eligible = systems.filter(
      s => s.current_population > 0 && s.owner && s.owner.toLowerCase() !== "unowned"
    );

    for (const sys of eligible) {
      // Synod-owned planets bypass normal economy processing and run through
      // a dedicated stub (no tribute, no upkeep, no production tick).
      if ((sys.owner || "").trim().toLowerCase() === "synod") {
        ctx.logs.push({
          game_id: gameId,
          turn_number: currentTurn,
          phase: "economy",
          log_type: "synod_planet_stub",
          message: `${sys.system_name}: Synod-owned — routed through Synod planet stub (normal processing skipped)`,
          details_json: { system_id: sys.system_id, owner: sys.owner },
        });
        continue;
      }

      const result = processNextTurn(sys, facilityTypes, DEFAULT_TURN_CONSTANTS, 0, shipTypes);
      mapState.systems.set(sys.system_id, result.planet);

      const key = ownerToEconKey(sys.owner, ctx.factions);
      if (key) {
        const econ = ctx.playerEcon.get(key) || { tribute: 0, maintenance: 0 };
        econ.tribute += result.tributeBreakdown.totalTribute;
        econ.maintenance += result.upkeepBreakdown.totalUpkeep;
        ctx.playerEcon.set(key, econ);
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
        (supabase as any).from("game_fleet_ships").select("game_fleet_id, ship_type_id, quantity, tactical_group").in("game_fleet_id", gameFleetIds),
        (supabase as any).from("ship_types").select("id, maintenance"),
      ]);
      const shipMaintMap = new Map<string, number>();
      for (const st of (allShipTypes || [])) shipMaintMap.set(st.id, Number(st.maintenance));

      for (const gf of gameFleets) {
        const key = ownerToEconKey(gf.owner_classification, ctx.factions);
        if (!key) continue;
        // Scuttle-lane ships are removed later this turn (skuttlePhase runs
        // after economy but before movement) — do not charge upkeep on them.
        const ships = (fleetShips || []).filter((fs: any) => fs.game_fleet_id === gf.id && fs.tactical_group !== "Scuttle");
        const fleetMaint = ships.reduce(
          (sum: number, fs: any) => sum + (shipMaintMap.get(fs.ship_type_id) || 0) * fs.quantity,
          0
        );
        if (fleetMaint > 0) {
          const econ = ctx.playerEcon.get(key) || { tribute: 0, maintenance: 0 };
          econ.maintenance += fleetMaint;
          ctx.playerEcon.set(key, econ);
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
      const { data: constRows } = await (supabase as any)
        .from("combat_constants").select("key, value")
        .in("key", ["supply_capacity_coefficient", "supply_cost_coefficient"]);
      const constMap = new Map<string, number>(
        (constRows || []).map((r: any) => [r.key, Number(r.value)]),
      );
      const supplyCoefficient = constMap.get("supply_capacity_coefficient") || 10;
      const supplyCostCoefficient = constMap.has("supply_cost_coefficient")
        ? (constMap.get("supply_cost_coefficient") as number)
        : 1;

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
          .from("game_fleets").select("id, fleet_id, fleet_name, hex_x, hex_y").eq("id", gameFleetId).maybeSingle();
        if (!gf?.fleet_id) continue;

        // Supply-grid gating: fleet's current hex must be in the ordering
        // player's supply grid (province hexes or within an emitter radius).
        const ownerClass = ownerForPlayer(order.player_id);
        const grid = getSupplyGrid(ownerClass);
        if (!grid.has(hexKey(Number(gf.hex_x), Number(gf.hex_y)))) {
          ctx.logs.push({
            game_id: gameId, turn_number: currentTurn, phase: "economy",
            log_type: "supply_replenish_rejected",
            message: `${gf.fleet_name || "Fleet"}: replenish rejected — out of supply at (${gf.hex_x},${gf.hex_y})`,
            details_json: { game_fleet_id: gameFleetId, hex_x: gf.hex_x, hex_y: gf.hex_y, reason: "out_of_supply" },
          });
          continue;
        }


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
        // Preserve any existing supply even if the fleet's capacity has shrunk
        // (e.g. supply-pod ships were destroyed in a prior combat). Never write
        // a value lower than what's already in storage.
        const existing = Number(fl.current_supply) || 0;
        const current = existing;
        const delta = Math.max(0, maxSupplies - current);
        const granted = Math.min(requested, delta);
        const next = current + granted;
        const cost = Math.ceil(granted * supplyCostCoefficient);

        await (supabase as any).from("fleets").update({ current_supply: next }).eq("id", fl.id);

        // Charge the ordering player's treasury via the maintenance accumulator.
        const orderingPlayer = ctx.players.find(p => p.id === order.player_id);
        const orderingKey = orderingPlayer ? rowEconKey(orderingPlayer) : undefined;
        if (orderingKey && cost > 0) {
          const econ = ctx.playerEcon.get(orderingKey) || { tribute: 0, maintenance: 0 };
          econ.maintenance += cost;
          ctx.playerEcon.set(orderingKey, econ);
        }

        supplyApplied++;

        ctx.logs.push({
          game_id: gameId,
          turn_number: currentTurn,
          phase: "economy",
          log_type: "supply_replenished",
          message: `${gf.fleet_name || "Fleet"}: supply ${current} → ${next} / ${maxSupplies} (requested ${requested}, cost ${cost})`,
          details_json: {
            fleet_id: fl.id, game_fleet_id: gameFleetId,
            current, granted, next, max: maxSupplies, requested,
            cost, supply_cost_coefficient: supplyCostCoefficient,
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

    // 4b. Apply queued repair_fleet orders.
    //     Each unit of "amount" restores 1 HP and consumes 1 supply. Repairs are
    //     additionally capped by the fleet's available repair-pod pool, which is
    //     contributed by non-crippled ships in the Rear tactical group.
    const repairOrders = ctx.orders.filter(
      o => o.order_type === "other" && o.order_json?.kind === "repair_fleet",
    );
    if (repairOrders.length > 0) {
      // Cache hull and repair_pod from ship_types.
      const { data: stData } = await (supabase as any)
        .from("ship_types").select("id, hull, repair_pod");
      const hullMap = new Map<string, number>();
      const repairPodMap = new Map<string, number>();
      for (const r of (stData || [])) {
        hullMap.set(r.id, Number(r.hull) || 0);
        repairPodMap.set(r.id, Number(r.repair_pod) || 0);
      }

      let repairsApplied = 0;
      for (const order of repairOrders) {
        const gameFleetId = order.order_json?.fleet_id;
        const assignments = (order.order_json?.assignments as Array<{ ship_id: string; amount: number }>) || [];
        if (!gameFleetId || assignments.length === 0) continue;

        const { data: gf } = await (supabase as any)
          .from("game_fleets").select("id, fleet_id, fleet_name").eq("id", gameFleetId).maybeSingle();
        if (!gf?.fleet_id) continue;

        const { data: fl } = await (supabase as any)
          .from("fleets").select("id, current_supply").eq("id", gf.fleet_id).maybeSingle();
        if (!fl) continue;

        // Compute repair-pod pool from Rear, non-crippled ships.
        const { data: gfShips } = await (supabase as any)
          .from("game_fleet_ships")
          .select("id, ship_type_id, quantity, current_hp, crippled, tactical_group")
          .eq("game_fleet_id", gameFleetId);
        let repairPool = 0;
        for (const r of (gfShips || [])) {
          if (r.crippled) continue;
          if (r.tactical_group !== "Rear") continue;
          repairPool += (repairPodMap.get(r.ship_type_id) || 0) * (Number(r.quantity) || 0);
        }
        const shipById = new Map<string, any>();
        for (const r of (gfShips || [])) shipById.set(r.id, r);

        let supplyAvail = Number(fl.current_supply) || 0;
        const repaired: Array<{ ship_id: string; granted: number; new_hp: number; max_hp: number }> = [];
        const dropped: Array<{ ship_id: string; reason: string; requested: number }> = [];

        for (const a of assignments) {
          const requested = Math.max(0, Math.floor(Number(a.amount) || 0));
          if (requested <= 0) continue;
          const row = shipById.get(a.ship_id);
          if (!row) {
            dropped.push({ ship_id: a.ship_id, reason: "ship not found", requested });
            continue;
          }
          const maxHp = hullMap.get(row.ship_type_id) || 0;
          const curHp = row.current_hp == null ? maxHp : Number(row.current_hp);
          const hpMissing = Math.max(0, maxHp - curHp);
          const granted = Math.max(0, Math.min(requested, hpMissing, repairPool, supplyAvail));
          if (granted < requested) {
            dropped.push({
              ship_id: a.ship_id,
              reason: granted === 0
                ? (hpMissing === 0 ? "already full" : repairPool === 0 ? "no repair pods" : "no supply")
                : "partial (cap, pods, or supply limited)",
              requested: requested - granted,
            });
          }
          if (granted <= 0) continue;

          const newHp = curHp + granted;
          await (supabase as any).from("game_fleet_ships")
            .update({
              current_hp: newHp >= maxHp ? null : newHp,
              crippled: false,
            })
            .eq("id", row.id);

          repairPool -= granted;
          supplyAvail -= granted;
          repaired.push({ ship_id: row.id, granted, new_hp: newHp, max_hp: maxHp });
        }

        // Persist new supply balance.
        await (supabase as any).from("fleets")
          .update({ current_supply: Math.max(0, supplyAvail) })
          .eq("id", fl.id);
        repairsApplied++;

        const totalHpRestored = repaired.reduce((s, r) => s + r.granted, 0);
        ctx.logs.push({
          game_id: gameId,
          turn_number: currentTurn,
          phase: "economy",
          log_type: "fleet_repaired",
          message: `${gf.fleet_name || "Fleet"}: repaired ${totalHpRestored} HP across ${repaired.length} ship(s)`,
          details_json: {
            fleet_id: fl.id,
            game_fleet_id: gameFleetId,
            repaired,
            dropped,
            supply_remaining: Math.max(0, supplyAvail),
          },
        });
      }

      if (repairsApplied > 0) {
        ctx.logs.push({
          game_id: gameId,
          turn_number: currentTurn,
          phase: "economy",
          log_type: "repair_summary",
          message: `Applied ${repairsApplied} repair order(s).`,
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
        // Crippled non-strikecraft can't deploy fighters/gunships, so their
        // bays/links don't contribute capacity. Crippled strikecraft still
        // occupy a slot.
        const { data: gfShips } = await (supabase as any)
          .from("game_fleet_ships").select("ship_type_id, quantity, crippled").eq("game_fleet_id", gameFleetId);
        let fighterCap = 0, fighterUsed = 0, gunshipCap = 0, gunshipUsed = 0;
        for (const r of (gfShips || [])) {
          const st = stMap.get(r.ship_type_id);
          if (!st) continue;
          const qty = Number(r.quantity) || 0;
          const isCrippled = !!r.crippled;
          if (!isCrippled) {
            fighterCap += (Number(st.fighter_bay) || 0) * qty;
            gunshipCap += (Number(st.gun_ship_link) || 0) * qty;
          }
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

    // 6. Apply queued build_ground_invasion orders.
    //    Each unit costs 1 fleet supply and adds 1 to current_ground_invasion,
    //    capped at the fleet's max ground_invasion capacity (sum of
    //    ship.ground_invasion across non-crippled ships).
    const giOrders = ctx.orders.filter(
      o => o.order_type === "other" && o.order_json?.kind === "build_ground_invasion",
    );
    if (giOrders.length > 0) {
      const { data: giShipTypes } = await (supabase as any)
        .from("ship_types").select("id, ground_invasion");
      const giMap = new Map<string, number>();
      for (const r of (giShipTypes || [])) giMap.set(r.id, Number(r.ground_invasion) || 0);

      let giApplied = 0;
      for (const order of giOrders) {
        const gameFleetId = order.order_json?.fleet_id;
        const requested = Math.max(0, Math.floor(Number(order.order_json?.amount) || 0));
        if (!gameFleetId || requested <= 0) continue;

        const { data: gf } = await (supabase as any)
          .from("game_fleets").select("id, fleet_id, fleet_name").eq("id", gameFleetId).maybeSingle();
        if (!gf?.fleet_id) continue;

        const { data: fl } = await (supabase as any)
          .from("fleets").select("id, current_supply, current_ground_invasion").eq("id", gf.fleet_id).maybeSingle();
        if (!fl) continue;

        const { data: gfShips } = await (supabase as any)
          .from("game_fleet_ships").select("ship_type_id, quantity, crippled").eq("game_fleet_id", gameFleetId);
        const maxGI = (gfShips || []).reduce(
          (sum: number, r: any) => sum + (r.crippled ? 0 : (giMap.get(r.ship_type_id) || 0) * (Number(r.quantity) || 0)),
          0,
        );

        const supplyAvail = Number((fl as any).current_supply) || 0;
        const currentGI = Number((fl as any).current_ground_invasion) || 0;
        const capRoom = Math.max(0, maxGI - currentGI);
        const granted = Math.max(0, Math.min(requested, capRoom, supplyAvail));
        if (granted <= 0) {
          ctx.logs.push({
            game_id: gameId, turn_number: currentTurn, phase: "economy",
            log_type: "ground_invasion_loaded",
            message: `${gf.fleet_name || "Fleet"}: ground invasion request dropped (requested ${requested}, room ${capRoom}, supply ${supplyAvail})`,
            details_json: { fleet_id: fl.id, game_fleet_id: gameFleetId, requested, granted: 0, max: maxGI, current: currentGI },
          });
          continue;
        }

        await (supabase as any).from("fleets").update({
          current_ground_invasion: currentGI + granted,
          current_supply: Math.max(0, supplyAvail - granted),
        }).eq("id", fl.id);
        giApplied++;

        ctx.logs.push({
          game_id: gameId, turn_number: currentTurn, phase: "economy",
          log_type: "ground_invasion_loaded",
          message: `${gf.fleet_name || "Fleet"}: loaded ${granted} ground invasion troop(s) (${currentGI} → ${currentGI + granted} / ${maxGI})`,
          details_json: {
            fleet_id: fl.id, game_fleet_id: gameFleetId,
            requested, granted, max: maxGI,
            current_before: currentGI, current_after: currentGI + granted,
            supply_remaining: Math.max(0, supplyAvail - granted),
          },
        });
      }

      if (giApplied > 0) {
        ctx.logs.push({
          game_id: gameId, turn_number: currentTurn, phase: "economy",
          log_type: "ground_invasion_summary",
          message: `Applied ${giApplied} ground-invasion load order(s).`,
        });
      }
    }
  },
};
