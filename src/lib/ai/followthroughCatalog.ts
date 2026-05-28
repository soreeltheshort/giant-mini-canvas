/**
 * Follow-through (a.k.a. fall-back) activity catalog.
 * When a tick has unspent production share after the AI's main goal slate,
 * it walks the persona's enabled `ai_persona_followthrough` queue in order.
 *
 * Execution is not wired up yet — this is the config surface only.
 */
export interface FollowthroughActivity {
  code: string;
  label: string;
  description: string;
}

export const FOLLOWTHROUGH_CATALOG: FollowthroughActivity[] = [
  {
    code: "garrison_ground_forces",
    label: "Garrison Ground Forces",
    description: "Build ground forces at the owned system with the lowest garrison strength.",
  },
  {
    code: "build_defensive_strikecraft",
    label: "Build Defensive Strikecraft",
    description: "Build fighters and gunships at the owned system with the lowest defensive strikecraft.",
  },
  {
    code: "repair_damaged_hulls",
    label: "Repair Damaged Hulls",
    description: "Allocate production to repair crippled or damaged ships.",
  },
  {
    code: "build_cheapest_defense_hull",
    label: "Build Cheap Defense Hull",
    description: "Construct the cheapest defense-tagged hull at the weakest-defense system.",
  },
  {
    code: "build_cheapest_offense_hull",
    label: "Build Cheap Offense Hull",
    description: "Construct the cheapest offense-tagged hull at the highest-production system.",
  },
  {
    code: "stockpile_treasury",
    label: "Stockpile Treasury",
    description: "Skip production spend and bank the resources.",
  },
];

export const FOLLOWTHROUGH_CODES = FOLLOWTHROUGH_CATALOG.map((a) => a.code);

/**
 * Recommended default queue per persona. Order matters — lower index runs first.
 */
export const RECOMMENDED_FOLLOWTHROUGH: Record<string, string[]> = {
  Warlord: [
    "repair_damaged_hulls",
    "build_cheapest_offense_hull",
    "build_cheapest_defense_hull",
    "build_defensive_strikecraft",
    "garrison_ground_forces",
    "stockpile_treasury",
  ],
  "Trade Senator": [
    "stockpile_treasury",
    "repair_damaged_hulls",
    "build_defensive_strikecraft",
    "garrison_ground_forces",
    "build_cheapest_defense_hull",
    "build_cheapest_offense_hull",
  ],
  "Paranoid Isolationist": [
    "garrison_ground_forces",
    "build_defensive_strikecraft",
    "build_cheapest_defense_hull",
    "repair_damaged_hulls",
    "stockpile_treasury",
    "build_cheapest_offense_hull",
  ],
};

/**
 * Generic neutral fallback used for newly created custom personas.
 */
export const DEFAULT_FOLLOWTHROUGH_QUEUE: string[] = [
  "repair_damaged_hulls",
  "garrison_ground_forces",
  "build_defensive_strikecraft",
  "build_cheapest_defense_hull",
  "build_cheapest_offense_hull",
  "stockpile_treasury",
];
