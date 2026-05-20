/**
 * Faction naming helpers.
 *
 * Factions have two names:
 *   - `name`       — the display name shown to players (e.g. "Synod")
 *   - `code_name`  — the internal coding identifier (e.g. "Synod_int3")
 *
 * `owner_classification` on fleets/systems may store either form (legacy data
 * uses display names or PROVINCE_X codes; new map-editor placements store the
 * code_name). The helper below normalises a code_name back to its display
 * name by stripping the trailing `_int` / `_intN` suffix.
 */
export function factionDisplayFromCode(value: string | null | undefined): string {
  if (!value) return "";
  return value.replace(/_int\d*$/i, "");
}
