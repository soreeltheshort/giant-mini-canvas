/**
 * Battle Narration — compression process.
 *
 * Goal: turn a full battle log (snapshots + per-tick events) into a compact
 * token-efficient payload suitable for sending to an LLM, without losing
 * information needed to narrate the engagement.
 *
 * The compressor:
 *   - Strips verbose admin_explain_text and per-event payload noise.
 *   - Collapses repeated identifiers via short keys (s = ship instance,
 *     g = tactical group, t = tick, e = event_type code).
 *   - Aggregates fire_hit events into damage tallies per (attacker→target).
 *   - Keeps a canonical roster (name, group, hull) for both fleets.
 *
 * Output is plain JSON. Future step: hand it to the OpenAI hook.
 */
import type { BattleEvent, FleetSnapshot } from "./battleEngine";

export interface CompressedBattle {
  meta: {
    seed: string;
    winner: "A" | "B" | "draw";
    eventCount: number;
    tickCount: number;
  };
  fleets: {
    A: CompressedFleet;
    B: CompressedFleet;
  };
  /** Aggregated damage exchanges — one row per attacker→target ship pair. */
  exchanges: Array<{
    from: string;        // instanceId
    to: string;          // instanceId
    hits: number;
    damage: number;
    crippled: boolean;
    destroyed: boolean;
  }>;
  /** Compressed timeline of non-fire events (fire_hits are summarised above). */
  timeline: Array<{ t: number; e: string; s?: string }>;
}

interface CompressedFleet {
  name: string;
  ships: Array<{
    id: string;        // instanceId
    name: string;
    group: string;
    hull: number;
  }>;
}

/** Build per-instance ship roster matching battleEngine ordering. */
function buildRoster(snap: FleetSnapshot | undefined, fleet: "A" | "B", offset = 0) {
  const out: CompressedFleet["ships"] = [];
  if (!snap?.ships) return out;
  let counter = offset;
  for (const fs of snap.ships as any[]) {
    const qty = fs.quantity ?? 1;
    for (let i = 0; i < qty; i++) {
      out.push({
        id: `${fleet}-${counter++}`,
        name: `${fs.ship_type?.name ?? "Ship"} #${i + 1}`,
        group: fs.tactical_group ?? "Core",
        hull: fs.ship_type?.hull ?? 0,
      });
    }
  }
  return out;
}

export function compressBattle(args: {
  seed: string;
  winner: "A" | "B" | "draw";
  snapA: FleetSnapshot | undefined;
  snapB: FleetSnapshot | undefined;
  events: BattleEvent[];
}): CompressedBattle {
  const { seed, winner, snapA, snapB, events } = args;
  const shipsA = buildRoster(snapA, "A", 0);
  const shipsB = buildRoster(snapB, "B", shipsA.length);

  const exchangeMap = new Map<string, {
    from: string; to: string; hits: number; damage: number;
    crippled: boolean; destroyed: boolean;
  }>();
  const timeline: Array<{ t: number; e: string; s?: string }> = [];
  const ticks = new Set<number>();

  for (const ev of events) {
    ticks.add(ev.tick);
    if (ev.event_type === "fire_hit") {
      const p = (ev.payload_json || {}) as any;
      const from = String(p.attacker ?? p.source ?? "");
      const to = String(p.target ?? "");
      if (!from || !to) continue;
      const key = `${from}>${to}`;
      const cur = exchangeMap.get(key) || {
        from, to, hits: 0, damage: 0, crippled: false, destroyed: false,
      };
      cur.hits += 1;
      cur.damage += Number(p.actualDmg ?? p.damage ?? 0);
      if (p.crippled) cur.crippled = true;
      if (p.destroyed) cur.destroyed = true;
      exchangeMap.set(key, cur);
    } else {
      // Keep non-fire events as a tiny timeline entry.
      const p = (ev.payload_json || {}) as any;
      timeline.push({
        t: ev.tick,
        e: ev.event_type,
        s: p.subject || p.target || p.attacker || undefined,
      });
    }
  }

  return {
    meta: {
      seed,
      winner,
      eventCount: events.length,
      tickCount: ticks.size,
    },
    fleets: {
      A: { name: snapA?.name ?? "Attacker", ships: shipsA },
      B: { name: snapB?.name ?? "Defender", ships: shipsB },
    },
    exchanges: Array.from(exchangeMap.values()),
    timeline,
  };
}

/** Rough token-savings estimate (chars / 4). Cheap and good enough for UI. */
export function estimateTokens(s: string): number {
  return Math.ceil(s.length / 4);
}
