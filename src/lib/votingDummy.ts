/**
 * Placeholder voting data for the Politics voting interface.
 *
 * Everything here is dummy content so the interface can be designed before the
 * real voting system exists. Swapping this file for live data is the single
 * change needed to hook the UI up.
 */

export type VoteLean = "yea" | "nay" | "undecided";
export type PlayerStance = "yea" | "nay" | "none";

export interface DummyOpenVote {
  id: string;
  title: string;
  category: string;
  sponsorBlocName: string;
  description: string;
  turnsRemaining: number;
}

export interface DummyBlocStance {
  /** Matches a senate bloc id when available; falls back to index order. */
  lean: VoteLean;
  /** Influence needed to overcome the bloc's inherent preference. */
  barrier: number;
}

export const DUMMY_OPEN_VOTE: DummyOpenVote = {
  id: "dummy-vote-1",
  title: "Lex Stellaris de Limitibus",
  category: "War Powers",
  sponsorBlocName: "Optimate Concord",
  description:
    "Authorises the frontier legions to cross the Vestan demarcation line in pursuit of Synod raiders, and levies a temporary war tithe on the inner provinces to pay for it.",
  turnsRemaining: 2,
};

export const DUMMY_INFLUENCE_POOL = 40;
export const DUMMY_ADMIN_POINTS = 3;

const LEAN_CYCLE: VoteLean[] = ["yea", "undecided", "nay", "undecided", "yea", "nay", "undecided", "yea", "nay"];
const BARRIER_CYCLE = [6, 3, 12, 4, 8, 15, 2, 9, 11];

/** Deterministic dummy stance for a bloc at a given position in the set. */
export function dummyStanceFor(index: number): DummyBlocStance {
  return {
    lean: LEAN_CYCLE[index % LEAN_CYCLE.length],
    barrier: BARRIER_CYCLE[index % BARRIER_CYCLE.length],
  };
}

export const VOTE_CATEGORIES = [
  "War Powers",
  "Appropriations",
  "Censure",
  "Colonial Charter",
  "Trade Compact",
];

export function leanLabel(lean: VoteLean): string {
  return lean === "yea" ? "Leans Yea" : lean === "nay" ? "Leans Nay" : "Undecided";
}
