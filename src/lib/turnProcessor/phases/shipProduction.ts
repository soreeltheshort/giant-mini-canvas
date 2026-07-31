/**
 * Ship Production Phase
 *
 * Per-system queue advance. Each system spends total ship_build_capacity
 * (sum across its built shipyards) against the head of its
 * `system_ship_production` queue, head-first. Completed ships either:
 *   - join their destination fleet immediately if distance ≤ ship.map_speed,
 *   - or enter `ships_in_transit` (virtual fleet, no map presence).
 *
 * Then every existing in-transit row advances ship.map_speed hexes toward
 * its current destination fleet's hex. On arrival, ships are inserted into
 * game_fleet_ships (Core group) and the transit row is deleted.
 *
 * If a destination fleet is missing/destroyed, both queued and in-transit
 * rows are rerouted to the nearest owned (is_garrison=true) fleet for the
 * same owner_classification. If no garrison exists, the row holds.
 *
 * Runs AFTER economy (so income is settled) and BEFORE movement.
 */
import type { Phase, TurnContext } from "../types";
import { offsetToCube, cubeDistance } from "@/lib/hexUtils";
import { ownerMatchesFaction } from "@/lib/factionUtils";

interface MiniShipType {
  id: string;
  point_cost: number;
  map_speed: number;
  hull_class: string;
  class: string;
  fighter_bay: number;
  fighter_storage: number;
  gun_ship_link: number;
  gunship_storage: number;
}

function stepToward(fromX: number, fromY: number, toX: number, toY: number) {
  const [ax, ay, az] = offsetToCube(fromX, fromY);
  const [bx, by, bz] = offsetToCube(toX, toY);
  const dx = bx - ax, dy = by - ay, dz = bz - az;
  const adx = Math.abs(dx), ady = Math.abs(dy), adz = Math.abs(dz);
  let nx = ax, ny = ay, nz = az;
  if (adx >= ady && adx >= adz) {
    nx += Math.sign(dx);
    if (ady >= adz) ny += Math.sign(dy); else nz += Math.sign(dz);
  } else if (ady >= adx && ady >= adz) {
    ny += Math.sign(dy);
    if (adx >= adz) nx += Math.sign(dx); else nz += Math.sign(dz);
  } else {
    nz += Math.sign(dz);
    if (adx >= ady) nx += Math.sign(dx); else ny += Math.sign(dy);
  }
  const col = nx + (nz - (nz & 1)) / 2;
  const row = nz;
  return { x: col, y: row };
}

function distHex(ax: number, ay: number, bx: number, by: number) {
  const [a1, a2, a3] = offsetToCube(ax, ay);
  const [b1, b2, b3] = offsetToCube(bx, by);
  return cubeDistance(a1, a2, a3, b1, b2, b3);
}

export const shipProductionPhase: Phase = {
  name: "economy", // groups under economy in PhaseName union; logs use "ship_production"
  label: "Ship Production",
  async run(ctx: TurnContext) {
    const { supabase, gameId, currentTurn, mapState, facilityTypes } = ctx;

    // Load all ship types we may need.
    const { data: shipTypeRows } = await (supabase as any)
      .from("ship_types")
      .select("id, point_cost, map_speed, hull_class, class, fighter_bay, fighter_storage, gun_ship_link, gunship_storage");
    const shipTypes = new Map<string, MiniShipType>(
      (shipTypeRows || []).map((s: any) => [s.id, {
        id: s.id,
        point_cost: Number(s.point_cost) || 0,
        map_speed: Math.max(1, Number(s.map_speed) || 1),
        hull_class: String(s.hull_class || ""),
        class: String(s.class || ""),
        fighter_bay: Number(s.fighter_bay) || 0,
        fighter_storage: Number(s.fighter_storage) || 0,
        gun_ship_link: Number(s.gun_ship_link) || 0,
        gunship_storage: Number(s.gunship_storage) || 0,
      }])
    );

    // AI factions in this game — strikecraft they build teleport directly
    // to their destination fleet regardless of distance.
    const { data: aiFactionRows } = await (supabase as any)
      .from("game_factions")
      .select("is_ai, factions:faction_id(code_name)")
      .eq("game_id", gameId)
      .eq("is_ai", true);
    const aiFactionCodes = new Set<string>(
      ((aiFactionRows as any[]) || [])
        .map(r => String(r.factions?.code_name || ""))
        .filter(Boolean)
    );
    const isStrikecraft = (s: MiniShipType) => s.class === "FL" || s.class === "FH" || s.class === "GS";
    const strikeSlotCost = (cls: string): { fighter: number; gunship: number } =>
      cls === "FL" ? { fighter: 1, gunship: 0 }
      : cls === "FH" ? { fighter: 2, gunship: 0 }
      : cls === "GS" ? { fighter: 0, gunship: 1 }
      : { fighter: 0, gunship: 0 };
    const isAiOwner = (ownerClass: string) => {
      for (const code of aiFactionCodes) {
        if (ownerMatchesFaction(ownerClass, code)) return true;
      }
      return false;
    };

    // Per-faction supply grid cache (used for instant strikecraft ferrying).
    const supplyGridCache = new Map<string, Set<string>>();
    const hexInSupply = (ownerClass: string, x: number, y: number): boolean => {
      const key = String(ownerClass || "");
      if (!key) return false;
      let grid = supplyGridCache.get(key);
      if (!grid) {
        grid = computeSupplyGrid(key, mapState.systems, mapState.hexes, facilityTypes as any);
        supplyGridCache.set(key, grid);
      }
      return grid.has(`${x},${y}`);
    };

    /**
     * Per-fleet strike slot ledger, lazily loaded. Tracks REMAINING free
     * fighter/gunship slots as we insert strikecraft this phase. AI-owned
     * arrivals are exempted (they teleport with infinite capacity).
     */
    const strikeCapCache = new Map<string, { fighter_free: number; gunship_free: number }>();
    const loadStrikeCap = async (fleetId: string): Promise<{ fighter_free: number; gunship_free: number }> => {
      const cached = strikeCapCache.get(fleetId);
      if (cached) return cached;
      const { data: rows } = await (supabase as any)
        .from("game_fleet_ships")
        .select("ship_type_id, quantity, crippled")
        .eq("game_fleet_id", fleetId);
      let ff = 0, gf = 0;
      for (const r of (rows as any[]) || []) {
        const st = shipTypes.get(r.ship_type_id);
        if (!st) continue;
        const qty = Number(r.quantity) || 1;
        if (!isStrikecraft(st) && !r.crippled) {
          ff += (st.fighter_bay + st.fighter_storage) * qty;
          gf += (st.gun_ship_link + st.gunship_storage) * qty;
        }
        const cost = strikeSlotCost(st.class);
        ff -= cost.fighter * qty;
        gf -= cost.gunship * qty;
      }
      const v = { fighter_free: ff, gunship_free: gf };
      strikeCapCache.set(fleetId, v);
      return v;
    };

    /**
     * Clamp a strikecraft arrival to available slots. Returns the number of
     * ships that fit; overflow ships are refunded to the owning faction's
     * treasury (point_cost each) as a safety-net "return to producer" rule.
     */
    const clampStrikecraftArrival = async (
      fleetId: string, ship: MiniShipType, wantQty: number, ownerClass: string,
    ): Promise<number> => {
      if (!isStrikecraft(ship) || isAiOwner(ownerClass)) return wantQty;
      const cap = await loadStrikeCap(fleetId);
      const cost = strikeSlotCost(ship.class);
      const maxByFighter = cost.fighter > 0 ? Math.max(0, Math.floor(cap.fighter_free / cost.fighter)) : Infinity;
      const maxByGunship = cost.gunship > 0 ? Math.max(0, Math.floor(cap.gunship_free / cost.gunship)) : Infinity;
      const fit = Math.max(0, Math.min(wantQty, maxByFighter, maxByGunship));
      cap.fighter_free -= cost.fighter * fit;
      cap.gunship_free -= cost.gunship * fit;
      const overflow = wantQty - fit;
      if (overflow > 0) {
        // Refund to owning faction treasury.
        const { data: factRows } = await (supabase as any)
          .from("game_factions")
          .select("id, treasury, factions:faction_id(code_name)")
          .eq("game_id", gameId);
        const owner = ((factRows as any[]) || []).find(f =>
          ownerMatchesFaction(ownerClass, String(f.factions?.code_name || ""))
        );
        const refund = overflow * ship.point_cost;
        if (owner && refund > 0) {
          await (supabase as any)
            .from("game_factions")
            .update({ treasury: (Number(owner.treasury) || 0) + refund })
            .eq("id", owner.id);
        }
        ctx.logs.push({
          game_id: gameId, turn_number: currentTurn, phase: "economy",
          log_type: "strikecraft_overflow_refund",
          message: `${overflow}× ${ship.class} could not dock (capacity full); refunded ₡${refund} to ${ownerClass}.`,
          details_json: { fleet_id: fleetId, ship_type_id: ship.id, overflow, refund_credits: refund },
        });
      }
      return fit;
    };

    // ── 1. Advance per-system queues ────────────────────────────────
    const { data: queueRows } = await (supabase as any)
      .from("system_ship_production")
      .select("*")
      .eq("game_id", gameId)
      .order("system_id", { ascending: true })
      .order("position", { ascending: true });

    const allQueue: any[] = queueRows || [];

    // Group by system, advance each system independently.
    const bySystem = new Map<number, any[]>();
    for (const r of allQueue) {
      const arr = bySystem.get(r.system_id) || [];
      arr.push(r);
      bySystem.set(r.system_id, arr);
    }

    const completedItems: Array<{
      row: any;
      ship: MiniShipType;
      ownerClass: string;
      systemHex: { x: number; y: number };
    }> = [];

    for (const [sysId, rows] of bySystem) {
      const sys = mapState.systems.get(sysId);
      if (!sys) continue;
      // Total capacity from built facilities
      let capacity = 0;
      for (const f of sys.facilities || []) {
        const ft = facilityTypes.find(t => String(t.id) === String(f.facility_type_id));
        const c = Number((ft as any)?.ship_build_capacity) || 0;
        if (c > 0) capacity += c * (f.quantity || 1);
      }
      if (capacity <= 0) continue;

      // System hex
      const sysHex = Array.from(mapState.hexes.values()).find(h => h.hex_id === sys.hex_id);
      if (!sysHex) continue;

      let remainingCap = capacity;
      for (const row of rows) {
        if (remainingCap <= 0) break;
        const ship = shipTypes.get(row.ship_type_id);
        if (!ship) continue;

        const spend = Math.min(remainingCap, row.points_remaining);
        const newRemaining = row.points_remaining - spend;
        remainingCap -= spend;

        if (newRemaining <= 0) {
          // Completed — delete row, queue for destination resolution
          await (supabase as any)
            .from("system_ship_production")
            .delete().eq("id", row.id);
          completedItems.push({
            row,
            ship,
            ownerClass: row.owner_classification || sys.owner || "",
            systemHex: { x: sysHex.x, y: sysHex.y },
          });
        } else {
          await (supabase as any)
            .from("system_ship_production")
            .update({ points_remaining: newRemaining })
            .eq("id", row.id);
        }
      }
    }

    // ── 2. Resolve completed ships → fleet or transit ───────────────
    // Helper: find a destination fleet (or reroute to nearest garrison)
    const findDestFleet = (destId: string | null, ownerClass: string, fromX: number, fromY: number): any | null => {
      if (destId) {
        const f = mapState.fleets.find(x => x.fleet_id === destId);
        if (f) return f;
      }
      // Reroute: nearest garrison of same owner
      const garrisons = mapState.fleets.filter(f =>
        ownerMatchesFaction((f as any).owner_classification, ownerClass)
      );
      if (garrisons.length === 0) return null;
      let best: any = null;
      let bestD = Infinity;
      for (const g of garrisons) {
        const d = distHex(fromX, fromY, g.hex_x, g.hex_y);
        if (d < bestD) { bestD = d; best = g; }
      }
      return best;
    };

    for (const item of completedItems) {
      const { row, ship, ownerClass, systemHex } = item;

      // ── New-fleet build: destination_fleet_id is null → spawn a new fleet at the picked hex
      if (!row.destination_fleet_id) {
        const destX = (row.destination_hex_x ?? null) !== null ? row.destination_hex_x : systemHex.x;
        const destY = (row.destination_hex_y ?? null) !== null ? row.destination_hex_y : systemHex.y;

        // Generate a fleet name; use the system as the source of identity.
        const sysName = mapState.systems.get(row.system_id)?.system_name ?? `System #${row.system_id}`;
        const fleetName = `${sysName} Detachment`;

        const { data: newFleetRow, error: nfErr } = await (supabase as any)
          .from("game_fleets")
          .insert({
            game_id: gameId,
            owner_classification: ownerClass,
            fleet_name: fleetName,
            hex_x: destX,
            hex_y: destY,
            system_id: row.system_id,
            is_garrison: false,
          })
          .select("id")
          .single();

        if (nfErr || !newFleetRow) {
          ctx.logs.push({
            game_id: gameId, turn_number: currentTurn, phase: "economy",
            log_type: "ship_built_stranded",
            message: `Built ${row.quantity} ship(s) at ${sysName} but new-fleet creation failed.`,
            details_json: { row, error: nfErr?.message },
          });
          continue;
        }

        const inserts = Array.from({ length: row.quantity }, () => ({
          game_fleet_id: newFleetRow.id,
          ship_type_id: ship.id,
          quantity: 1,
          tactical_group: "Core",
          current_hp: null,
          crippled: false,
        }));
        if (inserts.length > 0) {
          await (supabase as any).from("game_fleet_ships").insert(inserts);
        }
        ctx.logs.push({
          game_id: gameId, turn_number: currentTurn, phase: "economy",
          log_type: "ship_built_new_fleet",
          message: `${row.quantity}× new ship(s) commissioned as "${fleetName}" at (${destX}, ${destY}).`,
          details_json: { fleet_id: newFleetRow.id, ship_type_id: ship.id, quantity: row.quantity },
        });
        continue;
      }

      const dest = findDestFleet(row.destination_fleet_id, ownerClass, systemHex.x, systemHex.y);
      if (!dest) {
        ctx.logs.push({
          game_id: gameId, turn_number: currentTurn, phase: "economy",
          log_type: "ship_built_stranded",
          message: `Built ${row.quantity} ship(s) at system #${row.system_id} but no destination fleet/garrison exists; ships lost.`,
          details_json: { row },
        });
        continue;
      }
      const dist = distHex(systemHex.x, systemHex.y, dest.hex_x, dest.hex_y);
      // AI strikecraft (fighters/gunships) teleport to their destination
      // fleet regardless of distance — no transit, arrive same turn.
      const aiStrikeTeleport = isStrikecraft(ship) && isAiOwner(ownerClass);
      // Player strikecraft also arrive instantly when BOTH the producing
      // planet and the destination fleet sit inside the faction's supply
      // grid — supply logistics ferry them across the network.
      const supplyStrikeTeleport = isStrikecraft(ship)
        && !aiStrikeTeleport
        && hexInSupply(ownerClass, systemHex.x, systemHex.y)
        && hexInSupply(ownerClass, dest.hex_x, dest.hex_y);
      if (aiStrikeTeleport || supplyStrikeTeleport || dist <= ship.map_speed) {
        // Clamp strikecraft to destination fleet's free capacity; overflow refunded.
        const fitQty = await clampStrikecraftArrival(dest.fleet_id, ship, row.quantity, ownerClass);
        // Insert directly into game_fleet_ships — one row per ship for HP tracking.
        const inserts = Array.from({ length: fitQty }, () => ({
          game_fleet_id: dest.fleet_id,
          ship_type_id: ship.id,
          quantity: 1,
          tactical_group: "Core",
          current_hp: null,
          crippled: false,
        }));
        if (inserts.length > 0) {
          await (supabase as any).from("game_fleet_ships").insert(inserts);
        }
        ctx.logs.push({
          game_id: gameId, turn_number: currentTurn, phase: "economy",
          log_type: "ship_built_arrived",
          message: `${row.quantity}× new ship(s) joined ${dest.fleet_name || "fleet"} at (${dest.hex_x}, ${dest.hex_y}).`,
          details_json: { fleet_id: dest.fleet_id, ship_type_id: ship.id, quantity: row.quantity },
        });
      } else {
        // Enter virtual transit
        await (supabase as any).from("ships_in_transit").insert({
          game_id: gameId,
          owner_classification: ownerClass,
          ship_type_id: ship.id,
          quantity: row.quantity,
          destination_fleet_id: dest.fleet_id,
          origin_system_id: row.system_id,
          virt_x: systemHex.x,
          virt_y: systemHex.y,
          created_turn: currentTurn,
        });
        ctx.logs.push({
          game_id: gameId, turn_number: currentTurn, phase: "economy",
          log_type: "ship_built_in_transit",
          message: `${row.quantity}× ship(s) built at system #${row.system_id}; in virtual transit toward ${dest.fleet_name || "fleet"}.`,
          details_json: { from: systemHex, to: { x: dest.hex_x, y: dest.hex_y }, dist, ship_type_id: ship.id },
        });
      }
    }

    // ── 3. Advance existing in-transit rows ─────────────────────────
    const { data: transitRows } = await (supabase as any)
      .from("ships_in_transit")
      .select("*")
      .eq("game_id", gameId);

    for (const t of (transitRows || [])) {
      const ship = shipTypes.get(t.ship_type_id);
      if (!ship) continue;
      const dest = findDestFleet(t.destination_fleet_id, t.owner_classification, t.virt_x, t.virt_y);
      if (!dest) {
        ctx.logs.push({
          game_id: gameId, turn_number: currentTurn, phase: "economy",
          log_type: "transit_stranded",
          message: `Transit ${t.quantity}× ship(s) has no destination; holding at (${t.virt_x}, ${t.virt_y}).`,
          details_json: { transit_id: t.id },
        });
        continue;
      }
      // Step map_speed times toward dest's current hex
      let cx = t.virt_x, cy = t.virt_y;
      let stepsLeft = ship.map_speed;
      while (stepsLeft > 0 && (cx !== dest.hex_x || cy !== dest.hex_y)) {
        const n = stepToward(cx, cy, dest.hex_x, dest.hex_y);
        cx = n.x; cy = n.y;
        stepsLeft--;
      }
      if (cx === dest.hex_x && cy === dest.hex_y) {
        const fitQty = await clampStrikecraftArrival(dest.fleet_id, ship, t.quantity, t.owner_classification);
        const inserts = Array.from({ length: fitQty }, () => ({
          game_fleet_id: dest.fleet_id,
          ship_type_id: ship.id,
          quantity: 1,
          tactical_group: "Core",
          current_hp: null,
          crippled: false,
        }));
        if (inserts.length > 0) {
          await (supabase as any).from("game_fleet_ships").insert(inserts);
        }
        await (supabase as any).from("ships_in_transit").delete().eq("id", t.id);
        ctx.logs.push({
          game_id: gameId, turn_number: currentTurn, phase: "economy",
          log_type: "ship_arrived",
          message: `${t.quantity}× ship(s) arrived at ${dest.fleet_name || "fleet"}.`,
          details_json: { fleet_id: dest.fleet_id, ship_type_id: ship.id, quantity: t.quantity },
        });
      } else {
        const newDestId = dest.fleet_id !== t.destination_fleet_id ? dest.fleet_id : t.destination_fleet_id;
        await (supabase as any)
          .from("ships_in_transit")
          .update({ virt_x: cx, virt_y: cy, destination_fleet_id: newDestId })
          .eq("id", t.id);
      }
    }
  },
};
