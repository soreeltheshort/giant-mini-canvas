/**
 * Infected-faction hex ownership.
 *
 * Rule (per-faction `factions.infect` flag): any planet owned by an infected
 * faction also "owns" its planet hex and the 6 adjacent hexes. Ownership is
 * derived on-the-fly from current `mapState.systems` + `mapState.hexes` — no
 * persisted hex_owner table is needed. The "original owner" is whatever the
 * hex's static `classification` already represents (CORE / PROVINCE_N /
 * MARCHES / …), so when the infected player loses the planet, that hex
 * automatically reverts to its classification-based owner on the next
 * render / phase tick.
 *
 * Conflict resolution when two infected planets overlap: the planet hex
 * itself takes priority over a neighbor hex, otherwise last-write wins
 * (deterministic by systems iteration order).
 */
import type { HexData, SystemData } from "./mapTypes";
import { hexKey } from "./mapTypes";
import { getNeighbors } from "./hexUtils";

export function computeInfectedHexOwners(
  systems: Iterable<SystemData>,
  hexes: Map<string, HexData>,
  isInfectedOwner: (ownerString: string | undefined | null) => boolean,
): Map<string, string> {
  // Build hex_id → HexData lookup once.
  const hexById = new Map<number, HexData>();
  for (const h of hexes.values()) hexById.set(h.hex_id, h);

  const neighborOwners = new Map<string, string>(); // ring hexes
  const planetOwners = new Map<string, string>(); // planet hexes (priority)

  for (const sys of systems) {
    if (!isInfectedOwner(sys.owner)) continue;
    const sysHex = hexById.get(sys.hex_id);
    if (!sysHex) continue;
    planetOwners.set(hexKey(sysHex.x, sysHex.y), sys.owner);
    for (const [nx, ny] of getNeighbors(sysHex.x, sysHex.y)) {
      const k = hexKey(nx, ny);
      if (!hexes.has(k)) continue; // off-map
      neighborOwners.set(k, sys.owner);
    }
  }

  // Planet hex wins over neighbor coverage.
  const out = new Map<string, string>(neighborOwners);
  for (const [k, owner] of planetOwners) out.set(k, owner);
  return out;
}
