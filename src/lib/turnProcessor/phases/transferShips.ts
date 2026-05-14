/**
 * Transfer Ships Phase
 *
 * Processes player orders of kind "transfer_ships" against the source fleet's
 * `tactical_group = "Transfer"` ships. Ships are moved to a target friendly
 * fleet (must be at the same hex) or to an owned planet (a new detachment
 * fleet is created at the system hex if one does not already exist there).
 *
 * Per-ship range rule (parity with ship production transit):
 *   - If hex distance from source → destination ≤ ship.map_speed, the ship
 *     joins the destination fleet immediately (row reassigned, HP preserved).
 *   - Otherwise the ships enter `ships_in_transit` (virtual fleet, no map
 *     presence) starting at the source hex and advance ship.map_speed hexes
 *     per turn until they arrive at the destination fleet.
 *
 * Runs AFTER movement (so positions are final) and BEFORE ground combat.
 */
import type { Phase, TurnContext } from "../types";
import { offsetToCube, cubeDistance } from "@/lib/hexUtils";

function distHex(ax: number, ay: number, bx: number, by: number) {
  const [a1, a2, a3] = offsetToCube(ax, ay);
  const [b1, b2, b3] = offsetToCube(bx, by);
  return cubeDistance(a1, a2, a3, b1, b2, b3);
}

export const transferShipsPhase: Phase = {
  name: "movement",
  label: "Transfer Ships",
  async run(ctx: TurnContext) {
    const { supabase, gameId, currentTurn, mapState } = ctx;

    const orders = ctx.orders.filter(
      o => o.order_type === "other" && o.order_json?.kind === "transfer_ships",
    );
    if (orders.length === 0) return;

    // Preload ship types for map_speed lookups.
    const { data: shipTypeRows } = await (supabase as any)
      .from("ship_types")
      .select("id, map_speed");
    const shipSpeed = new Map<string, number>(
      (shipTypeRows || []).map((s: any) => [s.id, Math.max(1, Number(s.map_speed) || 1)]),
    );

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
      let destX = 0;
      let destY = 0;

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
        destX = dest.hex_x;
        destY = dest.hex_y;
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
          destX = existing.hex_x;
          destY = existing.hex_y;
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
          destX = sysHex.x;
          destY = sysHex.y;
        }
      } else {
        continue;
      }

      if (!destFleetId) continue;

      const dist = distHex(source.hex_x, source.hex_y, destX, destY);
      const ownerClass = (source as any).owner_classification;

      // Partition rows into immediate (in-range) vs in-transit (out-of-range)
      // on a per-ship-type basis using ship.map_speed.
      const immediateIds: string[] = [];
      const transitBuckets = new Map<string, number>(); // ship_type_id → quantity

      for (const r of rows) {
        const speed = shipSpeed.get(r.ship_type_id) ?? 1;
        const qty = Number(r.quantity) || 0;
        if (qty <= 0) continue;
        if (dist <= speed) {
          immediateIds.push(r.id);
        } else {
          transitBuckets.set(r.ship_type_id, (transitBuckets.get(r.ship_type_id) || 0) + qty);
        }
      }

      let immediateCount = 0;
      if (immediateIds.length > 0) {
        // Sum quantity across the ids we're moving for the log.
        for (const r of rows) {
          if (immediateIds.includes(r.id)) immediateCount += Number(r.quantity) || 0;
        }
        const { error: updErr } = await (supabase as any)
          .from("game_fleet_ships")
          .update({ game_fleet_id: destFleetId, tactical_group: "Core" })
          .in("id", immediateIds);
        if (updErr) {
          ctx.logs.push({
            game_id: gameId, turn_number: currentTurn, phase: "movement",
            log_type: "transfer_failed",
            message: `Transfer from ${source.fleet_name} failed: ${updErr.message}`,
            details_json: { order_id: order.id },
          });
          continue;
        }
      }

      let transitCount = 0;
      if (transitBuckets.size > 0) {
        const inserts: any[] = [];
        for (const [shipTypeId, qty] of transitBuckets) {
          inserts.push({
            game_id: gameId,
            owner_classification: ownerClass,
            ship_type_id: shipTypeId,
            quantity: qty,
            destination_fleet_id: destFleetId,
            origin_system_id: (source as any).system_id ?? null,
            virt_x: source.hex_x,
            virt_y: source.hex_y,
            created_turn: currentTurn,
          });
          transitCount += qty;
        }
        const { error: insErr } = await (supabase as any)
          .from("ships_in_transit")
          .insert(inserts);
        if (!insErr) {
          // Remove the in-transit rows from the source fleet roster — they
          // are now virtual until they arrive (HP is reset to full).
          const transitIds = rows
            .filter(r => transitBuckets.has(r.ship_type_id))
            .map(r => r.id);
          if (transitIds.length > 0) {
            await (supabase as any)
              .from("game_fleet_ships")
              .delete()
              .in("id", transitIds);
          }
        } else {
          ctx.logs.push({
            game_id: gameId, turn_number: currentTurn, phase: "movement",
            log_type: "transfer_failed",
            message: `Transfer from ${source.fleet_name}: in-transit insert failed: ${insErr.message}`,
            details_json: { order_id: order.id },
          });
        }
      }

      const parts: string[] = [];
      if (immediateCount > 0) parts.push(`${immediateCount} arrived`);
      if (transitCount > 0) parts.push(`${transitCount} in transit (${dist} hex)`);
      ctx.logs.push({
        game_id: gameId, turn_number: currentTurn, phase: "movement",
        log_type: transitCount > 0 ? "transfer_in_transit" : "transfer_completed",
        message: `Transfer from ${source.fleet_name} → ${destLabel}: ${parts.join(", ") || "no ships"}.`,
        details_json: { from: source.fleet_id, to: destFleetId, dist, immediate: immediateCount, in_transit: transitCount },
      });
    }
  },
};
