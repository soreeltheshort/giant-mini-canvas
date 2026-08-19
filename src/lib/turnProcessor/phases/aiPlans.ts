/**
 * Phase 2b — AI Plans.
 *
 * For every AI faction with a committed slate, rebinds each slot to a
 * concrete target with cost + feasibility estimate. Runs immediately
 * after aiSlates so plan targets always reflect this turn's slate.
 * Failures inside a single faction never block the phase or the turn.
 */
import type { Phase, TurnContext } from "../types";
import { buildPlansForFaction } from "@/lib/ai/buildPlans";

export const aiPlansPhase: Phase = {
  name: "ai_plans" as any,
  label: "AI Plans",
  async run(ctx: TurnContext) {
    if (!ctx.enableAiSlates) {
      ctx.logs.push({
        game_id: ctx.gameId,
        turn_number: ctx.currentTurn,
        phase: "ai_plans" as any,
        log_type: "ai_skip",
        message: "Skipped — enable_ai_slates is false",
      });
      return;
    }

    const { supabase, gameId, currentTurn, mapState } = ctx;

    const { data: gfRows } = await (supabase as any)
      .from("game_factions")
      .select("id, is_ai, ai_persona_id, factions:faction_id(ai_persona_id)")
      .eq("game_id", gameId);
    const aiFactions = (gfRows || []).filter((r: any) => r.is_ai && (r.ai_persona_id || r.factions?.ai_persona_id));
    if (aiFactions.length === 0) return;

    for (const gf of aiFactions) {
      try {
        const res = await buildPlansForFaction({ supabase, gameId, currentTurn, mapState, playerFactionId: gf.id, commit: true });
        if (!res) continue;
        ctx.logs.push({
          game_id: gameId,
          turn_number: currentTurn,
          phase: "ai_plans" as any,
          log_type: "ai_plans",
          message: `[${res.factionCode}] bound ${res.plans.length} plan(s): ${res.plans.map((p) => `P${p.slot}=${p.goal_code}→${p.target_label}(${p.feasibility})`).join(" | ") || "(no slate)"}`,
          details_json: {
            faction: res.factionCode,
            plans: res.plans,
          },
        });
      } catch (err: any) {
        ctx.logs.push({
          game_id: gameId,
          turn_number: currentTurn,
          phase: "ai_plans" as any,
          log_type: "ai_plans_error",
          message: `Plan build failed for faction ${gf.id}: ${err?.message || err}`,
          details_json: { error: String(err) },
        });
      }
    }
  },
};
