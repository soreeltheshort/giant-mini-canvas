/**
 * Phase 2b — Plan builder.
 *
 * For each slot in a committed slate, resolve one concrete target and an
 * estimated cost/feasibility, persist as `ai_plans` rows, and emit
 * decision-log breadcrumbs.
 *
 * Callers:
 *   - src/lib/turnProcessor/phases/aiPlans.ts   (commit=true, per turn)
 *   - src/components/admin/ai/AIInspector.tsx  (dry-run + explicit commit)
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { MapState } from "@/lib/mapTypes";
import { computeWorldview, type WorldviewDims } from "./worldview";
import { TARGET_SELECTORS, type PlanCtx, type SelectedTarget } from "./targetSelectors";
import { estimateCost, type CostEstimate } from "./planCost";
import type { PersonaTraits } from "./scoreGoals";

export interface BuildPlansArgs {
  supabase: SupabaseClient;
  gameId: string;
  currentTurn: number;
  mapState: MapState;
  playerFactionId: string;   // game_factions.id
  commit: boolean;
}

export interface BoundPlanPreview {
  slot: number;
  goal_id: string | null;
  goal_code: string;
  target_kind: string;
  target_id: string | null;
  target_label: string;
  estimated_cost_credits: number;
  estimated_cost_turns: number;
  feasibility: number;
  feasibility_reason: string;
  action: "created" | "updated" | "superseded_and_replaced" | "achieved" | "unchanged";
  scoring_breakdown: Record<string, any>;
}

export interface BuildPlansResult {
  playerFactionId: string;
  factionCode: string;
  currentTurn: number;
  plans: BoundPlanPreview[];
  committed: boolean;
}

export async function buildPlansForFaction(args: BuildPlansArgs): Promise<BuildPlansResult | null> {
  const { supabase, gameId, currentTurn, mapState, playerFactionId, commit } = args;

  const { data: gf } = await (supabase as any)
    .from("game_factions")
    .select("id, treasury, is_ai, ai_persona_id, faction_id, factions:faction_id(code_name, ai_persona_id)")
    .eq("id", playerFactionId)
    .maybeSingle();
  if (!gf) return null;
  const factionCode: string = gf.factions?.code_name || "";
  const personaId: string | null = gf.ai_persona_id || gf.factions?.ai_persona_id || null;
  if (!personaId) return null;

  const { data: personaRow } = await (supabase as any)
    .from("ai_personas")
    .select("id, aggression, expansionism, economic_focus, risk_tolerance, loyalty, paranoia, diplomacy")
    .eq("id", personaId)
    .maybeSingle();
  if (!personaRow) return null;
  const persona = personaRow as PersonaTraits & { id: string };

  const { data: slateRow } = await (supabase as any)
    .from("ai_goal_slates")
    .select("*")
    .eq("game_id", gameId)
    .eq("player_id", playerFactionId)
    .maybeSingle();
  if (!slateRow) return { playerFactionId, factionCode, currentTurn, plans: [], committed: false };

  const slotIds = [slateRow.slot1_goal_id, slateRow.slot2_goal_id, slateRow.slot3_goal_id];
  const nonNullIds = slotIds.filter(Boolean) as string[];
  const { data: slotGoals } = await (supabase as any)
    .from("ai_goals")
    .select("id, slate_slot, goal_type, outcome, status")
    .in("id", nonNullIds.length ? nonNullIds : ["00000000-0000-0000-0000-000000000000"]);
  const goalById = new Map<string, any>();
  for (const g of slotGoals || []) goalById.set(g.id, g);

  // Load fleets + relationships + beliefs to compute worldview identically to slate.
  const [{ data: fleets }, { data: shipRows }, { data: shipTypes }, { data: rels }, { data: beliefs }] = await Promise.all([
    (supabase as any).from("game_fleets").select("id, hex_x, hex_y, owner_classification").eq("game_id", gameId),
    (supabase as any).from("game_fleet_ships").select("game_fleet_id, ship_type_id"),
    (supabase as any).from("ship_types").select("id, point_cost"),
    (supabase as any).from("ai_relationships").select("target_player_id, opinion, derived_class").eq("game_id", gameId).eq("player_id", playerFactionId),
    (supabase as any).from("ai_world_beliefs").select("belief_key, value_json, turn_number").eq("game_id", gameId).eq("player_id", playerFactionId).in("belief_key", ["enemy_strength_total", "enemy_strength_nearby"]).lte("turn_number", currentTurn).order("turn_number", { ascending: false }),
  ]);

  const pointById = new Map<string, number>();
  for (const s of shipTypes || []) pointById.set(s.id, Number(s.point_cost) || 0);
  const shipsByFleet = new Map<string, number>();
  for (const r of shipRows || []) {
    shipsByFleet.set(r.game_fleet_id, (shipsByFleet.get(r.game_fleet_id) || 0) + (pointById.get(r.ship_type_id) || 0));
  }

  const ownFleets: PlanCtx["ownFleets"] = [];
  const hostileFleets: PlanCtx["hostileFleets"] = [];
  for (const f of fleets || []) {
    const owner = (f.owner_classification || "").trim();
    const isOwn = owner && (owner === factionCode || owner === factionCode.toUpperCase());
    if (isOwn) ownFleets.push({ id: f.id, hex_x: f.hex_x, hex_y: f.hex_y, point_cost: shipsByFleet.get(f.id) || 0 });
    else if (owner && owner !== "UNCONTROLLED") hostileFleets.push({ id: f.id, hex_x: f.hex_x, hex_y: f.hex_y, owner });
  }

  const beliefMap = new Map<string, number>();
  for (const b of beliefs || []) if (!beliefMap.has(b.belief_key)) beliefMap.set(b.belief_key, Number((b.value_json as any)?.points) || 0);

  const { dims: worldview } = computeWorldview({
    gameId, factionCode, playerFactionId, currentTurn, mapState, ownFleets: ownFleets.map((f) => ({ ...f, owner: factionCode })), hostileFleets,
    treasury: Number(gf.treasury) || 0,
    relationships: (rels || []).map((r: any) => ({ target_player_id: r.target_player_id, opinion: Number(r.opinion) || 0, derived_class: r.derived_class })),
    beliefs: { enemy_strength_total: beliefMap.get("enemy_strength_total") || 0, enemy_strength_nearby: beliefMap.get("enemy_strength_nearby") || 0 },
    priorSnapshot: null,
  });

  const systemHexById = new Map<number, { x: number; y: number }>();
  const hexes = (mapState as any).hexes;
  if (hexes && typeof hexes.get === "function") {
    for (const sys of mapState.systems.values()) {
      const h = hexes.get(sys.hex_id);
      if (h) systemHexById.set(sys.system_id, { x: h.x, y: h.y });
    }
  } else {
    for (const sys of mapState.systems.values()) systemHexById.set(sys.system_id, { x: 0, y: 0 });
  }

  const planCtx: PlanCtx = {
    factionCode,
    playerFactionId,
    mapState,
    worldview: worldview as WorldviewDims,
    persona,
    ownFleets,
    hostileFleets,
    relationships: (rels || []).map((r: any) => ({ target_player_id: r.target_player_id, opinion: Number(r.opinion) || 0, derived_class: r.derived_class })),
    systemHexById,
  };

  // Existing active plans keyed by (slate_slot)
  const { data: existingPlans } = await (supabase as any)
    .from("ai_plans")
    .select("id, slate_slot, goal_id, target_kind, target_id, status")
    .eq("game_id", gameId)
    .eq("player_id", playerFactionId)
    .eq("status", "active");
  const existingBySlot = new Map<number, any>();
  for (const p of existingPlans || []) if (p.slate_slot != null) existingBySlot.set(p.slate_slot, p);

  const previews: BoundPlanPreview[] = [];
  const logRows: any[] = [];
  const inserts: any[] = [];
  const updates: Array<{ id: string; patch: any }> = [];
  const superseded: string[] = [];
  const achieved: string[] = [];

  for (let slot = 1; slot <= 3; slot++) {
    const goalId = slotIds[slot - 1] as string | null;
    const goal = goalId ? goalById.get(goalId) : null;
    const goalCode: string = goal?.goal_type || "";
    const existing = existingBySlot.get(slot);

    // Slot marked achieved upstream — flip matching plan.
    if (goal && goal.outcome && goal.outcome !== "pending" && existing && existing.goal_id === goalId) {
      achieved.push(existing.id);
      previews.push({
        slot, goal_id: goalId, goal_code: goalCode,
        target_kind: existing.target_kind || "none", target_id: existing.target_id, target_label: "(achieved)",
        estimated_cost_credits: 0, estimated_cost_turns: 0, feasibility: 0, feasibility_reason: "ok",
        action: "achieved", scoring_breakdown: {},
      });
      continue;
    }

    if (!goalId || !goalCode) continue;

    const selector = TARGET_SELECTORS[goalCode];
    const selected: SelectedTarget = selector
      ? selector(planCtx) ?? { target_kind: "none", target_id: null, target_label: "—", score: 0, breakdown: { reason: "selector_null" } }
      : { target_kind: "none", target_id: null, target_label: "—", score: 0, breakdown: { reason: "no_selector" } };

    const cost: CostEstimate = estimateCost(goalCode, selected, planCtx, Number(gf.treasury) || 0);

    const targetChanged = existing && (existing.goal_id !== goalId || existing.target_id !== selected.target_id || existing.target_kind !== selected.target_kind);
    let action: BoundPlanPreview["action"];
    if (!existing) action = "created";
    else if (targetChanged) action = "superseded_and_replaced";
    else action = "updated";

    const payload = {
      game_id: gameId,
      player_id: playerFactionId,
      goal_id: goalId,
      slate_slot: slot,
      target_kind: selected.target_kind,
      target_id: selected.target_id,
      target_label: selected.target_label,
      estimated_cost_credits: cost.estimated_cost_credits,
      estimated_cost_turns: cost.estimated_cost_turns,
      feasibility: cost.feasibility,
      feasibility_reason: cost.feasibility_reason,
      committed_turn: currentTurn,
      created_turn: currentTurn,
      status: "active",
      rationale: `${goalCode} → ${selected.target_label} (feas ${cost.feasibility})`,
      scoring_breakdown_json: { selector_score: selected.score, ...selected.breakdown },
    };

    if (action === "created") inserts.push(payload);
    else if (action === "superseded_and_replaced") {
      superseded.push(existing.id);
      inserts.push(payload);
    } else {
      // updated in place
      updates.push({
        id: existing.id,
        patch: {
          target_kind: payload.target_kind,
          target_id: payload.target_id,
          target_label: payload.target_label,
          estimated_cost_credits: payload.estimated_cost_credits,
          estimated_cost_turns: payload.estimated_cost_turns,
          feasibility: payload.feasibility,
          feasibility_reason: payload.feasibility_reason,
          scoring_breakdown_json: payload.scoring_breakdown_json,
          rationale: payload.rationale,
        },
      });
    }

    previews.push({
      slot, goal_id: goalId, goal_code: goalCode,
      target_kind: selected.target_kind, target_id: selected.target_id, target_label: selected.target_label,
      estimated_cost_credits: cost.estimated_cost_credits, estimated_cost_turns: cost.estimated_cost_turns,
      feasibility: cost.feasibility, feasibility_reason: cost.feasibility_reason,
      action, scoring_breakdown: payload.scoring_breakdown_json,
    });

    logRows.push({
      game_id: gameId,
      player_id: playerFactionId,
      turn_number: currentTurn,
      phase: "plans",
      summary: `P${slot} plan_bound: ${goalCode} → ${selected.target_label} (feas ${cost.feasibility}, ${cost.feasibility_reason})`,
      details_json: {
        slot, goal_code: goalCode, action,
        target: { kind: selected.target_kind, id: selected.target_id, label: selected.target_label },
        cost: { credits: cost.estimated_cost_credits, turns: cost.estimated_cost_turns },
        feasibility: cost.feasibility, feasibility_reason: cost.feasibility_reason,
        breakdown: payload.scoring_breakdown_json,
      },
    });
  }

  if (!commit) return { playerFactionId, factionCode, currentTurn, plans: previews, committed: false };

  if (superseded.length) await (supabase as any).from("ai_plans").update({ status: "superseded", updated_at: new Date().toISOString() }).in("id", superseded);
  if (achieved.length) await (supabase as any).from("ai_plans").update({ status: "achieved", updated_at: new Date().toISOString() }).in("id", achieved);
  for (const u of updates) await (supabase as any).from("ai_plans").update(u.patch).eq("id", u.id);
  if (inserts.length) await (supabase as any).from("ai_plans").insert(inserts);
  if (logRows.length) await (supabase as any).from("ai_decision_log").insert(logRows);

  return { playerFactionId, factionCode, currentTurn, plans: previews, committed: true };
}
