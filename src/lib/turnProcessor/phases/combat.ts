/**
 * Combat Phase
 *
 * Resolves contested hexes. The full deterministic battle engine lives in
 * src/lib/battleEngine.ts and is invoked from the Battle Simulator UI; in the
 * future this phase will detect adjacent enemy fleets, snapshot them, and
 * call the engine.
 *
 * For now this phase is a placeholder that simply logs that no engagements
 * were detected. This is intentional so the phase registry is in place and
 * can be wired up incrementally.
 */
import type { Phase, TurnContext } from "../types";

export const combatPhase: Phase = {
  name: "combat",
  label: "Combat",
  async run(ctx: TurnContext) {
    ctx.logs.push({
      game_id: ctx.gameId,
      turn_number: ctx.currentTurn,
      phase: "combat",
      log_type: "noop",
      message: "No engagements detected this turn (combat resolution pending).",
    });
  },
};
