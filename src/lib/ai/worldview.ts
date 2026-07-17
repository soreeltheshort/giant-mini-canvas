/**
 * Phase 2a — Worldview fingerprint.
 *
 * Pure function that compresses "what does the AI know about the world right
 * now" into a small, comparable bag of scalars. Slate revision compares the
 * current fingerprint against the one captured at slate commit time; any
 * dimension whose delta exceeds the persona-tuned tolerance forces a re-plan.
 */
import type { MapState, SystemData } from "@/lib/mapTypes";
import type { PlayerCtx } from "@/lib/turnProcessor/types";
import { offsetToCube, cubeDistance } from "@/lib/hexUtils";
import { ownerMatchesFaction } from "@/lib/factionUtils";

export interface WorldviewDims {
  owned_systems_count: number;
  treasury_band: number;         // 0..4
  fleet_power_band: number;      // 0..4
  frontier_pressure: number;     // count
  top_threat_player_id: string | null;
  relationship_shift_max: number; // reserved (0 without prior snapshot)
  lost_system_this_window: boolean;
  at_war_count: number;
  enemy_strength_total: number;
  enemy_strength_nearby: number;
}

export interface WorldviewResult {
  dims: WorldviewDims;
  hash: string;
}

export interface WorldviewInputs {
  gameId: string;
  factionCode: string;
  playerFactionId: string; // game_factions.id
  currentTurn: number;
  mapState: MapState;
  ownFleets: Array<{ id: string; hex_x: number; hex_y: number; owner: string; point_cost: number }>;
  hostileFleets: Array<{ id: string; hex_x: number; hex_y: number; owner: string }>;
  treasury: number;
  relationships: Array<{ target_player_id: string; opinion: number; derived_class: string }>;
  beliefs: { enemy_strength_total: number; enemy_strength_nearby: number };
  priorSnapshot?: WorldviewDims | null;
  priorCommittedTurn?: number;
  systemOwnershipHistory?: Array<{ system_id: number; owner_since_turn: number }>;
}

function toBand(v: number): number {
  if (v <= 100) return 0;
  if (v <= 500) return 1;
  if (v <= 2000) return 2;
  if (v <= 10000) return 3;
  return 4;
}

// stable stringify + tiny hash (djb2-ish) — no crypto dep in browser bundle.
function stableHash(obj: unknown): string {
  const s = JSON.stringify(obj, Object.keys(obj as any).sort());
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(16);
}

export function computeWorldview(inp: WorldviewInputs): WorldviewResult {
  const { mapState, factionCode, ownFleets, hostileFleets, treasury, relationships, beliefs, priorSnapshot, priorCommittedTurn, currentTurn } = inp;

  // Owned systems
  const ownedSystems: SystemData[] = [];
  for (const sys of mapState.systems.values()) {
    if (ownerMatchesFaction(sys.owner, factionCode)) ownedSystems.push(sys);
  }
  const owned_systems_count = ownedSystems.length;

  const treasury_band = toBand(treasury);
  const fleetPower = ownFleets.reduce((s, f) => s + (f.point_cost || 0), 0);
  const fleet_power_band = toBand(fleetPower);

  // Frontier pressure — owned systems within 2 hex of any hostile system or hostile fleet
  const hexById = new Map<number, { x: number; y: number }>();
  for (const h of mapState.hexes.values()) hexById.set(h.hex_id, { x: h.x, y: h.y });

  const hostileHexes: Array<[number, number, number]> = [];
  for (const sys of mapState.systems.values()) {
    if (!sys.owner || sys.owner === "" || sys.owner === "UNCONTROLLED") continue;
    if (ownerMatchesFaction(sys.owner, factionCode)) continue;
    const h = hexById.get(sys.hex_id);
    if (h) hostileHexes.push(offsetToCube(h.x, h.y));
  }
  for (const f of hostileFleets) {
    hostileHexes.push(offsetToCube(f.hex_x, f.hex_y));
  }

  let frontier_pressure = 0;
  for (const sys of ownedSystems) {
    const h = hexById.get(sys.hex_id);
    if (!h) continue;
    const [cx, cy, cz] = offsetToCube(h.x, h.y);
    let close = false;
    for (const [ox, oy, oz] of hostileHexes) {
      if (cubeDistance(cx, cy, cz, ox, oy, oz) <= 2) { close = true; break; }
    }
    if (close) frontier_pressure += 1;
  }

  // Top threat = most-negative opinion
  let top: { id: string; opinion: number } | null = null;
  for (const r of relationships) {
    if (top === null || r.opinion < top.opinion) top = { id: r.target_player_id, opinion: r.opinion };
  }
  const top_threat_player_id = top && top.opinion < 0 ? top.id : null;

  // relationship_shift_max is 0 without deeper history; a proper implementation
  // would diff opinions vs the snapshot. Reserved for a later slice.
  const relationship_shift_max = 0;

  // at_war_count = enemy-classified relationships
  const at_war_count = relationships.filter((r) => r.derived_class === "enemy").length;

  // lost_system_this_window: any owned system's owner_since_turn > priorCommittedTurn
  // Data isn't tracked in the systems JSON today, so we approximate: if the
  // owned_systems_count DROPPED relative to the prior snapshot, treat as loss.
  let lost_system_this_window = false;
  if (priorSnapshot && typeof priorCommittedTurn === "number") {
    if (owned_systems_count < priorSnapshot.owned_systems_count) lost_system_this_window = true;
  }
  // (systemOwnershipHistory hook reserved for a future upgrade.)
  void inp.systemOwnershipHistory; void currentTurn;

  const dims: WorldviewDims = {
    owned_systems_count,
    treasury_band,
    fleet_power_band,
    frontier_pressure,
    top_threat_player_id,
    relationship_shift_max,
    lost_system_this_window,
    at_war_count,
    enemy_strength_total: Math.round(beliefs.enemy_strength_total || 0),
    enemy_strength_nearby: Math.round(beliefs.enemy_strength_nearby || 0),
  };

  return { dims, hash: stableHash(dims) };
}

/**
 * Per-dimension tolerance check. Returns the list of dim names that changed
 * beyond persona-modulated tolerance. `traitFactor` is `1 + 0.6*loyalty - 0.6*paranoia`
 * clamped to [0.25, 3]; wider trait -> wider tolerance -> less revision.
 */
export interface ToleranceBreach {
  dim: keyof WorldviewDims;
  from: unknown;
  to: unknown;
}

const BASE_TOL = {
  owned_systems_count: 1,        // integer delta ± 1
  treasury_band: 1,              // band step
  fleet_power_band: 1,
  frontier_pressure: 2,
  relationship_shift_max: 0.25,
  at_war_count: 1,
} as const;

export function diffTolerances(
  prev: WorldviewDims,
  next: WorldviewDims,
  persona: { loyalty: number; paranoia: number; enemy_strength_total_tolerance_pct?: number; enemy_strength_nearby_tolerance_pct?: number },
): ToleranceBreach[] {
  const traitFactor = Math.max(0.25, Math.min(3, 1 + 0.6 * (persona.loyalty ?? 0.5) - 0.6 * (persona.paranoia ?? 0.5)));
  const breaches: ToleranceBreach[] = [];

  const num = (k: keyof typeof BASE_TOL) => {
    const tol = (BASE_TOL[k] as number) * traitFactor;
    const p = (prev[k] as number) ?? 0;
    const n = (next[k] as number) ?? 0;
    if (Math.abs(n - p) > tol) breaches.push({ dim: k, from: p, to: n });
  };
  num("owned_systems_count");
  num("treasury_band");
  num("fleet_power_band");
  num("frontier_pressure");
  num("at_war_count");

  if (prev.top_threat_player_id !== next.top_threat_player_id) {
    breaches.push({ dim: "top_threat_player_id", from: prev.top_threat_player_id, to: next.top_threat_player_id });
  }

  const totalTol = persona.enemy_strength_total_tolerance_pct ?? 0.15;
  const nearbyTol = persona.enemy_strength_nearby_tolerance_pct ?? 0.25;
  const deltaPct = (a: number, b: number) => Math.abs(a - b) / Math.max(b, 1);
  if (deltaPct(next.enemy_strength_total, prev.enemy_strength_total) >= totalTol) {
    breaches.push({ dim: "enemy_strength_total", from: prev.enemy_strength_total, to: next.enemy_strength_total });
  }
  if (deltaPct(next.enemy_strength_nearby, prev.enemy_strength_nearby) >= nearbyTol) {
    breaches.push({ dim: "enemy_strength_nearby", from: prev.enemy_strength_nearby, to: next.enemy_strength_nearby });
  }

  return breaches;
}

export function commitmentTurns(persona: { loyalty: number; paranoia: number }): number {
  const raw = Math.round(4 + 8 * (persona.loyalty ?? 0.5) - 4 * (persona.paranoia ?? 0.5));
  return Math.max(3, Math.min(12, raw));
}

export { stableHash };
