/**
 * Fleet Composer — picks the tagged saved-fleet template whose
 * `point_cost` is closest to a target budget, and returns its ship
 * composition sorted "big ships first" (by point_cost desc, then
 * hull-class sort desc).
 *
 * Templates come from `public.fleets`. Faction eligibility is a join
 * against `public.fleet_faction_tags` — a template is eligible for a
 * faction iff a row (fleet_id, faction_id) exists. Templates with NO
 * tag rows at all are treated as "universal" so a fresh install without
 * tags still functions (opt-in filtering, not opt-out).
 *
 * Pure over (SupabaseClient, factionId, budget). No side effects beyond
 * reads.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export interface ComposerShip {
  ship_type_id: string;
  hull_class: string;
  point_cost: number;
  ship_name: string;
  hull_sort: number;
}

export interface ComposerPick {
  template_id: string;
  template_name: string;
  template_points: number;
}

export interface ComposerResult {
  template_id: string; // primary (first) pick — kept for backward compat / naming
  template_name: string;
  template_points: number; // sum of all picked templates
  budget_points: number;
  picks: ComposerPick[]; // one or more templates chosen, in pick order
  ships: ComposerShip[]; // combined ships across all picks, big-first
  diagnostics?: ComposerDiagnostics;
}

export interface ComposerDiagnostics {
  faction_id: string;
  budget: number;
  total_fleets_scanned: number;
  tagged_fleet_ids: number;
  eligible_fleet_ids: number;
  ship_rows_for_eligible: number;
  ship_types_loaded: number;
  aggregated_templates: number;
  nonempty_templates: number;
  reason?: string; // populated when result is null
  read_errors?: Record<string, string>;
}

/**
 * Selection rule:
 *   1. Prefer the template whose total_points is the SMALLEST value that
 *      still meets-or-exceeds `budgetPoints` (minimal overshoot).
 *   2. If no template meets-or-exceeds the budget, take the LARGEST
 *      template and then recursively apply rule (1) against the
 *      remaining budget (budget − chosen.total_points) until either the
 *      remaining budget is satisfied by a single template or no
 *      candidates remain.
 *   Deterministic tie-break: smaller total_points, then fleet_id lex.
 */
export async function composeFleetFromTemplates(
  supabase: SupabaseClient,
  factionId: string,
  budgetPoints: number,
  hullSortByCode: Map<string, number>,
): Promise<{ result: ComposerResult | null; diagnostics: ComposerDiagnostics }> {
  const diagnostics: ComposerDiagnostics = {
    faction_id: factionId,
    budget: budgetPoints,
    total_fleets_scanned: 0,
    tagged_fleet_ids: 0,
    eligible_fleet_ids: 0,
    ship_rows_for_eligible: 0,
    ship_types_loaded: 0,
    aggregated_templates: 0,
    nonempty_templates: 0,
  };

  // 1. Templates eligible to this faction (universal = no tags).
  const [{ data: tagRows, error: tagErr }, { data: fleetRows, error: fleetErr }] = await Promise.all([
    (supabase as any).from("fleet_faction_tags").select("fleet_id, faction_id"),
    (supabase as any).from("fleets").select("id, name"),
  ]);

  const readErrors: Record<string, string> = {};
  if (tagErr?.message) readErrors.fleet_faction_tags = tagErr.message;
  if (fleetErr?.message) readErrors.fleets = fleetErr.message;

  diagnostics.total_fleets_scanned = ((fleetRows as any[]) || []).length;

  const tagsByFleet = new Map<string, Set<string>>();
  for (const r of (tagRows as any[]) || []) {
    const set = tagsByFleet.get(r.fleet_id) || new Set<string>();
    set.add(r.faction_id);
    tagsByFleet.set(r.fleet_id, set);
  }
  diagnostics.tagged_fleet_ids = tagsByFleet.size;

  const eligibleFleetIds: string[] = [];
  for (const fl of (fleetRows as any[]) || []) {
    const tags = tagsByFleet.get(fl.id);
    if (!tags) eligibleFleetIds.push(fl.id);
    else if (tags.has(factionId)) eligibleFleetIds.push(fl.id);
  }
  diagnostics.eligible_fleet_ids = eligibleFleetIds.length;
  if (eligibleFleetIds.length === 0) {
    diagnostics.reason = "no_eligible_templates_for_faction";
    return { result: null, diagnostics };
  }

  // 2. Load compositions and ship type costs.
  const [{ data: shipRows, error: shipRowsErr }, { data: shipTypes, error: shipTypesErr }] = await Promise.all([
    (supabase as any)
      .from("fleet_ships")
      .select("fleet_id, ship_type_id, quantity")
      .in("fleet_id", eligibleFleetIds),
    (supabase as any)
      .from("ship_types")
      .select("id, name, point_cost, hull_class"),
  ]);

  if (shipRowsErr?.message) readErrors.fleet_ships = shipRowsErr.message;
  if (shipTypesErr?.message) readErrors.ship_types = shipTypesErr.message;
  if (Object.keys(readErrors).length > 0) diagnostics.read_errors = readErrors;

  diagnostics.ship_rows_for_eligible = ((shipRows as any[]) || []).length;
  diagnostics.ship_types_loaded = ((shipTypes as any[]) || []).length;

  const shipTypeById = new Map<string, any>();
  for (const s of (shipTypes as any[]) || []) shipTypeById.set(s.id, s);

  interface TemplateAgg {
    fleet_id: string;
    name: string;
    total_points: number;
    ships: ComposerShip[];
  }
  const aggByFleet = new Map<string, TemplateAgg>();
  const nameById = new Map<string, string>();
  for (const fl of (fleetRows as any[]) || []) nameById.set(fl.id, fl.name);

  for (const r of (shipRows as any[]) || []) {
    const st = shipTypeById.get(r.ship_type_id);
    if (!st) continue;
    const agg = aggByFleet.get(r.fleet_id) || {
      fleet_id: r.fleet_id,
      name: nameById.get(r.fleet_id) || "",
      total_points: 0,
      ships: [],
    };
    const cost = Number(st.point_cost) || 0;
    const qty = Number(r.quantity) || 0;
    agg.total_points += cost * qty;
    for (let i = 0; i < qty; i++) {
      agg.ships.push({
        ship_type_id: st.id,
        hull_class: st.hull_class,
        point_cost: cost,
        ship_name: st.name,
        hull_sort: hullSortByCode.get(st.hull_class) ?? 0,
      });
    }
    aggByFleet.set(r.fleet_id, agg);
  }
  diagnostics.aggregated_templates = aggByFleet.size;

  const allCandidates = Array.from(aggByFleet.values()).filter((c) => c.ships.length > 0);
  diagnostics.nonempty_templates = allCandidates.length;
  if (allCandidates.length === 0) {
    diagnostics.reason =
      diagnostics.ship_rows_for_eligible === 0
        ? "eligible_templates_have_no_fleet_ships_rows"
        : "eligible_templates_have_no_resolvable_ship_types";
    return { result: null, diagnostics };
  }

  // Greedy selection per rule above.
  const picks: TemplateAgg[] = [];
  let remaining = budgetPoints;
  const MAX_PICKS = 12;

  while (picks.length < MAX_PICKS) {
    const meetsOrExceeds = allCandidates
      .filter((c) => c.total_points >= remaining)
      .sort(
        (a, b) =>
          a.total_points - b.total_points ||
          a.fleet_id.localeCompare(b.fleet_id),
      );
    if (meetsOrExceeds.length > 0) {
      picks.push(meetsOrExceeds[0]);
      break;
    }
    const largest = [...allCandidates].sort(
      (a, b) =>
        b.total_points - a.total_points ||
        a.fleet_id.localeCompare(b.fleet_id),
    )[0];
    picks.push(largest);
    remaining -= largest.total_points;
    if (remaining <= 0) break;
  }

  if (picks.length === 0) {
    diagnostics.reason = "greedy_selection_yielded_no_picks";
    return { result: null, diagnostics };
  }

  const combinedShips: ComposerShip[] = picks.flatMap((p) => p.ships);
  combinedShips.sort(
    (a, b) =>
      b.hull_sort - a.hull_sort ||
      b.point_cost - a.point_cost ||
      a.ship_type_id.localeCompare(b.ship_type_id),
  );

  const totalPoints = picks.reduce((s, p) => s + p.total_points, 0);
  const primary = picks[0];

  return {
    result: {
      template_id: primary.fleet_id,
      template_name:
        picks.length === 1
          ? primary.name
          : `${primary.name} +${picks.length - 1}`,
      template_points: totalPoints,
      budget_points: budgetPoints,
      picks: picks.map((p) => ({
        template_id: p.fleet_id,
        template_name: p.name,
        template_points: p.total_points,
      })),
      ships: combinedShips,
      diagnostics,
    },
    diagnostics,
  };
}

