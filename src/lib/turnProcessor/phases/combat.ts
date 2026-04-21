/**
 * Combat Phase
 *
 * Resolves fleet_attack conditional orders by invoking the deterministic
 * battle engine (src/lib/battleEngine.ts).
 *
 * IMPORTANT: All snapshot loading, config loading and ground-unit calc go
 * through src/lib/battleSetup.ts so the in-game combat phase produces
 * IDENTICAL results to the Battle Simulator (/battle) for the same inputs.
 * Do not duplicate that logic here.
 *
 * Per order:
 *   1. Resolve attacker & target via ctx.mapState.fleets.
 *   2. Use shared helpers to load both fleet snapshots and battle config.
 *   3. Run runBattle() with a deterministic per-turn seed.
 *   4. Persist a battle_runs row + battle_events rows for replay.
 *   5. Aggregate surviving (non-crippled) ships per type, then UPDATE/DELETE
 *      fleet_ships rows accordingly.
 *   6. If a fleet has zero ships left, remove its game_fleets row and prune
 *      it from ctx.mapState.fleets so downstream phases ignore it.
 *
 * Per-turn validation (e.g. attacker must be co-located with target) is
 * intentionally deferred — the order UI will block invalid targets.
 */
import type { Phase, TurnContext } from "../types";
import { runBattle } from "@/lib/battleEngine";
import { loadFleetSnapshot, loadBattleConfig, calcGroundUnits, type FleetCompositionRow } from "@/lib/battleSetup";

/**
 * Apply battle losses back to fleet_ships. Compares pre-battle quantity per
 * (ship_type_id, tactical_group) row with post-battle survivors.
 */
async function applyLosses(
  supabase: any,
  rows: FleetCompositionRow[],
  finalShips: Array<{ typeId: string; tacticalGroup: string; crippled: boolean }>,
): Promise<{ losses: Record<string, number>; totalBefore: number; totalAfter: number }> {
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

    // Battle config (shared across all engagements this turn — same as simulator)
    const { phases, groupMods, combatConsts, weaponPrefs, groundOutcomes } = await loadBattleConfig(supabase as any);

    let resolved = 0;

    for (const order of attackOrders) {
      const oj = order.order_json as any;
      const attackerGameFleetId: string = oj.fleet_id;
      const targetGameFleetId: string = oj.target_fleet_id;

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

      const snapA = await loadFleetSnapshot(supabase as any, attackerMF.source_fleet_id);
      const snapB = await loadFleetSnapshot(supabase as any, targetMF.source_fleet_id);
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
      const groundUnitsA = calcGroundUnits(snapA.snapshot);
      const groundUnitsB = calcGroundUnits(snapB.snapshot);
      const battleResult = runBattle(
        snapA.snapshot, snapB.snapshot, seedStr,
        phases, groupMods, combatConsts, weaponPrefs,
        4, 4, groundOutcomes, 0, groundUnitsA, groundUnitsB,
      );

      // Persist battle_run + events for full replay.
      // RLS on battle_runs/battle_events requires created_by_user_id = auth.uid(),
      // so we tag the run with the user who is processing the turn.
      const { data: authData } = await (supabase as any).auth.getUser();
      const runnerUserId: string | null = authData?.user?.id ?? null;

      const { data: battleRun, error: brErr } = await (supabase as any).from("battle_runs").insert({
        fleet_a_snapshot_json: snapA.snapshot as any,
        fleet_b_snapshot_json: snapB.snapshot as any,
        seed: seedStr,
        result_json: { winner: battleResult.winner, game_id: gameId, turn_number: currentTurn } as any,
        created_by_user_id: runnerUserId,
      }).select().maybeSingle();

      if (brErr) {
        ctx.logs.push({
          game_id: gameId, turn_number: currentTurn, phase: "combat",
          log_type: "battle_run_persist_failed",
          message: `Failed to persist battle replay: ${brErr.message || brErr}`,
          details_json: { error: String(brErr.message || brErr) },
        });
      }

      if (battleRun) {
        const eventRows = battleResult.events.map((e: any) => ({
          battle_run_id: battleRun.id,
          seq: e.seq, tick: e.tick, event_type: e.event_type,
          payload_json: e.payload_json, public_summary_text: e.public_summary_text,
          admin_explain_text: e.admin_explain_text,
        }));
        if (eventRows.length > 0) {
          const { error: beErr } = await (supabase as any).from("battle_events").insert(eventRows);
          if (beErr) {
            ctx.logs.push({
              game_id: gameId, turn_number: currentTurn, phase: "combat",
              log_type: "battle_events_persist_failed",
              message: `Failed to persist battle events: ${beErr.message || beErr}`,
              details_json: { error: String(beErr.message || beErr) },
            });
          }
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
