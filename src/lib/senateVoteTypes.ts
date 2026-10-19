import { supabase } from "@/integrations/supabase/client";

/** A field a vote type needs filled in. `faction` fields accept any faction id. */
export interface VoteTypeField {
  key: string;
  label: string;
  kind: "faction";
  distinct_from?: string;
}

export interface SenateVoteType {
  key: string;
  label: string;
  title_template: string;
  description_template: string;
  fields: VoteTypeField[];
  sort_order: number;
  /** Affinity id -> score weight; a bloc sums the weights of the affinities it holds. */
  affinity_weights: Record<string, number>;
}

/** Score contribution of a bloc's affinities for this vote type. */
export function affinityScore(type: SenateVoteType, affinities: string[]): number {
  const weights = type.affinity_weights ?? {};
  return affinities.reduce((sum, a) => sum + (Number(weights[a]) || 0), 0);
}

/** Pre-influence stance of a bloc toward a motion, derived from its score and the type's tolerances. */
export type VoteStance = "strong-yea" | "yea" | "neutral" | "nay" | "strong-nay";

export const VOTE_STANCES: VoteStance[] = ["strong-yea", "yea", "neutral", "nay", "strong-nay"];

export const VOTE_STANCE_LABELS: Record<VoteStance, string> = {
  "strong-yea": "Strongly Yea",
  yea: "Yea",
  neutral: "Neutral",
  nay: "Nay",
  "strong-nay": "Strongly Nay",
};

/**
 * Global stance tolerances: a bloc's pre-influence score (whatever the vote type) is compared
 * against these cutoffs to label its stance before any player influence is applied.
 */
export interface StanceTolerances {
  lean_positive: number;
  lean_negative: number;
  strong_positive: number;
  strong_negative: number;
}

export const DEFAULT_STANCE_TOLERANCES: StanceTolerances = {
  lean_positive: 2.5,
  lean_negative: -2.5,
  strong_positive: 7.5,
  strong_negative: -7.5,
};

/** Map a bloc's pre-influence score to its stance using the global tolerance cutoffs. */
export function stanceForScore(tol: StanceTolerances, score: number): VoteStance {
  if (score >= tol.strong_positive) return "strong-yea";
  if (score >= tol.lean_positive) return "yea";
  if (score <= tol.strong_negative) return "strong-nay";
  if (score <= tol.lean_negative) return "nay";
  return "neutral";
}

/** Bonus a bloc gets toward a motion it sponsors itself. */
export const SPONSOR_SCORE_BONUS = 5;

/**
 * Pre-influence score of a bloc toward a motion of this type (no player influence applied):
 * the sum of the vote type's weights for each affinity the bloc holds, plus a bonus
 * for the sponsoring bloc. The relationship-with-named-factions term lands later.
 */
export function blocPreInfluenceScore(
  type: SenateVoteType,
  bloc: { id: string; affinities?: string[] | null },
  sponsorBlocId?: string,
): number {
  let score = affinityScore(type, bloc.affinities ?? []);
  if (sponsorBlocId && bloc.id === sponsorBlocId) score += SPONSOR_SCORE_BONUS;
  return score;
}

export async function listVoteTypes(): Promise<SenateVoteType[]> {
  const { data, error } = await (supabase as any)
    .from("senate_vote_types").select("*").order("sort_order");
  if (error) throw error;
  return (data ?? []) as SenateVoteType[];
}

/**
 * Replace `$Field_Name` tokens (matched case-insensitively against field keys)
 * with display values. Unfilled tokens render as their field label in brackets.
 */
export function renderVoteTemplate(
  template: string,
  fields: VoteTypeField[],
  displayValues: Record<string, string | undefined>,
): string {
  return template.replace(/\$([A-Za-z0-9_]+)/g, (match, token: string) => {
    const field = fields.find((f) => f.key.toLowerCase() === token.toLowerCase());
    if (!field) return match;
    return displayValues[field.key] || `[${field.label}]`;
  });
}

/** Returns an error message, or null when params are valid for the type. */
export function validateVoteParams(type: SenateVoteType, params: Record<string, string>): string | null {
  for (const f of type.fields) {
    if (!params[f.key]) return `Choose ${f.label}.`;
    if (f.distinct_from && params[f.distinct_from] === params[f.key]) {
      return `${f.label} must be a different faction.`;
    }
  }
  return null;
}

export async function submitProposal(input: {
  gameId: string;
  voteType: string;
  params: Record<string, string>;
  title: string;
  description: string;
  sponsorBlocId: string;
}) {
  const { error } = await (supabase as any).from("senate_proposals").insert({
    game_id: input.gameId,
    vote_type: input.voteType,
    params: input.params,
    title: input.title,
    description: input.description,
    sponsor_bloc_id: input.sponsorBlocId,
  });
  if (error) throw error;
}

export async function saveVoteType(t: SenateVoteType) {
  const { error } = await (supabase as any).from("senate_vote_types").upsert({
    key: t.key, label: t.label, title_template: t.title_template,
    description_template: t.description_template, fields: t.fields, sort_order: t.sort_order,
    affinity_weights: t.affinity_weights ?? {},
  });
  if (error) throw error;
}

/** Read the global stance tolerances from app_settings (fallback to defaults). */
export async function getStanceTolerances(): Promise<StanceTolerances> {
  const { data } = await (supabase as any)
    .from("app_settings")
    .select("stance_lean_positive, stance_lean_negative, stance_strong_positive, stance_strong_negative")
    .eq("id", "global")
    .maybeSingle();
  const n = (v: any, d: number) => (Number.isFinite(Number(v)) ? Number(v) : d);
  const d = DEFAULT_STANCE_TOLERANCES;
  return {
    lean_positive: n(data?.stance_lean_positive, d.lean_positive),
    lean_negative: n(data?.stance_lean_negative, d.lean_negative),
    strong_positive: n(data?.stance_strong_positive, d.strong_positive),
    strong_negative: n(data?.stance_strong_negative, d.strong_negative),
  };
}

export async function setStanceTolerances(t: StanceTolerances): Promise<void> {
  const { error } = await (supabase as any).from("app_settings").upsert({
    id: "global",
    stance_lean_positive: t.lean_positive,
    stance_lean_negative: t.lean_negative,
    stance_strong_positive: t.strong_positive,
    stance_strong_negative: t.strong_negative,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

export async function deleteVoteType(key: string) {
  const { error } = await (supabase as any).from("senate_vote_types").delete().eq("key", key);
  if (error) throw error;
}

/** Field kinds the proposal UI knows how to render. */
export const FIELD_KINDS: { value: VoteTypeField["kind"]; label: string }[] = [
  { value: "faction", label: "Faction (players pick player factions)" },
];
