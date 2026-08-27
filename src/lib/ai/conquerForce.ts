/**
 * conquer force analysis.
 *
 * Given a target enemy system, works out:
 *   1. The KNOWN garrison strength (from the AI faction's intel). If the
 *      system has never been seen, we assume DEFAULT_UNKNOWN_GARRISON.
 *   2. The ground invasion troops the assault needs — INVASION_RATIO
 *      (1.25x) the known/assumed garrison, rounded up.
 *   3. A combat budget in points sized to overmatch the system's orbital
 *      and surface defenses.
 *   4. The cheapest set of troop-carrying hulls that delivers the
 *      required invasion capacity.
 *
 * Pure decision helpers — the caller queues production and debits.
 */

export const DEFAULT_UNKNOWN_GARRISON = 6;
export const INVASION_RATIO = 1.25;
/** Multiplier applied to estimated defensive strength for the warship budget. */
export const COMBAT_OVERMATCH = 1.5;
/** Never send a token force. */
export const MIN_COMBAT_BUDGET = 150;

export interface ConquerShipType {
  id: string;
  name: string;
  hull_class: string;
  point_cost: number;
  ground_invasion: number;
}

export interface TroopShipPick {
  ship_type_id: string;
  ship_name: string;
  hull_class: string;
  point_cost: number;
  ground_invasion: number;
  hull_sort: number;
}

export interface ConquerAssessment {
  garrison: number;
  garrison_known: boolean;
  required_troops: number;
  defense_estimate: number;
  combat_budget: number;
  troop_ships: TroopShipPick[];
  troop_capacity: number;
  troop_cost: number;
  troop_shortfall: number;
  reason: string;
}

/** Rough defensive strength of a system in "points"-ish units. */
export function estimateDefensePower(sys: any): number {
  const garrison = Number(sys?.current_ground_defenses) || 0;
  const fighters = ((sys?.stationed_fighters as any[]) || []).reduce(
    (a, s) => a + (Number(s.quantity) || 0), 0,
  );
  const gunships = ((sys?.stationed_gunships as any[]) || []).reduce(
    (a, s) => a + (Number(s.quantity) || 0), 0,
  );
  const isStarbase = String(sys?.system_type || "") === "starbase";
  return garrison * 5 + fighters * 10 + gunships * 15 + (isStarbase ? 100 : 0);
}

/**
 * Cheapest-per-troop greedy pick of troop hulls covering `requiredTroops`.
 * Deterministic: sorted by cost-per-troop asc, then cost asc, then id.
 */
export function selectTroopShips(
  shipTypes: ConquerShipType[],
  requiredTroops: number,
  hullSortByCode: Map<string, number>,
): { picks: TroopShipPick[]; capacity: number; cost: number } {
  const carriers = shipTypes
    .filter((s) => (Number(s.ground_invasion) || 0) > 0)
    .sort(
      (a, b) =>
        (a.point_cost || 0) / (a.ground_invasion || 1) -
          (b.point_cost || 0) / (b.ground_invasion || 1) ||
        (a.point_cost || 0) - (b.point_cost || 0) ||
        String(a.id).localeCompare(String(b.id)),
    );
  const picks: TroopShipPick[] = [];
  let capacity = 0;
  let cost = 0;
  if (carriers.length === 0 || requiredTroops <= 0) return { picks, capacity, cost };

  const MAX_TROOP_SHIPS = 20;
  while (capacity < requiredTroops && picks.length < MAX_TROOP_SHIPS) {
    const remaining = requiredTroops - capacity;
    // Prefer the cheapest hull that still covers the remainder; otherwise
    // the most efficient hull available.
    const exact = carriers
      .filter((c) => (Number(c.ground_invasion) || 0) >= remaining)
      .sort(
        (a, b) =>
          (a.point_cost || 0) - (b.point_cost || 0) ||
          String(a.id).localeCompare(String(b.id)),
      )[0];
    const chosen = exact || carriers[0];
    picks.push({
      ship_type_id: chosen.id,
      ship_name: chosen.name,
      hull_class: chosen.hull_class,
      point_cost: Number(chosen.point_cost) || 0,
      ground_invasion: Number(chosen.ground_invasion) || 0,
      hull_sort: hullSortByCode.get(chosen.hull_class) ?? 0,
    });
    capacity += Number(chosen.ground_invasion) || 0;
    cost += Number(chosen.point_cost) || 0;
  }
  return { picks, capacity, cost };
}

/** Full force assessment for a conquer plan. */
export function assessConquerForce(
  sys: any,
  garrisonKnown: boolean,
  shipTypes: ConquerShipType[],
  hullSortByCode: Map<string, number>,
): ConquerAssessment {
  const garrison = garrisonKnown
    ? Math.max(0, Number(sys?.current_ground_defenses) || 0)
    : DEFAULT_UNKNOWN_GARRISON;
  const requiredTroops = Math.max(1, Math.ceil(garrison * INVASION_RATIO));

  const defenseEstimate = garrisonKnown
    ? estimateDefensePower(sys)
    : estimateDefensePower({ ...sys, current_ground_defenses: DEFAULT_UNKNOWN_GARRISON });
  const combatBudget = Math.max(
    MIN_COMBAT_BUDGET,
    Math.ceil(defenseEstimate * COMBAT_OVERMATCH),
  );

  const { picks, capacity, cost } = selectTroopShips(shipTypes, requiredTroops, hullSortByCode);

  return {
    garrison,
    garrison_known: garrisonKnown,
    required_troops: requiredTroops,
    defense_estimate: defenseEstimate,
    combat_budget: combatBudget,
    troop_ships: picks,
    troop_capacity: capacity,
    troop_cost: cost,
    troop_shortfall: Math.max(0, requiredTroops - capacity),
    reason: picks.length === 0 ? "no_troop_capable_hulls" : "ok",
  };
}
