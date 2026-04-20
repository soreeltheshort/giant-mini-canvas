/**
 * Combat Phase
 *
 * Resolves fleet_attack conditional orders by invoking the deterministic
 * battle engine (src/lib/battleEngine.ts). For each order:
 *   1. Load fleet compositions for attacker & defender from fleet_ships.
 *   2. Build FleetSnapshots, load battle config from DB.
 *   3. Run runBattle() with a deterministic per-turn seed.
 *   4. Persist a battle_runs row + battle_events rows for replay.
 *   5. Aggregate surviving (non-crippled) ships per type, then UPDATE/DELETE
 *      fleet_ships rows accordingly.
 *   6. If a fleet has zero ships left, remove its game_fleets row and prune
 *      it from ctx.mapState.fleets so downstream phases ignore it.
 *
 * Per-turn validation (e.g. attacker must be co-located with target) is
 * intentionally deferred — the order UI will block invalid targets.
 *
 * Multiple attack orders against the same defender in one turn are processed
 * sequentially in submitted order; later attackers fight whatever survived.
 */
import type { Phase, TurnContext } from "../types";
import {
  runBattle,
  type FleetSnapshot,
  type FleetShipData,
  type ShipTypeData,
  type PhaseConfig,
  type GroupModConfig,
  type CombatConstants,
  type WeaponTargetPref,
  type GroundCombatOutcome,
} from "@/lib/battleEngine";

interface FleetCompositionRow {
  id: string;
  fleet_id: string;
  ship_type_id: string;
  quantity: number;
  tactical_group: string;
}

async function loadFleetSnapshot(
  supabase: any,
  sourceFleetId: string,
  shipTypesById: Map<string, ShipTypeData>,
): Promise<{ snapshot: FleetSnapshot; rows: FleetCompositionRow[] } | null> {
  const { data: fleet } = await supabase
    .from("fleets")
    .select("id, name, readiness")
    .eq("id", sourceFleetId)
    .maybeSingle();
  if (!fleet) return null;

  const { data: rows } = await supabase
    .from("fleet_ships")
    .select("id, fleet_id, ship_type_id, quantity, tactical_group")
    .eq("fleet_id", sourceFleetId);

  const compRows: FleetCompositionRow[] = (rows || []).filter((r: any) => r.quantity > 0);
  const ships: FleetShipData[] = [];
  for (const r of compRows) {
    const st = shipTypesById.get(r.ship_type_id);
    if (!st) continue;
    ships.push({ ship_type: st, quantity: r.quantity, tactical_group: r.tactical_group });
  }

  return {
    snapshot: { id: fleet.id, name: fleet.name, ships, readiness: fleet.readiness ?? 2 },
    rows: compRows,
  };
}

/**
 * Apply battle losses back to fleet_ships. We compare pre-battle quantity
 * (from rows) with post-battle survivors per ship_type_id, grouped by the
 * tactical_group recorded on the row (the engine preserves tactical_group
 * on each ShipInstance via fs.tactical_group).
 */
async function applyLosses(
  supabase: any,
  rows: FleetCompositionRow[],
  finalShips: Array<{ typeId: string; tacticalGroup: string; crippled: boolean }>,
): Promise<{ losses: Record<string, number>; totalBefore: number; totalAfter: number }> {
  // Group survivors by `${typeId}|${tacticalGroup}`
  const survivorCounts = new Map<string, number>();
  for (const s of finalShips) {
    if (s.crippled) continue;
    const key = `${s.typeId}|${s.tacticalGroup}`;
    survivorCounts.set(key, (survivorCounts.get(key) || 0) + 1);
  }

  const losses: Record<string, number> = {};
  let totalBefore = 0;
  let totalAfter = 0;

  for (const row of rows) {
    totalBefore += row.quantity;
    const key = `${row.ship_type_id}|${row.tactical_group}`;
    const survivors = survivorCounts.get(key) || 0;
    const lost = row.quantity - survivors;
    totalAfter += survivors;
    if (lost > 0) {
      losses[`${row.ship_type_id}:${row.tactical_group}`] = lost;
    }
    if (survivors <= 0) {
      await supabase.from("fleet_ships").delete().eq("id", row.id);
    } else if (survivors !== row.quantity) {
      await supabase.from("fleet_ships").update({ quantity: survivors }).eq("id", row.id);
    }
  }

  return { losses, totalBefore, totalAfter };
}

export const combatPhase: Phase = {
  name: "combat",
  label: "Combat",
  async run(ctx: TurnContext) {
    const { supabase, gameId, currentTurn } = ctx;

    const attackOrders = ctx.orders.filter(
      (o) => o.order_type === "other" && (o.order_json as any)?.kind === "fleet_attack",
    );

    if (attackOrders.length === 0) {
      ctx.logs.push({
        game_id: gameId, turn_number: currentTurn, phase: "combat",
        log_type: "noop", message: "No engagements this turn.",
      });
      return;
    }

    // Load all referenced ship_types in one go for snapshot building.
    const referencedFleetIds = new Set<string>();
    for (const o of attackOrders) {
      const oj = o.order_json as any;
      if (oj?.fleet_id) referencedFleetIds.add(oj.fleet_id);
      if (oj?.target_fleet_id) referencedFleetIds.add(oj.target_fleet_id);
    }
    const { data: allShipRows } = await (supabase as any)
      .from("fleet_ships")
      .select("ship_type_id")
      .in("fleet_id", Array.from(referencedFleetIds));
    const typeIds = Array.from(new Set((allShipRows || []).map((r: any) => r.ship_type_id))).filter(Boolean);

    const shipTypesById = new Map<string, ShipTypeData>();
    if (typeIds.length > 0) {
      const { data: shipTypes } = await (supabase as any).from("ship_types").select("*").in("id", typeIds);
      for (const st of shipTypes || []) shipTypesById.set(st.id, st as ShipTypeData);
    }

    // Battle config (shared across all engagements this turn)
    const [{ data: phasesData }, { data: modsData }, { data: constsData }, { data: weaponPrefsData }, { data: groundOutcomesData }] = await Promise.all([
      (supabase as any).from("battle_phases").select("*").order("seq_order"),
      (supabase as any).from("group_modifiers").select("*"),
      (supabase as any).from("combat_constants").select("*"),
      (supabase as any).from("weapon_target_preferences").select("*").order("priority"),
      (supabase as any).from("ground_combat_outcomes").select("*").order("probability"),
    ]);
    const phases: PhaseConfig[] | undefined = (phasesData || []).map((p: any) => ({
      name: p.name, groupsA: p.groups_a, groupsB: p.groups_b,
      modA: Number(p.mod_a), modB: Number(p.mod_b), requiredGroup: p.required_group ?? null,
    }));
    const groupMods: GroupModConfig[] | undefined = (modsData || []).map((g: any) => ({
      group_name: g.group_name, attack_mod: Number(g.attack_mod), defense_mod: Number(g.defense_mod),
    }));
    const combatConsts: CombatConstants | undefined = constsData
      ? (constsData as any[]).reduce((acc, row) => { (acc as any)[row.key] = Number(row.value); return acc; }, {} as CombatConstants)
      : undefined;
    const weaponPrefs: WeaponTargetPref[] | undefined = (weaponPrefsData || []).map((w: any) => ({
      weapon_key: w.weapon_key, hull_class: w.hull_class, priority: w.priority,
    }));
    const groundOutcomes: GroundCombatOutcome[] | undefined = (groundOutcomesData || []).map((o: any) => ({
      probability: Number(o.probability), damage: Number(o.damage),
    }));

    let resolved = 0;

    for (const order of attackOrders) {
      const oj = order.order_json as any;
      const attackerGameFleetId: string = oj.fleet_id;
      const targetGameFleetId: string = oj.target_fleet_id;

      // Resolve game_fleets entries in the live mapState (these carry the
      // source_fleet_id pointer into the `fleets` table).
      const attackerMF = ctx.mapState.fleets.find(f => f.fleet_id === attackerGameFleetId);
      const targetMF = ctx.mapState.fleets.find(f => f.fleet_id === targetGameFleetId);
      if (!attackerMF || !targetMF) {
        ctx.logs.push({
          game_id: gameId, turn_number: currentTurn, phase: "combat",
          log_type: "combat_invalid",
          message: `Attack order references missing fleet (attacker=${attackerGameFleetId}, target=${targetGameFleetId}).`,
          details_json: oj,
        });
        continue;
      }

      const snapA = await loadFleetSnapshot(supabase as any, attackerMF.source_fleet_id, shipTypesById);
      const snapB = await loadFleetSnapshot(supabase as any, targetMF.source_fleet_id, shipTypesById);
      if (!snapA || !snapB || snapA.snapshot.ships.length === 0 || snapB.snapshot.ships.length === 0) {
        ctx.logs.push({
          game_id: gameId, turn_number: currentTurn, phase: "combat",
          log_type: "combat_invalid",
          message: `Cannot resolve attack — one or both fleets have no ships (${attackerMF.fleet_name} vs ${targetMF.fleet_name}).`,
          details_json: oj,
        });
        continue;
      }

      const seedStr = `${gameId}-t${currentTurn}-${order.id}`;
      const battleResult = runBattle(
        snapA.snapshot, snapB.snapshot, seedStr,
        phases, groupMods, combatConsts, weaponPrefs,
        4, 4, groundOutcomes, 0, 0, 0,
      );

      // Persist battle_run + events for full replay
      const { data: battleRun } = await (supabase as any).from("battle_runs").insert({
        fleet_a_snapshot_json: snapA.snapshot as any,
        fleet_b_snapshot_json: snapB.snapshot as any,
        seed: seedStr,
        result_json: { winner: battleResult.winner, game_id: gameId, turn_number: currentTurn } as any,
        created_by_user_id: null,
      }).select().maybeSingle();

      if (battleRun) {
        const eventRows = battleResult.events.map((e: any) => ({
          battle_run_id: battleRun.id,
          seq: e.seq, tick: e.tick, event_type: e.event_type,
          payload_json: e.payload_json, public_summary_text: e.public_summary_text,
          admin_explain_text: e.admin_explain_text,
        }));
        if (eventRows.length > 0) {
          await (supabase as any).from("battle_events").insert(eventRows);
        }
      }

      // Apply losses to both fleets
      const aFinal = battleResult.finalState.fleetA.map(s => ({ typeId: s.typeId, tacticalGroup: s.tacticalGroup, crippled: s.crippled }));
      const bFinal = battleResult.finalState.fleetB.map(s => ({ typeId: s.typeId, tacticalGroup: s.tacticalGroup, crippled: s.crippled }));
      const lossesA = await applyLosses(supabase as any, snapA.rows, aFinal);
      const lossesB = await applyLosses(supabase as any, snapB.rows, bFinal);

      // If a fleet is wiped, remove its game_fleets row + map entry
      const wipeFleet = async (mf: typeof attackerMF) => {
        await (supabase as any).from("game_fleets")
          .delete().eq("game_id", gameId).eq("fleet_id", mf.source_fleet_id);
        const idx = ctx.mapState.fleets.indexOf(mf);
        if (idx >= 0) ctx.mapState.fleets.splice(idx, 1);
      };
      if (lossesA.totalAfter <= 0) await wipeFleet(attackerMF);
      if (lossesB.totalAfter <= 0) await wipeFleet(targetMF);

      resolved++;
      ctx.logs.push({
        game_id: gameId, turn_number: currentTurn, phase: "combat",
        log_type: "battle_resolved",
        message: `Battle: ${attackerMF.fleet_name} vs ${targetMF.fleet_name} — winner: ${battleResult.winner === "draw" ? "Draw" : `Fleet ${battleResult.winner}`}. Survivors A=${lossesA.totalAfter}/${lossesA.totalBefore}, B=${lossesB.totalAfter}/${lossesB.totalBefore}.`,
        details_json: {
          battle_run_id: battleRun?.id,
          seed: seedStr,
          attacker_fleet_id: attackerGameFleetId,
          target_fleet_id: targetGameFleetId,
          attacker_name: attackerMF.fleet_name,
          target_name: targetMF.fleet_name,
          winner: battleResult.winner,
          attacker_losses: lossesA.losses,
          target_losses: lossesB.losses,
          attacker_survivors: lossesA.totalAfter,
          target_survivors: lossesB.totalAfter,
          attacker_wiped: lossesA.totalAfter <= 0,
          target_wiped: lossesB.totalAfter <= 0,
        },
      });
    }

    ctx.logs.push({
      game_id: gameId, turn_number: currentTurn, phase: "combat",
      log_type: "combat_summary",
      message: `Combat phase complete — resolved ${resolved} engagement(s).`,
    });
  },
};
