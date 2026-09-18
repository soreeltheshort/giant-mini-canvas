/**
 * Favor success criteria registry.
 *
 * A Favor is a mini-quest. Its criterion decides who completes it. Every
 * criterion type declares its own parameter fields here so the admin editor
 * (and, later, turn resolution) can be driven from one place — adding a new
 * criterion means adding one entry to CRITERION_TYPES.
 */

export type CriterionFieldType = "number" | "text" | "facility";

export interface CriterionField {
  key: string;
  label: string;
  type: CriterionFieldType;
  default: number | string;
  help?: string;
}

export interface CriterionDef {
  id: string;
  label: string;
  description: string;
  fields: CriterionField[];
}

export const CRITERION_TYPES: CriterionDef[] = [
  {
    id: "influence_auction",
    label: "Influence Auction",
    description: "Players bid influence; the highest bid wins the favor.",
    fields: [
      { key: "min_bid", label: "Minimum Bid", type: "number", default: 1 },
      { key: "deadline_turns", label: "Open For (turns)", type: "number", default: 1 },
    ],
  },
  {
    id: "credit_auction",
    label: "Credit Auction",
    description: "Players bid treasury credits; the highest bid wins the favor.",
    fields: [
      { key: "min_bid", label: "Minimum Bid (₡)", type: "number", default: 10 },
      { key: "deadline_turns", label: "Open For (turns)", type: "number", default: 1 },
    ],
  },
  {
    id: "build_facility",
    label: "Build a Facility",
    description: "First player to commission the required facilities wins.",
    fields: [
      { key: "facility_type_id", label: "Facility Type", type: "facility", default: "" },
      { key: "count", label: "How Many", type: "number", default: 1 },
      { key: "deadline_turns", label: "Open For (turns)", type: "number", default: 3 },
    ],
  },
  {
    id: "defeat_synod_fleet",
    label: "Defeat Synod Fleet",
    description:
      "First player to destroy at least this many points of Synod hulls in a single turn wins.",
    fields: [
      { key: "points", label: "Synod Points Destroyed", type: "number", default: 100, help: "Total point value of Synod ships destroyed in one turn." },
      { key: "deadline_turns", label: "Open For (turns)", type: "number", default: 3 },
    ],
  },
  {
    id: "colonize_planet",
    label: "Colonize a Planet",
    description: "First player to colonize the required number of new planets wins.",
    fields: [
      { key: "count", label: "Planets To Colonize", type: "number", default: 1 },
      { key: "deadline_turns", label: "Open For (turns)", type: "number", default: 3 },
    ],
  },
];

export function criterionDef(id: string): CriterionDef | undefined {
  return CRITERION_TYPES.find((c) => c.id === id);
}

export function criterionLabel(id: string): string {
  return criterionDef(id)?.label ?? id;
}

/** Default parameter object for a criterion type. */
export function defaultCriterionParams(id: string): Record<string, any> {
  const def = criterionDef(id);
  if (!def) return {};
  const out: Record<string, any> = {};
  for (const f of def.fields) out[f.key] = f.default;
  return out;
}

export interface RarityDef {
  id: string;
  label: string;
  /** Default draw weight — higher means it comes up more often. */
  weight: number;
}

export const RARITIES: RarityDef[] = [
  { id: "common", label: "Common", weight: 100 },
  { id: "uncommon", label: "Uncommon", weight: 50 },
  { id: "rare", label: "Rare", weight: 20 },
  { id: "very_rare", label: "Very Rare", weight: 5 },
];

export function rarityLabel(id: string): string {
  return RARITIES.find((r) => r.id === id)?.label ?? id;
}

export function defaultRarityWeight(id: string): number {
  return RARITIES.find((r) => r.id === id)?.weight ?? 100;
}

/** A random-element placeholder used inside a favor's description text. */
export interface FavorVariable {
  key: string;
  min: number;
  max: number;
  step: number;
}

/** Placeholders referenced by a description, e.g. "Donate {amount} credits". */
export function parseDescriptionVariables(description: string): string[] {
  const out: string[] = [];
  const re = /\{([a-zA-Z0-9_]+)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(description)) !== null) {
    if (!out.includes(m[1])) out.push(m[1]);
  }
  return out;
}

/** Resolves every configured {variable} before Favor text is shown to a player. */
export function materializeFavorDescription(
  description: string,
  variables: FavorVariable[] | null | undefined,
  random: () => number = Math.random,
): string {
  const values = new Map<string, number>();

  for (const variable of variables ?? []) {
    const min = Number.isFinite(variable.min) ? variable.min : 0;
    const max = Number.isFinite(variable.max) ? Math.max(min, variable.max) : min;
    const step = Number.isFinite(variable.step) && variable.step > 0 ? variable.step : 1;
    const optionCount = Math.floor((max - min) / step) + 1;
    const optionIndex = Math.min(optionCount - 1, Math.floor(random() * optionCount));
    values.set(variable.key, min + optionIndex * step);
  }

  return description.replace(/\{([a-zA-Z0-9_]+)\}/g, (placeholder, key: string) => {
    const value = values.get(key);
    return value === undefined ? placeholder : String(value);
  });
}
