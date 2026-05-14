/**
 * Transfer Ships Phase
 *
 * Processes player orders of kind "transfer_ships" against the source fleet's
 * `tactical_group = "Transfer"` ships. Ships are moved to a target friendly
 * fleet (must be at the same hex) or to an owned planet (a new detachment
 * fleet is created at the system hex if one does not already exist there).
 *
 * Runs AFTER movement (so positions are final) and BEFORE ground combat.
 */
import type { Phase, TurnContext } from "../types";

export const transferShipsPhase: Phase = {
  name: "movement",
  label: "Transfer Ships",
  async run(ctx: TurnContext) {
    const { supabase, gameId, currentTurn, mapState } = ctx;

    const orders = ctx.orders.filter(
      o => o.order_type === "other" && o.order_json?.kind === "transfer_ships",
    );
    if (orders.length === 0) return;

    for (const order of orders) {
      const oj = order.order_json || {};
      const sourceFleetId: string | undefined = oj.fleet_id;
      if (!sourceFleetId) continue;

      const source = mapState.fleets.find(f => f.fleet_id === sourceFleetId);
      if (!source) continue;

      // Load Transfer-group rows from the source fleet roster.
      const { data: transferRows } = await (supabase as any)
        .from("game_fleet_ships")
        .select("id, ship_type_id, quantity, current_hp, crippled")
        .eq("game_fleet_id", sourceFleetId)
        .eq("tactical_group", "Transfer");

      const rows: any[] = transferRows || [];
      if (rows.length === 0) {
        ctx.logs.push({
          game_id: gameId, turn_number: currentTurn, phase: "movement",
          log_type: "transfer_skipped",
          message: `Transfer order on ${source.fleet_name}: no ships in Transfer group.`,
          details_json: { fleet_id: sourceFleetId },
        });
        continue;
      }

      // Resolve destination fleet id (creating one at the planet if needed).
      let destFleetId: string | null = null;
      let destLabel = "";

      if (oj.target_fleet_id) {
        const dest = mapState.fleets.find(f => f.fleet_id === oj.target_fleet_id);
        if (!dest) {
          ctx.logs.push({
            game_id: gameId, turn_number: currentTurn, phase: "movement",
            log_type: "transfer_failed",
            message: `Transfer from ${source.fleet_name} failed: target fleet no longer exists.`,
            details_json: { order_id: order.id },
          });
          continue;
        }
        if ((dest as any).owner_classification !== (source as any).owner_classification) {
          ctx.logs.push({
            game_id: gameId, turn_number: currentTurn, phase: "movement",
            log_type: "transfer_failed",
            message: `Transfer from ${source.fleet_name} failed: target fleet is not friendly.`,
            details_json: { order_id: order.id },
          });
          continue;
        }
        destFleetId = dest.fleet_id;
        destLabel = dest.fleet_name;
      } else if (oj.target_system_id != null) {
        const sys = mapState.systems.get(Number(oj.target_system_id));
        if (!sys) continue;
        const sysHex = Array.from(mapState.hexes.values()).find(h => h.hex_id === sys.hex_id);
        if (!sysHex) continue;
        // Verify owner still controls the system.
        const ownerClass = (source as any).owner_classification;
        if ((sys as any).owner !== ownerClass) {
          ctx.logs.push({
            game_id: gameId, turn_number: currentTurn, phase: "movement",
            log_type: "transfer_failed",
            message: `Transfer from ${source.fleet_name} failed: ${sys.system_name} is no longer owned.`,
            details_json: { order_id: order.id },
          });
          continue;
        }
        // Find or create a friendly non-garrison fleet at the system's hex.
        const existing = mapState.fleets.find(f =>
          (f as any).owner_classification === ownerClass &&
          f.hex_x === sysHex.x && f.hex_y === sysHex.y &&
          f.fleet_id !== source.fleet_id &&
          !(f as any).is_garrison,
        );
        if (existing) {
          destFleetId = existing.fleet_id;
          destLabel = existing.fleet_name;
        } else {
          const newName = `${sys.system_name} Detachment`;
          const { data: newFleet, error: nfErr } = await (supabase as any)
            .from("game_fleets")
            .insert({
              game_id: gameId,
              owner_classification: ownerClass,
              fleet_name: newName,
              hex_x: sysHex.x,
              hex_y: sysHex.y,
              system_id: sys.system_id,
              is_garrison: false,
            })
            .select("id")
            .single();
          if (nfErr || !newFleet) {
            ctx.logs.push({
              game_id: gameId, turn_number: currentTurn, phase: "movement",
              log_type: "transfer_failed",
              message: `Transfer from ${source.fleet_name} failed: could not create detachment.`,
              details_json: { order_id: order.id, error: nfErr?.message },
            });
            continue;
          }
          destFleetId = newFleet.id;
          destLabel = newName;
        }
      } else {
        continue;
      }

      if (!destFleetId) continue;

      // Reassign rows to the destination fleet, reset to Core group.
      const ids = rows.map(r => r.id);
      const totalQty = rows.reduce((s, r) => s + (r.quantity || 0), 0);
      const { error: updErr } = await (supabase as any)
        .from("game_fleet_ships")
        .update({ game_fleet_id: destFleetId, tactical_group: "Core" })
        .in("id", ids);
      if (updErr) {
        ctx.logs.push({
          game_id: gameId, turn_number: currentTurn, phase: "movement",
          log_type: "transfer_failed",
          message: `Transfer from ${source.fleet_name} failed: ${updErr.message}`,
          details_json: { order_id: order.id },
        });
        continue;
      }

      ctx.logs.push({
        game_id: gameId, turn_number: currentTurn, phase: "movement",
        log_type: "transfer_completed",
        message: `${totalQty} ship(s) transferred from ${source.fleet_name} to ${destLabel}.`,
        details_json: { from: source.fleet_id, to: destFleetId, count: totalQty },
      });
    }
  },
};
