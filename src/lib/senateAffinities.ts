/**
 * Senate bloc affinities.
 *
 * Three opposed pairs (a bloc may hold only one side of a pair) plus four
 * standalone affinities. A bloc holds between 1 and 3 affinities.
 */
export interface AffinityDef {
  id: string;
  label: string;
  /** id of the opposing affinity, if this one is part of a pair */
  opposite?: string;
}

export const AFFINITY_PAIRS: Array<[string, string]> = [
  ["peace", "war"],
  ["expansion", "improvement"],
  ["populist", "patrician"],
];

export const AFFINITIES: AffinityDef[] = [
  { id: "peace", label: "Peace", opposite: "war" },
  { id: "war", label: "War", opposite: "peace" },
  { id: "expansion", label: "Expansion", opposite: "improvement" },
  { id: "improvement", label: "Improvement", opposite: "expansion" },
  { id: "populist", label: "Populist", opposite: "patrician" },
  { id: "patrician", label: "Patrician", opposite: "populist" },
  { id: "sullani", label: "Sullani" },
  { id: "mariani", label: "Mariani" },
  { id: "tsaesariani", label: "Tsaesariani" },
  { id: "pompeiani", label: "Pompeiani" },
];

export const MAX_AFFINITIES = 3;

export function affinityLabel(id: string): string {
  return AFFINITIES.find((a) => a.id === id)?.label ?? id;
}

export function oppositeOf(id: string): string | undefined {
  return AFFINITIES.find((a) => a.id === id)?.opposite;
}

/** Is this affinity a standalone (non-paired) one? */
export function isStandaloneAffinity(id: string): boolean {
  return !oppositeOf(id);
}

/**
 * Can this affinity be added to the current selection?
 * The 1-3 limit applies only to the paired affinities; standalone affinities
 * (Sullani, Mariani, Tsaesariani, Pompeiani) can always be toggled freely.
 */
export function canAddAffinity(current: string[], id: string): boolean {
  if (current.includes(id)) return false;
  const opp = oppositeOf(id);
  if (opp) {
    if (current.includes(opp)) return false;
    const pairedCount = current.filter((c) => !isStandaloneAffinity(c)).length;
    if (pairedCount >= MAX_AFFINITIES) return false;
  }
  return true;
}
