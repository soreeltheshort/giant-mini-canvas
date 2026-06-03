/**
 * Owner-keying helpers for per-faction economic accumulators.
 *
 * Why: AI/neutral factions have no `player_slot` on game_factions, so keying
 * `playerEcon` by slot silently drops their tribute/maintenance. We key by a
 * compound string instead — `slot:N` when a slot exists, `faction:<UUID>`
 * otherwise — so every faction (human, AI, neutral) gets its economy applied.
 */

export interface FactionMeta {
  id: string;
  name: string;
  code_name: string | null;
}

export const PROVINCE_NAMES: Record<number, string> = {
  1: "Valerian", 2: "Aurelian", 3: "Cassian",
  4: "Dravian", 5: "Marcellan", 6: "Octavian",
};

const NAME_TO_SLOT = new Map<string, number>();
for (const [s, n] of Object.entries(PROVINCE_NAMES)) NAME_TO_SLOT.set(n.toLowerCase(), parseInt(s, 10));

/** Try to resolve an owner_classification / system.owner to a province slot. */
export function ownerToSlot(owner: string | undefined | null): number | undefined {
  if (!owner) return undefined;
  const m = owner.match(/PROVINCE_(\d+)/i);
  if (m) return parseInt(m[1], 10);
  const lc = owner.trim().toLowerCase();
  const direct = NAME_TO_SLOT.get(lc);
  if (direct != null) return direct;
  // Strip trailing _intN suffix and try again (e.g. "Dravian_int" → "dravian")
  const stripped = lc.replace(/_int\d*$/i, "");
  return NAME_TO_SLOT.get(stripped);
}

/** Resolve owner string → matching faction id (by code_name or name). */
export function ownerToFactionId(
  owner: string | undefined | null,
  factions: FactionMeta[],
): string | undefined {
  if (!owner) return undefined;
  const lc = owner.trim().toLowerCase();
  if (!lc || lc === "unowned") return undefined;
  // Exact code_name match wins (e.g. "Synod_int1").
  const byCode = factions.find((f) => (f.code_name || "").toLowerCase() === lc);
  if (byCode) return byCode.id;
  // Then by display name (e.g. "Synod" → first Synod faction).
  const byName = factions.find((f) => f.name.toLowerCase() === lc);
  if (byName) return byName.id;
  // Strip _intN suffix and retry as code_name / name.
  const stripped = lc.replace(/_int\d*$/i, "");
  const codeStripped = factions.find((f) => (f.code_name || "").toLowerCase().replace(/_int\d*$/i, "") === stripped);
  if (codeStripped) return codeStripped.id;
  return undefined;
}

/**
 * Compound key for the per-faction economy map.
 * Prefers slot (province players) over faction id (AI/neutral).
 */
export function ownerToEconKey(
  owner: string | undefined | null,
  factions: FactionMeta[],
): string | undefined {
  const slot = ownerToSlot(owner);
  if (slot != null) return `slot:${slot}`;
  const fid = ownerToFactionId(owner, factions);
  if (fid) return `faction:${fid}`;
  return undefined;
}

/** Compound key for a game_factions row. */
export function rowEconKey(row: { player_slot: number | null; faction_id: string | null }): string | undefined {
  if (row.player_slot != null) return `slot:${row.player_slot}`;
  if (row.faction_id) return `faction:${row.faction_id}`;
  return undefined;
}
