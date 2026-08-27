/**
 * bolster_defense execution helper.
 *
 * Given a target system, decides the defensive investment for this turn:
 *   1. Draft garrison up to MAX_DRAFT_PER_TURN while below capacity and
 *      affordable (cost = ground_force_replacement_cost each).
 *   2. If the garrison is already at capacity, start ONE defense facility
 *      (highest ground_defense_bonus affordable) that raises capacity,
 *      respecting max_per_system and counting facilities already in
 *      production.
 *
 * Pure decision function — the caller applies mutations and debits.
 */
import type { SystemData } from "@/lib/mapTypes";
import type { DbFacilityType } from "@/hooks/useFacilityTypes";
import { DEFAULT_TURN_CONSTANTS } from "@/lib/turnEngine";

export const MAX_DRAFT_PER_TURN = 3;

export interface BolsterDecision {
  draft: number;
  draft_cost: number;
  facility: DbFacilityType | null;
  facility_cost: number;
  total_cost: number;
  reason: string;
}

export function decideBolsterDefense(
  sys: SystemData,
  facilityTypes: DbFacilityType[],
  treasury: number,
): BolsterDecision {
  const none = (reason: string): BolsterDecision => ({
    draft: 0, draft_cost: 0, facility: null, facility_cost: 0, total_cost: 0, reason,
  });

  const cur = Number(sys.current_ground_defenses) || 0;
  const max = Number(sys.max_ground_defenses) || 0;
  const draftCost = DEFAULT_TURN_CONSTANTS.ground_force_replacement_cost;

  const gap = Math.max(0, max - cur);
  if (gap > 0) {
    const affordable = draftCost > 0 ? Math.floor(treasury / draftCost) : gap;
    const draft = Math.min(gap, MAX_DRAFT_PER_TURN, affordable);
    if (draft <= 0) return none("garrison_gap_unaffordable");
    return {
      draft,
      draft_cost: draft * draftCost,
      facility: null,
      facility_cost: 0,
      total_cost: draft * draftCost,
      reason: "drafted_garrison",
    };
  }

  // At capacity → raise the ceiling with a defense facility.
  const isStarbase = (sys as any).system_type === "starbase";
  const countAt = (ftId: string) => {
    const built = (sys.facilities || [])
      .filter((f: any) => String(f.facility_type_id) === ftId)
      .reduce((a: number, f: any) => a + (Number(f.quantity) || 1), 0);
    const queued = (sys.facilities_in_production || [])
      .filter((f: any) => String(f.facility_type_id) === ftId).length;
    return built + queued;
  };

  const candidates = facilityTypes
    .filter((ft) => (Number(ft.ground_defense_bonus) || 0) > 0)
    .filter((ft) => {
      const allowed = (ft.allowed_on || "both").toLowerCase();
      return allowed === "both" || allowed === (isStarbase ? "starbase" : "planet");
    })
    .filter((ft) => {
      const cap = Number(ft.max_per_system) || 0;
      return cap <= 0 || countAt(String(ft.id)) < cap;
    })
    .filter((ft) => (Number(ft.cost) || 0) <= treasury)
    .sort(
      (a, b) =>
        (Number(b.ground_defense_bonus) || 0) - (Number(a.ground_defense_bonus) || 0) ||
        (Number(a.cost) || 0) - (Number(b.cost) || 0) ||
        String(a.id).localeCompare(String(b.id)),
    );

  const ft = candidates[0];
  if (!ft) return none("at_capacity_no_affordable_facility");
  const cost = Math.max(0, Number(ft.cost) || 0);
  return {
    draft: 0,
    draft_cost: 0,
    facility: ft,
    facility_cost: cost,
    total_cost: cost,
    reason: "queued_defense_facility",
  };
}
