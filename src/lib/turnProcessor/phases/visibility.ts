/**
 * Visibility Phase
 *
 * Recomputes which systems each player can see. Currently uses the same baseline
 * rule used at game start: every Core system + every system in the player's own
 * province is visible. Per-player sensor-based visibility is layered on top by
 * the live PlayerGame view (useComputedVisibility) so we keep this phase
 * intentionally simple here.
 *
 * Also writes/refreshes player_system_intel rows for every currently-visible
 * system, so the player UI can render "last known state" for systems they no
 * longer see (classic 4X fog-of-war memory). Rows for systems that drop out
 * of visibility are intentionally LEFT IN PLACE — that is the memory.
 */
import type { Phase, TurnContext } from "../types";
import { buildSystemSnapshot } from "@/lib/systemIntel";
import { offsetToCube, cubeDistance, getNeighbors } from "@/lib/hexUtils";
import { hexKey } from "@/lib/mapTypes";

export const SENSOR_RADIUS = 1;

export const visibilityPhase: Phase = {
  name: "visibility",
  label: "Visibility",
  async run(ctx: TurnContext) {
    const { supabase, gameId, mapState, currentTurn, players, factions } = ctx;

    // ── Infected-faction hex ownership ──────────────────────────────────
    // Build name/code_name → infect lookup and faction_id → player_slot map
    // so we can credit "infected aura" hexes (planet hex + 6 neighbors) to
    // the player slot that controls the infected faction.
    const infectedById = new Map<string, boolean>();
    const infectedOwnerStrings = new Set<string>();
    for (const f of factions) {
      infectedById.set(f.id, !!f.infect);
      if (f.infect) {
        if (f.name) infectedOwnerStrings.add(String(f.name).toLowerCase());
        if (f.code_name) infectedOwnerStrings.add(String(f.code_name).toLowerCase());
      }
    }
    const slotByFactionId = new Map<string, number>();
    for (const p of players) {
      if (p.faction_id && p.player_slot != null) slotByFactionId.set(p.faction_id, p.player_slot);
    }
    const isInfectedOwner = (owner: string | null | undefined) =>
      !!owner && infectedOwnerStrings.has(String(owner).toLowerCase());

    // hex_id → classification (used as a fallback only)
    const hexClassById = new Map<number, string>();
    for (const h of mapState.hexes.values()) hexClassById.set(h.hex_id, h.classification);

    // A system is "ever-seen" baseline if EITHER the system's own classification
    // OR the hex it sits on is Core, an Explored March, or a Province.
    // Some maps tag the system with `classification: "MARCHES"` even though the
    // underlying hex is still `UNEXPLORED_MARCHES`, so we accept either source.
    const baselineIds: number[] = [];
    const baselineSystems = [];
    for (const sys of mapState.systems.values()) {
      const sysCls = (sys.classification || "").toUpperCase();
      const hexCls = (hexClassById.get(sys.hex_id) || "").toUpperCase();
      const isBaseline = (cls: string) =>
        cls === "CORE" || cls === "MARCHES" || cls.startsWith("PROVINCE_");
      if (isBaseline(sysCls) || isBaseline(hexCls)) {
        baselineIds.push(sys.system_id);
        baselineSystems.push(sys);
      }
    }

    // Baseline scouted hexes shared by every player: every CORE hex + every
    // explored-MARCHES hex. Province hexes are added per-player below (only
    // your own province auto-counts as scouted). Append-only: a hex only ever
    // moves from off → on, so the persisted `scouted_hex_ids` set just keeps
    // growing — no scan of the "off" flags is ever needed.
    const sharedScoutedHexIds: number[] = [];
    const provinceHexIdsBySlot = new Map<number, number[]>();
    for (const h of mapState.hexes.values()) {
      const cls = (h.classification || "").toUpperCase();
      if (cls === "CORE" || cls === "MARCHES") {
        sharedScoutedHexIds.push(h.hex_id);
      } else if (cls.startsWith("PROVINCE_")) {
        const slot = parseInt(cls.replace("PROVINCE_", ""), 10);
        if (!Number.isNaN(slot)) {
          const arr = provinceHexIdsBySlot.get(slot) || [];
          arr.push(h.hex_id);
          provinceHexIdsBySlot.set(slot, arr);
        }
      }
    }

    // Precompute hex cube coords + an offset->hex_id index, used for sensor
    // sweeps below.
    const hexList = Array.from(mapState.hexes.values());
    const hexCubes = hexList.map(h => {
      const [cx, cy, cz] = offsetToCube(h.x, h.y);
      return { id: h.hex_id, cx, cy, cz };
    });

    // Per-player sensor coverage: every hex within SENSOR_RADIUS of any owned
    // fleet or owned system gets added to scouted_hex_ids this turn. Mirrors
    // the client-side useVisibleHexKeys logic so hexes swept during
    // server-side fleet auto-movement are remembered even if the player
    // never opened the page that turn.
    const sensorCentersBySlot = new Map<number, Array<[number, number, number]>>();
    const ensureSlot = (slot: number) => {
      let arr = sensorCentersBySlot.get(slot);
      if (!arr) { arr = []; sensorCentersBySlot.set(slot, arr); }
      return arr;
    };
    const slotFromClassification = (cls: string): number | null => {
      const m = (cls || "").toUpperCase().match(/^PROVINCE_(\d+)$/);
      return m ? parseInt(m[1], 10) : null;
    };
    for (const sys of mapState.systems.values()) {
      const slot = slotFromClassification(sys.owner);
      if (slot == null) continue;
      const hex = mapState.hexes.get(`${0}`); // placeholder, replaced below
      // find hex by id
      const sysHex = hexList.find(h => h.hex_id === sys.hex_id);
      if (!sysHex) continue;
      ensureSlot(slot).push(offsetToCube(sysHex.x, sysHex.y));
    }
    for (const f of mapState.fleets ?? []) {
      const slot = slotFromClassification(f.owner_classification);
      if (slot == null) continue;
      ensureSlot(slot).push(offsetToCube(f.hex_x, f.hex_y));
    }

    const sensorHexIdsBySlot = new Map<number, number[]>();
    for (const [slot, centers] of sensorCentersBySlot.entries()) {
      const ids: number[] = [];
      for (const h of hexCubes) {
        for (const [cx, cy, cz] of centers) {
          if (cubeDistance(h.cx, h.cy, h.cz, cx, cy, cz) <= SENSOR_RADIUS) {
            ids.push(h.id);
            break;
          }
        }
      }
      sensorHexIdsBySlot.set(slot, ids);
    }

    // Merge baseline with each player's existing "ever seen" memory rather than
    // overwriting it. Otherwise systems discovered via sensor scan (e.g. a fleet
    // moving into the marches) get forgotten on turn rollover.
    for (const gp of players) {
      const priorSys = Array.isArray(gp.visible_system_ids) ? gp.visible_system_ids as number[] : [];
      const mergedSys = Array.from(new Set<number>([...priorSys, ...baselineIds]));

      const priorHex = Array.isArray(gp.scouted_hex_ids) ? gp.scouted_hex_ids as number[] : [];
      const ownProvinceHexes = gp.player_slot != null
        ? (provinceHexIdsBySlot.get(gp.player_slot) || [])
        : [];
      const sensorHexes = gp.player_slot != null
        ? (sensorHexIdsBySlot.get(gp.player_slot) || [])
        : [];
      const mergedHex = Array.from(new Set<number>([
        ...priorHex,
        ...sharedScoutedHexIds,
        ...ownProvinceHexes,
        ...sensorHexes,
      ]));


      await (supabase as any).from("game_factions")
        .update({ visible_system_ids: mergedSys, scouted_hex_ids: mergedHex })
        .eq("id", gp.id);
    }

    // Refresh fog-of-war memory: upsert intel for every system the player can
    // currently see. This includes baseline systems (Core/Provinces/Marches) AND
    // any extra systems they have ever scanned (stored in visible_system_ids
    // after the merge above — e.g. fleets that pushed sensors into the marches).
    // Without this, a system seen via a sensor sweep gets forgotten the moment
    // the fleet moves away because no snapshot was ever written.
    const systemById = new Map<number, typeof baselineSystems[number]>();
    for (const sys of mapState.systems.values()) systemById.set(sys.system_id, sys);

    const intelRows: any[] = [];
    for (const gp of players) {
      const prior = Array.isArray(gp.visible_system_ids) ? gp.visible_system_ids as number[] : [];
      const fullVisible = new Set<number>([...prior, ...baselineIds]);
      for (const sid of fullVisible) {
        const sys = systemById.get(sid);
        if (!sys) continue;
        intelRows.push({
          game_id: gameId,
          observer_player_id: gp.id,
          system_id: sys.system_id,
          last_seen_turn: currentTurn,
          snapshot_json: buildSystemSnapshot(sys),
        });
      }
    }
    if (intelRows.length > 0) {
      // Chunk to keep payloads reasonable.
      const CHUNK = 500;
      for (let i = 0; i < intelRows.length; i += CHUNK) {
        await (supabase as any)
          .from("player_system_intel")
          .upsert(intelRows.slice(i, i + CHUNK), { onConflict: "observer_player_id,system_id" });
      }
    }

    ctx.logs.push({
      game_id: gameId,
      turn_number: currentTurn,
      phase: "visibility",
      log_type: "visibility_synced",
      message: `Visibility refreshed: ${baselineIds.length} systems visible to ${players.length} player(s); intel snapshots updated.`,
      details_json: { count: baselineIds.length, players: players.length, intel_rows: intelRows.length },
    });
  },
};
