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
  ["tradition", "reform"],
  ["populist", "patrician"],
];

export const AFFINITIES: AffinityDef[] = [
  { id: "peace", label: "Peace", opposite: "war" },
  { id: "war", label: "War", opposite: "peace" },
  { id: "tradition", label: "Tradition", opposite: "reform" },
  { id: "reform", label: "Reform", opposite: "tradition" },
  { id: "populist", label: "Populist", opposite: "patrician" },
  { id: "patrician", label: "Patrician", opposite: "populist" },
  { id: "piety", label: "Piety" },
  { id: "commerce", label: "Commerce" },
  { id: "science", label: "Science" },
  { id: "expansion", label: "Expansion" },
];

export const MAX_AFFINITIES = 3;

export function affinityLabel(id: string): string {
  return AFFINITIES.find((a) => a.id === id)?.label ?? id;
}

export function oppositeOf(id: string): string | undefined {
  return AFFINITIES.find((a) => a.id === id)?.opposite;
}

/** Can this affinity be added to the current selection? */
export function canAddAffinity(current: string[], id: string): boolean {
  if (current.includes(id)) return false;
  if (current.length >= MAX_AFFINITIES) return false;
  const opp = oppositeOf(id);
  return !(opp && current.includes(opp));
}
