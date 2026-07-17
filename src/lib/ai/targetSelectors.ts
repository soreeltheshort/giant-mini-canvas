/**
 * Phase 2b — Target Selectors.
 *
 * One pure function per goal code. Read-only over the snapshot data the
 * slate builder already loaded. Deterministic: ties broken by system_id
 * / player_id ascending so identical inputs always yield identical output.
 */
import type { MapState, SystemData } from "@/lib/mapTypes";
import { ownerMatchesFaction } from "@/lib/factionUtils";
import type { WorldviewDims } from "./worldview";
import type { PersonaTraits } from "./scoreGoals";

export type TargetKind = "system" | "player" | "fleet" | "none";

export interface SelectedTarget {
  target_kind: TargetKind;
  target_id: string | null;   // system_id (as string) | player_id | fleet_id
  target_label: string;
  score: number;
  breakdown: Record<string, number | string>;
}

export interface PlanCtx {
  factionCode: string;
  playerFactionId: string;
  mapState: MapState;
  worldview: WorldviewDims;
  persona: PersonaTraits;
  ownFleets: Array<{ id: string; hex_x: number; hex_y: number; point_cost: number }>;
  hostileFleets: Array<{ id: string; hex_x: number; hex_y: number; owner: string }>;
  relationships: Array<{ target_player_id: string; opinion: number; derived_class: string }>;
  systemHexById: Map<number, { x: number; y: number }>;
}

// ---------- Helpers ----------

function ownedSystems(ctx: PlanCtx): SystemData[] {
  const out: SystemData[] = [];
  for (const sys of ctx.mapState.systems.values()) {
    if (ownerMatchesFaction(sys.owner, ctx.factionCode)) out.push(sys);
  }
  return out.sort((a, b) => a.system_id - b.system_id);
}

function hexDistance(ax: number, ay: number, bx: number, by: number): number {
  // Odd-r offset → cube coords → distance
  const toCube = (x: number, y: number) => {
    const q = x - (y - (y & 1)) / 2;
    const r = y;
    return { x: q, y: -q - r, z: r };
  };
  const A = toCube(ax, ay), B = toCube(bx, by);
  return Math.max(Math.abs(A.x - B.x), Math.abs(A.y - B.y), Math.abs(A.z - B.z));
}

function distanceBetweenSystems(ctx: PlanCtx, aId: number, bId: number): number {
  const a = ctx.systemHexById.get(aId), b = ctx.systemHexById.get(bId);
  if (!a || !b) return Number.MAX_SAFE_INTEGER;
  return hexDistance(a.x, a.y, b.x, b.y);
}

function productionScore(sys: SystemData): number {
  return (sys.resources || 0) + (sys.current_population || 0) * 0.1 + (sys.facilities?.length || 0) * 2;
}

function defensePower(sys: SystemData): number {
  const gd = sys.current_ground_defenses || 0;
  const fighters = (sys.stationed_fighters || []).reduce((a, s) => a + s.quantity, 0);
  const gunships = (sys.stationed_gunships || []).reduce((a, s) => a + s.quantity, 0);
  return gd * 10 + fighters * 3 + gunships * 5;
}

// ---------- Per-goal selectors ----------

export function selectColonize(ctx: PlanCtx): SelectedTarget | null {
  const owned = ownedSystems(ctx);
  if (owned.length === 0) return null;
  const candidates: Array<{ sys: SystemData; dist: number; pop: number }> = [];
  for (const sys of ctx.mapState.systems.values()) {
    if (!sys.owner || sys.owner === "" || sys.owner === "UNCONTROLLED") {
      let best = Number.MAX_SAFE_INTEGER;
      for (const own of owned) {
        const d = distanceBetweenSystems(ctx, own.system_id, sys.system_id);
        if (d < best) best = d;
      }
      candidates.push({ sys, dist: best, pop: sys.current_population || 0 });
    }
  }
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => a.dist - b.dist || b.pop - a.pop || a.sys.system_id - b.sys.system_id);
  const winner = candidates[0];
  return {
    target_kind: "system",
    target_id: String(winner.sys.system_id),
    target_label: winner.sys.system_name,
    score: 1 / (winner.dist + 1) + winner.pop * 0.01,
    breakdown: { distance: winner.dist, population: winner.pop, candidates: candidates.length },
  };
}

export function selectExpandEconomy(ctx: PlanCtx): SelectedTarget | null {
  const owned = ownedSystems(ctx);
  if (owned.length === 0) return null;
  const scores = owned.map((s) => ({ sys: s, prod: productionScore(s) }));
  const median = scores.map((s) => s.prod).sort((a, b) => a - b)[Math.floor(scores.length / 2)];
  const under = scores.filter((s) => s.prod <= median);
  if (under.length === 0) {
    return { target_kind: "none", target_id: null, target_label: "—", score: 0, breakdown: { reason: "no_below_median" } };
  }
  under.sort((a, b) => a.prod - b.prod || a.sys.system_id - b.sys.system_id);
  const w = under[0];
  return {
    target_kind: "system",
    target_id: String(w.sys.system_id),
    target_label: w.sys.system_name,
    score: (median - w.prod) + 1,
    breakdown: { production: w.prod, empire_median: median },
  };
}

export function selectEnhanceOffense(ctx: PlanCtx): SelectedTarget | null {
  const owned = ownedSystems(ctx);
  if (owned.length === 0) return null;
  const sorted = owned.slice().sort((a, b) => productionScore(b) - productionScore(a) || a.system_id - b.system_id);
  const w = sorted[0];
  return {
    target_kind: "system",
    target_id: String(w.system_id),
    target_label: w.system_name,
    score: productionScore(w),
    breakdown: { production: productionScore(w), hubs_considered: owned.length },
  };
}

export function selectBolsterDefense(ctx: PlanCtx): SelectedTarget | null {
  const owned = ownedSystems(ctx);
  if (owned.length === 0) return null;
  // Frontier adjacency = hostile fleet within 2 hexes
  const scored = owned.map((s) => {
    const hex = ctx.systemHexById.get(s.system_id);
    let adj = 0;
    if (hex) for (const hf of ctx.hostileFleets) if (hexDistance(hex.x, hex.y, hf.hex_x, hf.hex_y) <= 2) adj++;
    return { sys: s, defense: defensePower(s), frontier: adj };
  });
  scored.sort((a, b) => a.defense - b.defense || b.frontier - a.frontier || a.sys.system_id - b.sys.system_id);
  const w = scored[0];
  return {
    target_kind: "system",
    target_id: String(w.sys.system_id),
    target_label: w.sys.system_name,
    score: 1 / (w.defense + 1) + w.frontier,
    breakdown: { defense_power: w.defense, frontier_adjacency: w.frontier },
  };
}

export function selectDegradeEnemy(ctx: PlanCtx): SelectedTarget | null {
  if (ctx.worldview.top_threat_player_id) {
    return {
      target_kind: "player",
      target_id: ctx.worldview.top_threat_player_id,
      target_label: ctx.worldview.top_threat_player_id.slice(0, 8),
      score: 1,
      breakdown: { source: "top_threat" },
    };
  }
  const rels = ctx.relationships.slice().sort((a, b) => a.opinion - b.opinion || a.target_player_id.localeCompare(b.target_player_id));
  const w = rels[0];
  if (!w) return { target_kind: "none", target_id: null, target_label: "—", score: 0, breakdown: { reason: "no_relationships" } };
  return {
    target_kind: "player",
    target_id: w.target_player_id,
    target_label: w.target_player_id.slice(0, 8),
    score: -w.opinion,
    breakdown: { source: "most_hated", opinion: w.opinion },
  };
}

export function selectConquer(ctx: PlanCtx): SelectedTarget | null {
  const owned = ownedSystems(ctx);
  if (owned.length === 0) return null;

  // Own strike power = sum of point_cost across own fleets, adjusted by risk tolerance.
  const ownStrikePower = ctx.ownFleets.reduce((a, f) => a + f.point_cost, 0);
  const riskAdj = 1 + (ctx.persona.risk_tolerance ?? 0.5) * 0.5;
  const effectivePower = ownStrikePower * riskAdj;

  const candidates: Array<{ sys: SystemData; dist: number; defense: number }> = [];
  for (const sys of ctx.mapState.systems.values()) {
    if (!sys.owner || sys.owner === "UNCONTROLLED") continue;
    if (ownerMatchesFaction(sys.owner, ctx.factionCode)) continue;
    // Adjacency check — within 2 hex of any owned system
    let best = Number.MAX_SAFE_INTEGER;
    for (const own of owned) {
      const d = distanceBetweenSystems(ctx, own.system_id, sys.system_id);
      if (d < best) best = d;
    }
    if (best > 3) continue;
    candidates.push({ sys, dist: best, defense: defensePower(sys) });
  }

  if (candidates.length === 0) {
    return { target_kind: "none", target_id: null, target_label: "—", score: 0, breakdown: { reason: "no_enemy_adjacent" } };
  }

  candidates.sort((a, b) => a.defense - b.defense || a.dist - b.dist || a.sys.system_id - b.sys.system_id);
  const w = candidates[0];
  return {
    target_kind: "system",
    target_id: String(w.sys.system_id),
    target_label: w.sys.system_name,
    score: effectivePower / (w.defense + 1),
    breakdown: { defense_power: w.defense, distance: w.dist, own_strike_power: ownStrikePower, effective_power: effectivePower },
  };
}

export const TARGET_SELECTORS: Record<string, (ctx: PlanCtx) => SelectedTarget | null> = {
  colonize: selectColonize,
  expand_economy: selectExpandEconomy,
  enhance_offense: selectEnhanceOffense,
  bolster_defense: selectBolsterDefense,
  degrade_enemy: selectDegradeEnemy,
  conquer: selectConquer,
};
