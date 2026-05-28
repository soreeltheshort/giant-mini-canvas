/**
 * Canonical AI goal catalog. Goal scoring uses this list; persona
 * weights in `ai_persona_goal_weights` reference these codes.
 *
 * Runtime evaluators are not implemented yet — this is the config surface.
 */
export interface GoalDef {
  code: string;
  label: string;
  description: string;
}

export const GOAL_CATALOG: GoalDef[] = [
  {
    code: "colonize",
    label: "Colonize System",
    description: "Take an unowned habitable system. Filtered against friend/competitor/enemy territory.",
  },
  {
    code: "expand_economy",
    label: "Expand Economy",
    description: "Build economic facilities on an owned system whose production is below the empire median.",
  },
  {
    code: "enhance_offense",
    label: "Enhance Offensive Power",
    description: "Grow own offensive power band — fleet shipbuilding, weapons, doctrine investment.",
  },
  {
    code: "bolster_defense",
    label: "Bolster Defense",
    description: "Raise the defense band of the weakest owned system (garrison, defense facilities, strikecraft).",
  },
  {
    code: "degrade_enemy",
    label: "Degrade Enemy",
    description: "Reduce a specific enemy's believed military power through raids and attrition.",
  },
  {
    code: "conquer",
    label: "Conquer System",
    description: "Take a specific enemy-owned system via assault and ground invasion.",
  },
];

export const GOAL_CODES = GOAL_CATALOG.map((g) => g.code);

/**
 * Recommended per-persona priority weights for the 6 goal types.
 * Used by seedDefaultPersonas + as the source-of-truth for the data
 * backfill migration applied to existing personas.
 */
export const RECOMMENDED_GOAL_WEIGHTS: Record<string, Record<string, number>> = {
  Warlord: {
    colonize: 0.6,
    expand_economy: 0.5,
    enhance_offense: 1.3,
    bolster_defense: 0.7,
    degrade_enemy: 1.2,
    conquer: 1.4,
  },
  "Trade Senator": {
    colonize: 1.1,
    expand_economy: 1.4,
    enhance_offense: 0.5,
    bolster_defense: 1.0,
    degrade_enemy: 0.3,
    conquer: 0.4,
  },
  "Paranoid Isolationist": {
    colonize: 0.7,
    expand_economy: 0.9,
    enhance_offense: 0.9,
    bolster_defense: 1.5,
    degrade_enemy: 0.5,
    conquer: 0.3,
  },
};
