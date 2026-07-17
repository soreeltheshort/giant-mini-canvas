/**
 * Phase 2a — Slate builder.
 *
 * Loads all data needed to compute a goal slate for one AI faction, decides
 * whether the slate needs a revision, and (optionally) writes the new slate
 * plus decision-log breadcrumbs back to the database.
 *
 * Callers:
 *   - src/lib/turnProcessor/phases/aiSlates.ts (commit=true, per turn)
 *   - src/components/admin/ai/AIInspector.tsx (dry-run + explicit commit)
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { MapState } from "@/lib/mapTypes";
import { computeWorldview, diffTolerances, commitmentTurns, type WorldviewDims, type ToleranceBreach } from "./worldview";
import { scoreGoals, type PersonaTraits, type ScoredGoal } from "./scoreGoals";

export type RevisionReason =
  | "initial"
  | "mandatory"
  | "lost_system"
  | "goal_resolved"
  | "tolerance"
  | "no_change";

export interface SlateComputeResult {
  playerFactionId: string;
  factionCode: string;
  currentTurn: number;
  reason: RevisionReason;
  breaches: ToleranceBreach[];
  scored: ScoredGoal[];         // full sorted list
  slate: ScoredGoal[];          // top 3
  worldview: WorldviewDims;
  committed: boolean;
  priorCommittedTurn: number | null;
  nextMandatoryReviewTurn: number;
}

export interface ComputeSlateArgs {
  supabase: SupabaseClient;
  gameId: string;
  currentTurn: number;
  mapState: MapState;
  playerFactionId: string;     // game_factions.id
  commit: boolean;
}

interface PersonaRow extends PersonaTraits {
  id: string;
  name: string;
  enemy_strength_total_tolerance_pct: number;
  enemy_strength_nearby_tolerance_pct: number;
}

export async function computeSlate(args: ComputeSlateArgs): Promise<SlateComputeResult | null> {
  const { supabase, gameId, currentTurn, mapState, playerFactionId, commit } = args;

  // 1. Load faction row + persona
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
    .select("id, name, aggression, expansionism, economic_focus, risk_tolerance, loyalty, paranoia, diplomacy, enemy_strength_total_tolerance_pct, enemy_strength_nearby_tolerance_pct")
    .eq("id", personaId)
    .maybeSingle();
  if (!personaRow) return null;
  const persona = personaRow as PersonaRow;

  // 2. Load goal weights, world beliefs, relationships, own+hostile fleets
  const [{ data: weights }, { data: beliefs }, { data: rels }, { data: fleets }, { data: shipRows }, { data: slateRow }] = await Promise.all([
    (supabase as any).from("ai_persona_goal_weights").select("goal_type, base_weight, urgency_multiplier").eq("persona_id", personaId),
    (supabase as any).from("ai_world_beliefs").select("belief_key, value_json").eq("game_id", gameId).eq("player_id", playerFactionId).in("belief_key", ["enemy_strength_total", "enemy_strength_nearby"]),
    (supabase as any).from("ai_relationships").select("target_player_id, opinion, derived_class").eq("game_id", gameId).eq("player_id", playerFactionId),
    (supabase as any).from("game_fleets").select("id, hex_x, hex_y, owner_classification").eq("game_id", gameId),
    (supabase as any).from("game_fleet_ships").select("game_fleet_id, ship_type_id"),
    (supabase as any).from("ai_goal_slates").select("*").eq("game_id", gameId).eq("player_id", playerFactionId).maybeSingle(),
  ]);

  // Resolve ship point costs (once)
  const { data: shipTypes } = await (supabase as any).from("ship_types").select("id, point_cost");
  const pointById = new Map<string, number>();
  for (const s of shipTypes || []) pointById.set(s.id, Number(s.point_cost) || 0);

  const shipsByFleet = new Map<string, number>();
  for (const r of shipRows || []) {
    const pts = pointById.get(r.ship_type_id) || 0;
    shipsByFleet.set(r.game_fleet_id, (shipsByFleet.get(r.game_fleet_id) || 0) + pts);
  }

  const ownFleets: Array<{ id: string; hex_x: number; hex_y: number; owner: string; point_cost: number }> = [];
  const hostileFleets: Array<{ id: string; hex_x: number; hex_y: number; owner: string }> = [];
  for (const f of fleets || []) {
    const owner = (f.owner_classification || "").trim();
    if (owner === factionCode || owner === factionCode.toUpperCase()) {
      ownFleets.push({ id: f.id, hex_x: f.hex_x, hex_y: f.hex_y, owner, point_cost: shipsByFleet.get(f.id) || 0 });
    } else if (owner && owner !== "UNCONTROLLED") {
      hostileFleets.push({ id: f.id, hex_x: f.hex_x, hex_y: f.hex_y, owner });
    }
  }

  const beliefMap = new Map<string, number>();
  for (const b of beliefs || []) {
    beliefMap.set(b.belief_key, Number((b.value_json as any)?.points) || 0);
  }

  // 3. Fingerprint
  const priorSnapshot = (slateRow?.worldview_snapshot_json ?? null) as WorldviewDims | null;
  const { dims } = computeWorldview({
    gameId, factionCode, playerFactionId, currentTurn,
    mapState, ownFleets, hostileFleets,
    treasury: Number(gf.treasury) || 0,
    relationships: (rels || []).map((r: any) => ({ target_player_id: r.target_player_id, opinion: Number(r.opinion) || 0, derived_class: r.derived_class })),
    beliefs: {
      enemy_strength_total: beliefMap.get("enemy_strength_total") || 0,
      enemy_strength_nearby: beliefMap.get("enemy_strength_nearby") || 0,
    },
    priorSnapshot,
    priorCommittedTurn: slateRow?.committed_turn ?? undefined,
  });

  // 4. Decide revision
  let reason: RevisionReason = "no_change";
  let breaches: ToleranceBreach[] = [];
  const priorCommittedTurn = slateRow?.committed_turn ?? null;
  const nextMandatory = slateRow?.next_mandatory_review_turn ?? 0;

  // Check goal outcomes
  const slotIds = [slateRow?.slot1_goal_id, slateRow?.slot2_goal_id, slateRow?.slot3_goal_id].filter(Boolean) as string[];
  let anyResolved = false;
  if (slotIds.length > 0) {
    const { data: slotGoals } = await (supabase as any).from("ai_goals").select("id, outcome").in("id", slotIds);
    for (const g of slotGoals || []) {
      if (g.outcome && g.outcome !== "pending") { anyResolved = true; break; }
    }
  }

  if (!slateRow) reason = "initial";
  else if (dims.lost_system_this_window) reason = "lost_system";
  else if (currentTurn >= nextMandatory) reason = "mandatory";
  else if (anyResolved) reason = "goal_resolved";
  else {
    breaches = diffTolerances(priorSnapshot as WorldviewDims, dims, persona);
    if (breaches.length > 0) reason = "tolerance";
  }

  // Score always (cheap; needed for dry-run preview)
  const scored = scoreGoals(persona, (weights || []) as any, dims);
  const slate = scored.slice(0, 3);

  const committedTurnOut = reason === "no_change" ? (priorCommittedTurn ?? currentTurn) : currentTurn;
  const nextMandatoryOut = committedTurnOut + commitmentTurns(persona);

  const result: SlateComputeResult = {
    playerFactionId,
    factionCode,
    currentTurn,
    reason,
    breaches,
    scored,
    slate,
    worldview: dims,
    committed: false,
    priorCommittedTurn,
    nextMandatoryReviewTurn: nextMandatoryOut,
  };

  if (!commit || reason === "no_change") return result;

  // 5. Persist — write ai_goals (reuse existing slot goals or supersede),
  //    upsert ai_goal_slates, and emit decision-log rows.
  //
  // Simple approach: mark all prior slate goals superseded, then insert 3 new
  // goal rows and link. Determinism holds because scoring is pure.
  if (slotIds.length > 0) {
    await (supabase as any).from("ai_goals").update({ outcome: "superseded", status: "superseded", resolved_turn: currentTurn }).in("id", slotIds);
  }

  const goalInserts = slate.map((g, i) => ({
    game_id: gameId,
    player_id: playerFactionId,
    goal_type: g.goal_code,
    priority: i + 1,
    status: "active",
    outcome: "pending",
    slate_slot: i + 1,
    created_turn: currentTurn,
    target_json: { score: g.score, breakdown: g.breakdown },
    progress_json: {},
  }));
  const { data: insertedGoals } = await (supabase as any).from("ai_goals").insert(goalInserts).select("id, slate_slot");
  const slotToId = new Map<number, string>();
  for (const g of insertedGoals || []) slotToId.set(g.slate_slot, g.id);

  const slateUpsert = {
    game_id: gameId,
    player_id: playerFactionId,
    faction_key: factionCode,
    slot1_goal_id: slotToId.get(1) ?? null,
    slot2_goal_id: slotToId.get(2) ?? null,
    slot3_goal_id: slotToId.get(3) ?? null,
    committed_turn: currentTurn,
    next_mandatory_review_turn: nextMandatoryOut,
    worldview_snapshot_json: dims as any,
    worldview_hash: JSON.stringify(dims).length.toString(16), // cheap change token
    last_revision_reason: reason,
  };
  await (supabase as any).from("ai_goal_slates").upsert(slateUpsert, { onConflict: "game_id,player_id" });

  // Decision log — one for the reason, one per goal with breakdown
  const logRows = [
    {
      game_id: gameId,
      player_id: playerFactionId,
      turn_number: currentTurn,
      phase: "goals",
      summary: `Slate ${reason}${breaches.length ? `: ${breaches.map((b) => b.dim).join(", ")}` : ""}`,
      details_json: { reason, breaches, worldview: dims, prior_snapshot: priorSnapshot, next_mandatory_review_turn: nextMandatoryOut },
    },
    ...slate.map((g, i) => ({
      game_id: gameId,
      player_id: playerFactionId,
      turn_number: currentTurn,
      phase: "goals",
      summary: `P${i + 1} = ${g.goal_code} (score ${g.score.toFixed(2)})`,
      details_json: { slot: i + 1, goal_code: g.goal_code, score: g.score, breakdown: g.breakdown },
    })),
  ];
  await (supabase as any).from("ai_decision_log").insert(logRows);

  result.committed = true;
  return result;
}
