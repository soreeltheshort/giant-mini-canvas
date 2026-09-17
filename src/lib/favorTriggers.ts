/**
 * Favor trigger registry.
 *
 * A trigger is a precondition: a Favor is only eligible to be drawn for a
 * player when its trigger evaluates true against that player's turn flags
 * (see src/lib/turnProcessor/playerFlags.ts). Triggers never scan the map —
 * they read cheap, pre-computed flags written during turn processing.
 *
 * Adding a trigger = one entry in TRIGGER_TYPES + one `evaluate` implementation
 * + whichever phase produces the flag it reads.
 */
import type { CriterionField } from "@/lib/favorCriteria";
import type { PlayerTurnFlags } from "@/lib/turnProcessor/playerFlags";

export interface TriggerDef {
  id: string;
  label: string;
  description: string;
  fields: CriterionField[];
  /** Flag keys this trigger reads — documentation for future phase authors. */
  reads: string[];
  evaluate: (params: Record<string, any>, flags: PlayerTurnFlags) => boolean;
}

export const TRIGGER_TYPES: TriggerDef[] = [
  {
    id: "none",
    label: "Always (no trigger)",
    description: "The favor is always eligible to be drawn.",
    fields: [],
    reads: [],
    evaluate: () => true,
  },
  {
    id: "synod_fleet_visible",
    label: "Synod Fleet Visible",
    description: "Eligible only while the player can see at least N Synod fleets on their map.",
    fields: [
      { key: "min_fleets", label: "Minimum Fleets Seen", type: "number", default: 1 },
    ],
    reads: ["synod_fleet_visible", "synod_fleets_seen"],
    evaluate: (params, flags) => {
      const min = Math.max(1, Number(params?.min_fleets ?? 1) || 1);
      const seen = Number(flags?.synod_fleets_seen ?? 0) || 0;
      return seen >= min;
    },
  },
];

export function triggerDef(id: string): TriggerDef | undefined {
  return TRIGGER_TYPES.find((t) => t.id === id);
}

export function triggerLabel(id: string): string {
  return triggerDef(id)?.label ?? id;
}

/** Default parameter object for a trigger type. */
export function defaultTriggerParams(id: string): Record<string, any> {
  const def = triggerDef(id);
  if (!def) return {};
  const out: Record<string, any> = {};
  for (const f of def.fields) out[f.key] = f.default;
  return out;
}

/** Single entry point: is this trigger satisfied by the player's flags? */
export function evaluateTrigger(
  triggerType: string | null | undefined,
  params: Record<string, any> | null | undefined,
  flags: PlayerTurnFlags | null | undefined,
): boolean {
  const def = triggerDef(triggerType || "none");
  if (!def) return true; // unknown trigger: never block content
  return def.evaluate(params ?? {}, flags ?? {});
}
