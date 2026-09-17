/**
 * Per-player turn flags.
 *
 * An open, additive bag of named values computed during turn processing and
 * stored on `game_factions.turn_flags`. Any phase — visibility, economy,
 * combat, ground combat, AI — can merge its own keys in at any point; the
 * turn runner persists each player's accumulated bag exactly once at the end
 * of the turn.
 *
 * Deliberately schemaless: adding a new flag never requires a migration and
 * never requires other phases to know about it. Consumers (e.g. Favor
 * triggers, see src/lib/favorTriggers.ts) read whichever keys they care about
 * and treat missing keys as "unknown / false".
 *
 * Every bag carries a `turn` stamp, and bags start empty each turn, so stale
 * flags from a prior turn never leak forward.
 */

export type PlayerTurnFlagValue = boolean | number | string | null;

export interface PlayerTurnFlags {
  /** Turn these flags describe. */
  turn?: number;
  [key: string]: PlayerTurnFlagValue | undefined;
}

/** Minimal shape of the turn context this module needs (avoids a cycle). */
interface FlagCarrier {
  currentTurn: number;
  playerFlags: Map<string, PlayerTurnFlags>;
}

/** Merge a partial set of flags into a player's bag for the current turn. */
export function setPlayerFlags(
  ctx: FlagCarrier,
  playerId: string,
  partial: Record<string, PlayerTurnFlagValue>,
): void {
  if (!playerId) return;
  let bag = ctx.playerFlags.get(playerId);
  if (!bag) {
    bag = { turn: ctx.currentTurn };
    ctx.playerFlags.set(playerId, bag);
  }
  Object.assign(bag, partial);
  bag.turn = ctx.currentTurn;
}

/** Read the bag accumulated so far for a player (empty if untouched). */
export function getPlayerFlags(ctx: FlagCarrier, playerId: string): PlayerTurnFlags {
  return ctx.playerFlags.get(playerId) ?? { turn: ctx.currentTurn };
}

/**
 * Persist every accumulated bag. Called once by the turn runner after all
 * phases have run — one write per player, regardless of contributor count.
 * Players no phase touched still get a clean turn-stamped bag so consumers
 * can tell "computed and false" from "stale".
 */
export async function flushPlayerFlags(
  supabase: any,
  ctx: FlagCarrier & { players: Array<{ id: string }> },
): Promise<void> {
  for (const p of ctx.players) {
    const bag = ctx.playerFlags.get(p.id) ?? { turn: ctx.currentTurn };
    bag.turn = ctx.currentTurn;
    await supabase.from("game_factions").update({ turn_flags: bag }).eq("id", p.id);
  }
}
