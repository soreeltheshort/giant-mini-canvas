/**
 * Phase 2a — Goal scoring.
 *
 * Deterministic scoring of the 6 goal codes in goalCatalog against a persona
 * and a worldview fingerprint. Returns a sorted list; the slate builder takes
 * the top 3.
 *
 * Formula:
 *   score = base_weight * urgency_multiplier * traitFactor * relFactor * beliefFactor
 *
 * Per-goal trait formulas (documented at each branch below).
 */
import { GOAL_CODES } from "./goalCatalog";
import type { WorldviewDims } from "./worldview";

export interface PersonaTraits {
  aggression: number;
  expansionism: number;
  economic_focus: number;
  risk_tolerance: number;
  loyalty: number;
  paranoia: number;
  diplomacy: number;
}

export interface GoalWeight {
  goal_type: string;
  base_weight: number;
  urgency_multiplier: number;
}

export interface ScoredGoal {
  goal_code: string;
  score: number;
  breakdown: {
    base: number;
    urgency: number;
    trait: number;
    relationship: number;
    belief: number;
  };
}

function traitFactor(code: string, p: PersonaTraits): number {
  switch (code) {
    case "colonize":         return 1 + p.expansionism * 0.8;
    case "expand_economy":   return 1 + p.economic_focus * 0.9;
    case "enhance_offense":  return 1 + p.aggression * 0.7 + p.risk_tolerance * 0.3;
    case "bolster_defense":  return Math.max(0.1, 1 + p.paranoia * 0.9 - p.risk_tolerance * 0.3);
    case "degrade_enemy":    return 1 + p.aggression * 0.5 + p.paranoia * 0.4;
    case "conquer":          return Math.max(0.1, 1 + p.aggression * 0.8 + p.expansionism * 0.4 - p.diplomacy * 0.4);
    default:                 return 1;
  }
}

function relationshipFactor(code: string, dims: WorldviewDims): number {
  // Simple: if a top threat exists, conquer/degrade_enemy get a modest bump;
  // bolster_defense reacts to at_war_count.
  switch (code) {
    case "conquer":
    case "degrade_enemy":
      return dims.top_threat_player_id ? 1.25 : 0.85;
    case "bolster_defense":
      return 1 + Math.min(1.5, dims.at_war_count * 0.4);
    default:
      return 1;
  }
}

function beliefFactor(code: string, dims: WorldviewDims): number {
  const nearby = dims.enemy_strength_nearby;
  const total = dims.enemy_strength_total;
  switch (code) {
    case "bolster_defense":
      // scales strongly with nearby threat + frontier pressure
      return 1 + Math.min(3, nearby / 200) + Math.min(1.5, dims.frontier_pressure * 0.3);
    case "enhance_offense":
      return 1 + Math.min(2, total / 400);
    case "colonize":
    case "expand_economy":
      // safer environments prefer economy/colonization
      return nearby > 0 ? 0.7 : 1.2;
    case "conquer":
      return dims.top_threat_player_id ? 1 + Math.min(1.5, total / 400) : 0.8;
    case "degrade_enemy":
      return dims.top_threat_player_id ? 1.3 : 0.7;
    default:
      return 1;
  }
}

export function scoreGoals(
  persona: PersonaTraits,
  weights: GoalWeight[],
  dims: WorldviewDims,
): ScoredGoal[] {
  const wByCode = new Map<string, GoalWeight>();
  for (const w of weights) wByCode.set(w.goal_type, w);

  const scored: ScoredGoal[] = [];
  for (const code of GOAL_CODES) {
    const w = wByCode.get(code) ?? { goal_type: code, base_weight: 1, urgency_multiplier: 1 };
    const base = w.base_weight;
    const urgency = w.urgency_multiplier;
    const trait = traitFactor(code, persona);
    const rel = relationshipFactor(code, dims);
    const belief = beliefFactor(code, dims);
    const score = base * urgency * trait * rel * belief;
    scored.push({ goal_code: code, score, breakdown: { base, urgency, trait, relationship: rel, belief } });
  }
  scored.sort((a, b) =>
    b.score - a.score ||
    (wByCode.get(b.goal_code)?.base_weight ?? 0) - (wByCode.get(a.goal_code)?.base_weight ?? 0) ||
    a.goal_code.localeCompare(b.goal_code)
  );
  return scored;
}
