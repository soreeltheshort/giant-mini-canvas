import { supabase } from "@/integrations/supabase/client";
import { GOAL_CODES, RECOMMENDED_GOAL_WEIGHTS } from "./goalCatalog";
import { RECOMMENDED_FOLLOWTHROUGH, DEFAULT_FOLLOWTHROUGH_QUEUE } from "./followthroughCatalog";

/**
 * Default persona library for the deterministic in-game AI.
 * Traits are 0..1. Goal weights bias goal scoring (later phases).
 * Re-running `seedDefaultPersonas` is safe — it skips any persona whose
 * `name` already exists for trait insertion, but it always backfills any
 * missing goal-weight rows and follow-through queue rows.
 */
export interface DefaultPersona {
  name: string;
  description: string;
  traits: {
    aggression: number;
    expansionism: number;
    economic_focus: number;
    risk_tolerance: number;
    loyalty: number;
    paranoia: number;
    diplomacy: number;
  };
}

export const DEFAULT_PERSONAS: DefaultPersona[] = [
  {
    name: "Warlord",
    description: "Aggressive expansionist that seeks to conquer rivals.",
    traits: {
      aggression: 0.9,
      expansionism: 0.8,
      economic_focus: 0.3,
      risk_tolerance: 0.8,
      loyalty: 0.4,
      paranoia: 0.4,
      diplomacy: 0.2,
    },
  },
  {
    name: "Trade Senator",
    description: "Wealth-focused diplomat that prefers commerce to combat.",
    traits: {
      aggression: 0.2,
      expansionism: 0.5,
      economic_focus: 0.9,
      risk_tolerance: 0.4,
      loyalty: 0.7,
      paranoia: 0.3,
      diplomacy: 0.9,
    },
  },
  {
    name: "Paranoid Isolationist",
    description: "Defensive recluse who fortifies borders and trusts no one.",
    traits: {
      aggression: 0.4,
      expansionism: 0.2,
      economic_focus: 0.6,
      risk_tolerance: 0.2,
      loyalty: 0.6,
      paranoia: 0.9,
      diplomacy: 0.3,
    },
  },
];

async function backfillGoalWeights(personaId: string, personaName: string) {
  const recommended = RECOMMENDED_GOAL_WEIGHTS[personaName];
  const { data: existing } = await supabase
    .from("ai_persona_goal_weights")
    .select("goal_type")
    .eq("persona_id", personaId);
  const have = new Set((existing ?? []).map((r: any) => r.goal_type));
  const rows = GOAL_CODES.filter((c) => !have.has(c)).map((code) => ({
    persona_id: personaId,
    goal_type: code,
    base_weight: recommended?.[code] ?? 1.0,
    urgency_multiplier: 1.0,
    threshold_json: {},
  }));
  if (rows.length > 0) {
    const { error } = await supabase.from("ai_persona_goal_weights").insert(rows as any);
    if (error) throw error;
  }
}

async function backfillFollowthrough(personaId: string, personaName: string) {
  const { data: existing } = await supabase
    .from("ai_persona_followthrough")
    .select("id")
    .eq("persona_id", personaId)
    .limit(1);
  if ((existing?.length ?? 0) > 0) return;
  const queue = RECOMMENDED_FOLLOWTHROUGH[personaName] ?? DEFAULT_FOLLOWTHROUGH_QUEUE;
  const rows = queue.map((activity_code, idx) => ({
    persona_id: personaId,
    step_order: idx + 1,
    activity_code,
    enabled: true,
    params_json: {},
  }));
  const { error } = await supabase.from("ai_persona_followthrough" as any).insert(rows as any);
  if (error) throw error;
}

export async function seedDefaultPersonas(): Promise<{ inserted: number; skipped: number; backfilled: number }> {
  const names = DEFAULT_PERSONAS.map((p) => p.name);
  const { data: existing, error: exErr } = await supabase
    .from("ai_personas")
    .select("id, name")
    .in("name", names);
  if (exErr) throw exErr;
  const existingByName = new Map((existing ?? []).map((r: any) => [r.name, r.id as string]));

  let inserted = 0;
  let skipped = 0;
  let backfilled = 0;

  for (const p of DEFAULT_PERSONAS) {
    let personaId = existingByName.get(p.name);
    if (personaId) {
      skipped++;
    } else {
      const { data: created, error } = await supabase
        .from("ai_personas")
        .insert({
          name: p.name,
          description: p.description,
          aggression: p.traits.aggression,
          expansionism: p.traits.expansionism,
          economic_focus: p.traits.economic_focus,
          risk_tolerance: p.traits.risk_tolerance,
          loyalty: p.traits.loyalty,
          paranoia: p.traits.paranoia,
          diplomacy: p.traits.diplomacy,
        } as any)
        .select("id")
        .single();
      if (error || !created) throw error ?? new Error("Insert failed");
      personaId = (created as any).id;
      inserted++;
    }

    await backfillGoalWeights(personaId!, p.name);
    await backfillFollowthrough(personaId!, p.name);
    backfilled++;
  }

  return { inserted, skipped, backfilled };
}
