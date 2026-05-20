## Goal

In ship combat, when a weapon's `damage + armorPenetration < target.armor` (i.e. even a clean hit would deal 0 damage), the firing gun should skip that target and pick the next-best one from the weapon's preference table instead of wasting the shot.

## Effort: very small

One localized change inside `selectTarget()` in `src/lib/battleEngine.ts`. No schema changes, no UI, no migrations, no config table additions. Existing weapon-preference plumbing (`weaponPrefs`, `getWeaponTargetPriority`, mount stats with `damage` + `armorPenetration`) already gives us everything we need.

## Change

`selectTarget(attacker, enemies, weaponKey)` currently filters enemies only by `!crippled && currentHull > 0`. Add an "effective" filter parameter so we can also exclude targets the chosen weapon mount cannot meaningfully hurt.

### Technical detail

1. Add a helper in `battleEngine.ts`:
   ```ts
   function canDamage(mount: WeaponMount, target: ShipInstance): boolean {
     // A clean (non-crit) hit deals max(0, damage - max(armor - AP, 0)).
     // If that is <= 0, the weapon cannot hurt this target.
     return mount.damage > Math.max(target.armor - mount.armorPenetration, 0);
   }
   ```
2. Change `selectTarget` to accept the `mount` (not just `weaponKey`) and apply `canDamage(mount, e)` as part of `isValidTarget` for both the "damaged first" pass and the "any" pass over the weapon's hull-class priority.
3. Fallback ordering when nothing in the priority list is damageable:
   - First, try any enemy (any hull class) the weapon CAN damage — pick from the closest hull class in `priority` order.
   - Only if no enemy anywhere can be damaged by this mount, fall back to the current "any remaining enemy" behaviour. This preserves today's behaviour of always firing if a target exists (avoids silent no-ops), while still letting the log show "wasted shot" cases.
4. Update the single caller in `fireWeaponsOfType` to pass `mount` instead of `mount.key`. `getWeaponTargetPriority(mount.key, ...)` still drives the priority list; only the per-shot filter changes.
5. Extend the `target_selected` / hit / miss event `payload_json` and admin-explain text with a `weaponCanDamage: boolean` flag and, when relevant, a note like `"skipped <hull> targets — AP+dmg < armor"`, so admins can see why a target was chosen.

### What I will NOT touch

- Hull-class preference logic, weapon prefs DB table, RNG ordering for equally valid targets, ground combat, fleet cleanup, or any UI.
- Crit math (a crit could in theory exceed armor) — kept out intentionally; weapons that only ever damage via crit should not be considered "effective" picks. Happy to change this if you prefer.

## Verification

- Existing battle simulator at `/battle`: run a fight with a small-laser ship vs a heavy-armor capital plus a frigate — confirm the small lasers now target the frigate instead of pinging 0-damage shots at the capital.
- Run a turn or two through the in-game combat phase (same engine via `battleSetup`) to confirm parity and that no regressions appear in `battle_runs` / `battle_events`.

## Estimated size

~20–30 lines of code in one file, plus a couple of new fields in the event payload. ~10 minutes to implement, ~5 to sanity-check in the simulator.