/**
 * Hex access rules — single source of truth for "is this hex blocked for player X?".
 *
 * Per design (deriving on read, no extra storage):
 *   1. CORE hexes are blocked for all players.
 *   2. A hex containing a system whose province classification belongs to a
 *      DIFFERENT player is blocked for the requesting player.
 *      (Faction match uses the player_slot ↔ PROVINCE_N mapping below.
 *      System ownership changes propagate automatically because system.owner
 *      and the hex classification are the canonical inputs.)
 *   3. All other hexes (own province, Marches, Unexplored Marches, empty
 *      enemy province hexes) are open.
 *
 * Anything that needs to gate movement, order submission, or pathing MUST
 * call `isHexBlockedForPlayer` so all rules stay consistent.
 */
import type { HexData, SystemData } from "./mapTypes";

/** Player slot (1-6) → province classification string. */
export function slotToProvince(slot: number): string | null {
  if (slot < 1 || slot > 6) return null;
  return `PROVINCE_${slot}`;
}

/** Reverse: PROVINCE_N → slot N. Returns undefined for non-province strings. */
export function provinceToSlot(province: string | null | undefined): number | undefined {
  if (!province) return undefined;
  const m = province.match(/^PROVINCE_(\d+)$/);
  return m ? Number(m[1]) : undefined;
}

export interface BlockCheckResult {
  blocked: boolean;
  /** Machine-readable reason; "" when not blocked. */
  reason: "" | "core" | "enemy_system";
  /** Human-readable explanation, suitable for toasts. */
  message: string;
}

/**
 * Decide whether `hex` is blocked for the player in `playerSlot`.
 * `system` is the system on that hex if any (undefined when empty).
 *
 * Faction matching is done by classification: if a system sits in
 * PROVINCE_N, it belongs to slot N. Falls back to the hex classification
 * when system.owner is empty (matches the "match by province classification"
 * decision recorded for this rule set).
 */
export function isHexBlockedForPlayer(
  hex: Pick<HexData, "classification">,
  system: Pick<SystemData, "classification" | "owner"> | undefined,
  playerSlot: number,
): BlockCheckResult {
  if (hex.classification === "CORE") {
    return { blocked: true, reason: "core", message: "Core space is closed to all fleets." };
  }

  if (system) {
    const ownerSlot =
      provinceToSlot(system.owner) ??
      provinceToSlot(system.classification) ??
      provinceToSlot(hex.classification);
    if (ownerSlot !== undefined && ownerSlot !== playerSlot) {
      return {
        blocked: true,
        reason: "enemy_system",
        message: "That system is held by another faction.",
      };
    }
  }

  return { blocked: false, reason: "", message: "" };
}
