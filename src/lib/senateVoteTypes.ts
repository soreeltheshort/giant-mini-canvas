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
