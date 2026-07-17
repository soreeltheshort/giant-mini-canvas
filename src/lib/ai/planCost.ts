/**
 * Phase 2b — Plan Cost & Feasibility estimator.
 *
 * Uniform estimator across goals. Advisory only in this phase — plans can
 * be recorded with feasibility < 1 and status 'active'; Phase 3 decides
 * whether to actually spend orders on them.
 */
import type { PlanCtx, SelectedTarget } from "./targetSelectors";

export type FeasibilityReason =
  | "ok"
  | "no_target"
  | "insufficient_power"
  | "insufficient_credits"
  | "blocked_by_range";

export interface CostEstimate {
  estimated_cost_credits: number;
  estimated_cost_turns: number;
  feasibility: number;          // 0..1
  feasibility_reason: FeasibilityReason;
}

const CREDITS_PER_SHIP_POINT = 5;
const CREDITS_PER_ECON_STEP = 40;
const CREDITS_PER_DEFENSE_STEP = 30;
const CREDITS_PER_COLONY = 200;
const BUILD_LEAD_TURNS = 2;
const EFFECTIVE_MAP_SPEED = 3;

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function distanceToTarget(ctx: PlanCtx, targetSystemId: number): number {
  const t = ctx.systemHexById.get(targetSystemId);
  if (!t) return 0;
  let best = Number.MAX_SAFE_INTEGER;
  for (const own of ctx.ownFleets) {
    const dq = own.hex_x - t.x, dr = own.hex_y - t.y;
    // approximate axial hex distance
    const d = (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
    if (d < best) best = d;
  }
  return Number.isFinite(best) ? best : 0;
}

export function estimateCost(
  goalCode: string,
  selected: SelectedTarget,
  ctx: PlanCtx,
  treasury: number,
): CostEstimate {
  if (selected.target_kind === "none") {
    return { estimated_cost_credits: 0, estimated_cost_turns: 0, feasibility: 0, feasibility_reason: "no_target" };
  }

  const targetSysId = selected.target_kind === "system" ? Number(selected.target_id) : null;
  const distance = targetSysId ? distanceToTarget(ctx, targetSysId) : 0;
  const turnsFromDistance = Math.ceil(distance / EFFECTIVE_MAP_SPEED);

  let credits = 0;
  let turns = 0;
  let feasibility = 1;
  let reason: FeasibilityReason = "ok";

  switch (goalCode) {
    case "colonize": {
      credits = CREDITS_PER_COLONY;
      turns = turnsFromDistance + BUILD_LEAD_TURNS;
      break;
    }
    case "expand_economy": {
      credits = CREDITS_PER_ECON_STEP * 3;
      turns = BUILD_LEAD_TURNS + 2;
      break;
    }
    case "enhance_offense": {
      credits = CREDITS_PER_SHIP_POINT * 30;
      turns = BUILD_LEAD_TURNS + 3;
      break;
    }
    case "bolster_defense": {
      credits = CREDITS_PER_DEFENSE_STEP * 2;
      turns = BUILD_LEAD_TURNS + 1;
      break;
    }
    case "degrade_enemy": {
      credits = CREDITS_PER_SHIP_POINT * 20;
      turns = turnsFromDistance + BUILD_LEAD_TURNS;
      break;
    }
    case "conquer": {
      const defense = Number(selected.breakdown.defense_power || 0);
      const ownPower = Number(selected.breakdown.effective_power || 0);
      credits = Math.max(CREDITS_PER_SHIP_POINT * 40, defense * 8);
      turns = turnsFromDistance + BUILD_LEAD_TURNS + 1;
      if (ownPower < defense * 2) {
        feasibility = clamp01(ownPower / Math.max(1, defense * 2));
        if (feasibility < 0.35) reason = "insufficient_power";
      }
      if (distance > 6) reason = "blocked_by_range";
      break;
    }
    default:
      break;
  }

  if (reason === "ok" && treasury < credits) {
    feasibility = Math.min(feasibility, clamp01(treasury / Math.max(1, credits)));
    if (feasibility < 0.5) reason = "insufficient_credits";
  }

  return {
    estimated_cost_credits: Math.round(credits),
    estimated_cost_turns: Math.max(0, Math.round(turns)),
    feasibility: Number(feasibility.toFixed(3)),
    feasibility_reason: reason,
  };
}
