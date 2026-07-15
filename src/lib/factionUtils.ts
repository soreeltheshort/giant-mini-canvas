/**
 * Faction naming + identity helpers.
 *
 * Factions have two names:
 *   - `name`       — the display name shown to players (e.g. "Synod")
 *   - `code_name`  — the internal coding identifier (e.g. "Synod_int3")
 *
 * `owner_classification` on fleets/systems may store either form (legacy data
 * uses display names or PROVINCE_X codes; new map-editor placements store the
 * code_name). The helpers below normalise between forms so callers can resolve
 * an owner string back to a single `Faction` row regardless of variant.
 */

export interface FactionLike {
  id: string;
  name: string;
  code_name: string | null;
  ai_persona_id?: string | null;
  is_player_faction?: boolean | null;
}

const PROVINCE_NAMES: Record<number, string> = {
  1: "Valerian", 2: "Aurelian", 3: "Cassian",
  4: "Dravian", 5: "Marcellan", 6: "Octavian",
};
const PROVINCE_NAME_TO_SLOT = new Map<string, number>(
  Object.entries(PROVINCE_NAMES).map(([slot, name]) => [name.toLowerCase(), parseInt(slot, 10)])
);

function cleanOwner(value: string | null | undefined): string {
  return String(value ?? "").trim();
}

function ownerCompareKey(value: string): string {
  return value.trim().toLowerCase();
}

export function ownerProvinceSlot(owner: string | null | undefined): number | undefined {
  const value = cleanOwner(owner);
  if (!value || value.toLowerCase() === "unowned") return undefined;

  const provMatch = value.match(/^PROVINCE_(\d+)$/i);
  if (provMatch) return parseInt(provMatch[1], 10);

  const direct = PROVINCE_NAME_TO_SLOT.get(value.toLowerCase());
  if (direct != null) return direct;

  const stripped = value.toLowerCase().replace(/_int\d*$/i, "");
  return PROVINCE_NAME_TO_SLOT.get(stripped);
}

/**
 * Canonical alias set for faction ownership comparisons.
 *
 * A map row may store ownership as `PROVINCE_4`, `Dravian`, or legacy/coded
 * variants like `Dravian_int1`. Player code should compare via this helper
 * instead of direct string equality so UI gating and order validation agree.
 */
export function ownerAliasKeys(owner: string | null | undefined): Set<string> {
  const value = cleanOwner(owner);
  const keys = new Set<string>();
  if (!value || value.toLowerCase() === "unowned") return keys;

  keys.add(ownerCompareKey(value));

  const slot = ownerProvinceSlot(value);
  if (slot != null) {
    keys.add(ownerCompareKey(`PROVINCE_${slot}`));
    const name = PROVINCE_NAMES[slot];
    if (name) keys.add(ownerCompareKey(name));
  }

  return keys;
}

/** Single source of truth for "does this owner string belong to this faction?" */
export function ownerMatchesFaction(
  owner: string | null | undefined,
  factionOwnerClassification: string | null | undefined,
): boolean {
  const ownerKeys = ownerAliasKeys(owner);
  if (ownerKeys.size === 0) return false;

  for (const factionKey of ownerAliasKeys(factionOwnerClassification)) {
    if (ownerKeys.has(factionKey)) return true;
  }
  return false;
}

export function factionDisplayFromCode(value: string | null | undefined): string {
  if (!value) return "";
  return value.replace(/_int\d*$/i, "");
}

/**
 * Resolve a free-text `owner_classification` (e.g. "PROVINCE_4", "Synod_int1",
 * "Cassian") to the matching `Faction` row, or null if no match exists or the
 * owner is unowned. Match order: code_name → display name → PROVINCE_<slot>
 * mapped through PROVINCE_NAMES.
 */
export function resolveOwnerToFaction<F extends FactionLike>(
  ownerClassification: string | null | undefined,
  factions: F[],
): F | null {
  if (!ownerClassification) return null;
  const owner = ownerClassification.trim();
  if (!owner || owner.toLowerCase() === "unowned") return null;

  const lc = owner.toLowerCase();
  const byCode = factions.find((f) => (f.code_name || "").toLowerCase() === lc);
  if (byCode) return byCode;
  const byName = factions.find((f) => f.name.toLowerCase() === lc);
  if (byName) return byName;

  const provMatch = owner.match(/^PROVINCE_(\d+)$/i);
  if (provMatch) {
    const slot = parseInt(provMatch[1], 10);
    const provName = PROVINCE_NAMES[slot];
    if (provName) {
      return factions.find((f) => f.name.toLowerCase() === provName.toLowerCase()) || null;
    }
  }
  return null;
}

/**
 * All owner-classification strings that should match this faction when
 * comparing against fleet/system `owner_classification` values. Useful for
 * filtering map state without doing a full faction resolve per row.
 */
export function factionOwnerStrings<F extends FactionLike>(
  faction: F,
  playerSlot?: number | null,
): Set<string> {
  const out = new Set<string>();
  out.add(faction.name);
  if (faction.code_name) out.add(faction.code_name);
  // Seat-based PROVINCE_<n> for the six Roman provinces
  const slot = playerSlot ?? PROVINCE_NAME_TO_SLOT.get(faction.name.toLowerCase()) ?? null;
  if (slot != null) out.add(`PROVINCE_${slot}`);
  return out;
}

export function isPlayerFaction(faction: FactionLike | null | undefined): boolean {
  return !!faction?.is_player_faction;
}

export { PROVINCE_NAMES };
