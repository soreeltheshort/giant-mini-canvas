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

export interface ComposerResult {
  template_id: string;
  template_name: string;
  template_points: number;
  budget_points: number;
  ships: ComposerShip[]; // one entry per ship (quantity expanded), big-first
}

export async function composeFleetFromTemplates(
  supabase: SupabaseClient,
  factionId: string,
  budgetPoints: number,
  hullSortByCode: Map<string, number>,
): Promise<ComposerResult | null> {
  // 1. Templates eligible to this faction (universal = no tags).
  const [{ data: tagRows }, { data: fleetRows }] = await Promise.all([
    (supabase as any).from("fleet_faction_tags").select("fleet_id, faction_id"),
    (supabase as any).from("fleets").select("id, name"),
  ]);

  const tagsByFleet = new Map<string, Set<string>>();
  for (const r of (tagRows as any[]) || []) {
    const set = tagsByFleet.get(r.fleet_id) || new Set<string>();
    set.add(r.faction_id);
    tagsByFleet.set(r.fleet_id, set);
  }

  const eligibleFleetIds: string[] = [];
  for (const fl of (fleetRows as any[]) || []) {
    const tags = tagsByFleet.get(fl.id);
    if (!tags) eligibleFleetIds.push(fl.id); // universal fallback
    else if (tags.has(factionId)) eligibleFleetIds.push(fl.id);
  }
  if (eligibleFleetIds.length === 0) return null;

  // 2. Load compositions and ship type costs.
  const [{ data: shipRows }, { data: shipTypes }] = await Promise.all([
    (supabase as any)
      .from("fleet_ships")
      .select("fleet_id, ship_type_id, quantity")
      .in("fleet_id", eligibleFleetIds),
    (supabase as any)
      .from("ship_types")
      .select("id, ship_name, point_cost, hull_class"),
  ]);

  const shipTypeById = new Map<string, any>();
  for (const s of (shipTypes as any[]) || []) shipTypeById.set(s.id, s);

  // 3. Compute total point cost per template.
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
        ship_name: st.ship_name,
        hull_sort: hullSortByCode.get(st.hull_class) ?? 0,
      });
    }
    aggByFleet.set(r.fleet_id, agg);
  }

  const candidates = Array.from(aggByFleet.values()).filter((c) => c.ships.length > 0);
  if (candidates.length === 0) return null;

  // 4. Pick template closest to budget. Deterministic tie-break: smaller
  //    fleet first, then fleet_id lex.
  candidates.sort((a, b) => {
    const da = Math.abs(a.total_points - budgetPoints);
    const db = Math.abs(b.total_points - budgetPoints);
    return da - db || a.total_points - b.total_points || a.fleet_id.localeCompare(b.fleet_id);
  });
  const chosen = candidates[0];

  // 5. Order ships big-first.
  chosen.ships.sort(
    (a, b) => b.hull_sort - a.hull_sort || b.point_cost - a.point_cost || a.ship_type_id.localeCompare(b.ship_type_id),
  );

  return {
    template_id: chosen.fleet_id,
    template_name: chosen.name,
    template_points: chosen.total_points,
    budget_points: budgetPoints,
    ships: chosen.ships,
  };
}
