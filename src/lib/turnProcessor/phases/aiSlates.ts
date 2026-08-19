/**
 * Phase 2a — AI Slates.
 *
 * For every AI faction with a persona, recomputes the goal slate. Guarded by
 * games.enable_ai_slates so a bad run can be turned off without a code change.
 * Failures inside a single faction never block the phase (or the turn).
 */
import type { Phase, TurnContext } from "../types";
import { computeSlate } from "@/lib/ai/goalSlate";

export const aiSlatesPhase: Phase = {
  name: "ai_slates" as any,
  label: "AI Slates",
  async run(ctx: TurnContext) {
    if (!ctx.enableAiSlates) {
      ctx.logs.push({
        game_id: ctx.gameId,
        turn_number: ctx.currentTurn,
        phase: "ai_slates" as any,
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
        const result = await computeSlate({ supabase, gameId, currentTurn, mapState, playerFactionId: gf.id, commit: true });
        if (!result) continue;
        ctx.logs.push({
          game_id: gameId,
          turn_number: currentTurn,
          phase: "ai_slates" as any,
          log_type: "ai_slate",
          message: `[${result.factionCode}] slate ${result.reason}${result.reason !== "no_change" ? ` — P1=${result.slate[0]?.goal_code} P2=${result.slate[1]?.goal_code} P3=${result.slate[2]?.goal_code}` : ""}`,
          details_json: {
            faction: result.factionCode,
            reason: result.reason,
            breaches: result.breaches,
            slate: result.slate.map((g, i) => ({ slot: i + 1, goal: g.goal_code, score: g.score })),
            next_mandatory_review_turn: result.nextMandatoryReviewTurn,
          },
        });
      } catch (err: any) {
        ctx.logs.push({
          game_id: gameId,
          turn_number: currentTurn,
          phase: "ai_slates" as any,
          log_type: "ai_slate_error",
          message: `Slate computation failed for faction ${gf.id}: ${err?.message || err}`,
          details_json: { error: String(err) },
        });
      }
    }
  },
};
