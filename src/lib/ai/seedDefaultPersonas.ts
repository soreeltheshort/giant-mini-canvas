import { supabase } from "@/integrations/supabase/client";

/**
 * Default persona library for the deterministic in-game AI.
 * Traits are 0..1. Goal weights bias `runAITurn` scoring (later phases).
 * Re-running `seedDefaultPersonas` is safe — it skips any persona whose
 * `name` already exists.
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
  weights: Array<{
    goal_type: string;
    base_weight: number;
    urgency_multiplier: number;
    threshold_json?: Record<string, unknown>;
  }>;
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
    weights: [
      { goal_type: "capture_system", base_weight: 1.4, urgency_multiplier: 1.2 },
      { goal_type: "eliminate_player", base_weight: 1.2, urgency_multiplier: 1.3 },
      { goal_type: "build_fleet", base_weight: 1.1, urgency_multiplier: 1.1 },
      { goal_type: "defend_system", base_weight: 0.8, urgency_multiplier: 1.4 },
      { goal_type: "accumulate_treasury", base_weight: 0.4, urgency_multiplier: 0.8, threshold_json: { min_treasury: 50 } },
      { goal_type: "survey_region", base_weight: 0.5, urgency_multiplier: 1.0 },
      { goal_type: "maintain_alliance", base_weight: 0.3, urgency_multiplier: 0.8 },
    ],
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
    weights: [
      { goal_type: "accumulate_treasury", base_weight: 1.4, urgency_multiplier: 1.1, threshold_json: { min_treasury: 200 } },
      { goal_type: "maintain_alliance", base_weight: 1.2, urgency_multiplier: 1.1 },
      { goal_type: "survey_region", base_weight: 1.0, urgency_multiplier: 1.0 },
      { goal_type: "build_fleet", base_weight: 0.7, urgency_multiplier: 1.0 },
      { goal_type: "defend_system", base_weight: 1.0, urgency_multiplier: 1.3 },
      { goal_type: "capture_system", base_weight: 0.4, urgency_multiplier: 0.9 },
      { goal_type: "eliminate_player", base_weight: 0.2, urgency_multiplier: 0.8 },
    ],
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
    weights: [
      { goal_type: "defend_system", base_weight: 1.5, urgency_multiplier: 1.4 },
      { goal_type: "build_fleet", base_weight: 1.2, urgency_multiplier: 1.2 },
      { goal_type: "survey_region", base_weight: 1.0, urgency_multiplier: 1.1 },
      { goal_type: "accumulate_treasury", base_weight: 1.0, urgency_multiplier: 1.0, threshold_json: { min_treasury: 150 } },
      { goal_type: "capture_system", base_weight: 0.4, urgency_multiplier: 0.9 },
      { goal_type: "maintain_alliance", base_weight: 0.3, urgency_multiplier: 0.8 },
      { goal_type: "eliminate_player", base_weight: 0.3, urgency_multiplier: 1.1 },
    ],
  },
];

export async function seedDefaultPersonas(): Promise<{ inserted: number; skipped: number }> {
  const names = DEFAULT_PERSONAS.map((p) => p.name);
  const { data: existing, error: exErr } = await supabase
    .from("ai_personas")
    .select("id, name")
    .in("name", names);
  if (exErr) throw exErr;
  const existingByName = new Map((existing ?? []).map((r: any) => [r.name, r.id]));

  let inserted = 0;
  let skipped = 0;

  for (const p of DEFAULT_PERSONAS) {
    if (existingByName.has(p.name)) {
      skipped++;
      continue;
    }
    const { data: created, error } = await supabase
      .from("ai_personas")
      .insert({
        name: p.name,
        description: p.description,
        model_key: "google/gemini-2.5-flash",
        system_prompt: "",
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

    const personaId = (created as any).id;
    const rows = p.weights.map((w) => ({
      persona_id: personaId,
      goal_type: w.goal_type,
      base_weight: w.base_weight,
      urgency_multiplier: w.urgency_multiplier,
      threshold_json: w.threshold_json ?? {},
    }));
    const { error: wErr } = await supabase.from("ai_persona_goal_weights").insert(rows as any);
    if (wErr) throw wErr;
    inserted++;
  }

  return { inserted, skipped };
}
