/**
 * Shared Turn Engine — processes a single "Next Turn" for a planet/system.
 * Designed for reuse in both Planet Testing and the main game engine.
 */

import { SystemData, SystemFacility, StationedStrikecraft } from "./mapTypes";
import { DbFacilityType } from "@/hooks/useFacilityTypes";

export interface ShipTypeForUpkeep {
  id: string;
  name: string;
  class: string;
  maintenance: number;
}

export interface TurnConstants {
  pop_and_resource_tribute: number;
  pop_or_resources_tribute: number;
  ground_force_replacement_cost: number;
}

export const DEFAULT_TURN_CONSTANTS: TurnConstants = {
  pop_and_resource_tribute: 1,
  pop_or_resources_tribute: 0.5,
  ground_force_replacement_cost: 2,
};

/**
 * Population change process — single-step input/output.
 *
 * Input: planet condition, morale, and current_population.
 * Output: updated morale and current_population for one tick.
 *
 * Step A (morale): morale moves 1/4 of the way toward condition.
 * Step B (population): population moves 1/4 of the way toward the new morale.
 *
 * This is the canonical population tick used by both the economy phase and
 * the colonization seed (so a freshly colonized planet immediately runs one
 * tick on the same turn it falls).
 */
export interface PopulationStepInput {
  condition: number;
  morale: number;
  current_population: number;
}
export interface PopulationStepOutput {
  morale: number;
  current_population: number;
}
export function applyPopulationStep(input: PopulationStepInput): PopulationStepOutput {
  const condition = Number(input.condition) || 0;
  const morale0 = Number(input.morale) || 0;
  const pop0 = Number(input.current_population) || 0;
  const morale = Math.round(morale0 + (condition - morale0) / 4);
  const current_population = Math.round(pop0 + (morale - pop0) / 4);
  return { morale, current_population };
}

export interface TurnResult {
  planet: SystemData;
  income: number;
  tributeBreakdown: {
    baseTribute: number;
    facilityFlatBonus: number;
    facilityPercentMultiplier: number;
    totalTribute: number;
  };
  upkeepBreakdown: {
    facilityMaintenance: number;
    fighterUpkeep: number;
    gunshipUpkeep: number;
    groundForceReplacement: number;
    totalUpkeep: number;
  };
  completedFacilities: string[]; // names of facilities completed this turn
}

/**
 * Find a facility type by ID, handling string/number mismatch.
 */
function findFT(facilityTypes: DbFacilityType[], id: string | number): DbFacilityType | undefined {
  return facilityTypes.find(
    (t) => String(t.id) === String(id)
  );
}

/**
 * Calculate the figured condition value (initial_condition + facility bonuses).
 */
function calculateCondition(planet: SystemData, facilityTypes: DbFacilityType[]): number {
  let bonus = 0;
  for (const f of planet.facilities || []) {
    const ft = findFT(facilityTypes, f.facility_type_id);
    if (ft?.condition_bonus) bonus += ft.condition_bonus * f.quantity;
  }
  return planet.initial_condition + bonus;
}

/**
 * Calculate max ground defenses from facility bonuses.
 */
function calculateMaxGroundDefenses(planet: SystemData, facilityTypes: DbFacilityType[]): number {
  let total = 0;
  for (const f of planet.facilities || []) {
    const ft = findFT(facilityTypes, f.facility_type_id);
    if (ft?.ground_defense_bonus) total += ft.ground_defense_bonus * f.quantity;
  }
  return total;
}

/**
 * Process one turn for a single planet.
 *
 * Steps (in order):
 *  0. Income -= cost of newly started facilities (already deducted when added to production)
 *  1. All facilities in production: turns_remaining -= 1
 *  2. Completed facilities (turns_remaining == 0) → added to built, consumed facility removed
 *  3. Recalculate figured characteristics (condition, etc.)
 *  4. Simulated events impact (placeholder)
 *  5. Morale += (Condition - Morale) / 4
 *  6. Population += (Morale - Population) / 4
 *  7. Tribute calculation
 *  8. Upkeep calculation
 *  9. Ground force replacement
 * 10. Income += Tribute
 * 11. Income -= Upkeep
 */
export function processNextTurn(
  planet: SystemData,
  facilityTypes: DbFacilityType[],
  constants: TurnConstants,
  currentIncome: number,
  shipTypes: ShipTypeForUpkeep[],
): TurnResult {
  let income = currentIncome;
  const completedFacilities: string[] = [];
  let p = { ...planet };

  // --- Step 0: Cost of new production is deducted when items are added (handled in UI) ---

  // --- Step 1: Decrement turns_remaining for the head of the build queue only.
  // Builds are sequential: subsequent items wait until the one ahead completes.
  let inProd = (p.facilities_in_production || []).map((fip, idx) => ({
    ...fip,
    turns_remaining: idx === 0 ? fip.turns_remaining - 1 : fip.turns_remaining,
  }));

  // --- Step 2: Complete facilities at 0 turns ---
  const completed = inProd.filter((fip) => fip.turns_remaining <= 0);
  const remaining = inProd.filter((fip) => fip.turns_remaining > 0);

  let facilities: SystemFacility[] = [...(p.facilities || [])];

  for (const done of completed) {
    const ft = findFT(facilityTypes, done.facility_type_id);
    completedFacilities.push(ft?.name || `Facility #${done.facility_type_id}`);

    // Add to built facilities
    const existingIdx = facilities.findIndex(
      (f) => f.facility_type_id === done.facility_type_id
    );
    if (existingIdx >= 0) {
      facilities[existingIdx] = {
        ...facilities[existingIdx],
        quantity: facilities[existingIdx].quantity + 1,
      };
    } else {
      facilities.push({ facility_type_id: done.facility_type_id, quantity: 1 });
    }

    // Remove one consumed facility if required
    if (ft?.consumed_facility_id) {
      const consumedId = Number(ft.consumed_facility_id) || (ft.consumed_facility_id as any);
      const cIdx = facilities.findIndex(
        (f) => String(f.facility_type_id) === String(consumedId) || f.facility_type_id === consumedId
      );
      if (cIdx >= 0) {
        if (facilities[cIdx].quantity <= 1) {
          facilities.splice(cIdx, 1);
        } else {
          facilities[cIdx] = { ...facilities[cIdx], quantity: facilities[cIdx].quantity - 1 };
        }
      }
    }
  }

  p.facilities = facilities;
  p.facilities_in_production = remaining;

  // --- Step 3: Recalculate figured characteristics ---
  p.condition = calculateCondition(p, facilityTypes);
  const figuredMaxGD = calculateMaxGroundDefenses(p, facilityTypes);

  // --- Step 4: Simulated events (placeholder) ---
  // TODO: apply one-time planet events here

  // --- Steps 5-6: Population change process (morale → population) ---
  const popStep = applyPopulationStep({
    condition: p.condition,
    morale: p.morale,
    current_population: p.current_population,
  });
  p.morale = popStep.morale;
  p.current_population = popStep.current_population;

  // --- Step 7: Tribute calculation ---
  // 7a: Base tribute
  const pop = p.current_population;
  const res = p.resources;
  const baseTribute =
    Math.min(pop, res) * constants.pop_and_resource_tribute +
    Math.abs(pop - res) * constants.pop_or_resources_tribute;

  // 7b: Facility flat tribute bonuses
  let facilityFlatBonus = 0;
  for (const f of p.facilities || []) {
    const ft = findFT(facilityTypes, f.facility_type_id);
    if (ft?.tribute_flat) facilityFlatBonus += ft.tribute_flat * f.quantity;
  }

  // 7c: Facility tribute percentage multiplier
  let tributePercentSum = 0;
  for (const f of p.facilities || []) {
    const ft = findFT(facilityTypes, f.facility_type_id);
    if (ft?.tribute_percent) tributePercentSum += ft.tribute_percent * f.quantity;
  }
  const facilityPercentMultiplier = 1 + tributePercentSum / 100;

  const totalTribute = Math.round((baseTribute + facilityFlatBonus) * facilityPercentMultiplier);
  p.tribute = totalTribute;

  // --- Step 8: Upkeep calculation ---
  let facilityMaintenance = 0;
  for (const f of p.facilities || []) {
    const ft = findFT(facilityTypes, f.facility_type_id);
    if (ft?.maintenance) facilityMaintenance += ft.maintenance * f.quantity;
  }

  // Fighter and gunship upkeep from stationed strikecraft using actual ship maintenance
  let fighterUpkeep = 0;
  for (const sf of p.stationed_fighters || []) {
    const ship = shipTypes.find((s) => s.id === sf.ship_type_id);
    if (ship) fighterUpkeep += ship.maintenance * sf.quantity;
  }
  let gunshipUpkeep = 0;
  for (const sg of p.stationed_gunships || []) {
    const ship = shipTypes.find((s) => s.id === sg.ship_type_id);
    if (ship) gunshipUpkeep += ship.maintenance * sg.quantity;
  }

  // --- Step 9: Ground force replacement ---
  let groundForceReplacement = 0;
  if (p.current_ground_defenses < figuredMaxGD) {
    const deficit = figuredMaxGD - p.current_ground_defenses;
    const replenish = Math.ceil(deficit / 2);
    p.current_ground_defenses = Math.min(
      p.current_ground_defenses + replenish,
      figuredMaxGD
    );
    groundForceReplacement = replenish * constants.ground_force_replacement_cost;
  }

  const totalUpkeep = facilityMaintenance + fighterUpkeep + gunshipUpkeep + groundForceReplacement;
  p.upkeep = totalUpkeep;

  // --- Step 10 & 11: Income ---
  income += totalTribute;
  income -= totalUpkeep;

  return {
    planet: p,
    income,
    tributeBreakdown: {
      baseTribute: Math.round(baseTribute),
      facilityFlatBonus,
      facilityPercentMultiplier,
      totalTribute,
    },
    upkeepBreakdown: {
      facilityMaintenance,
      fighterUpkeep,
      gunshipUpkeep,
      groundForceReplacement,
      totalUpkeep,
    },
    completedFacilities,
  };
}
