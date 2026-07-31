## Starbases

Starbases are player-built map entities that behave like systems (persistent, own facilities, appear on the map) but are constructed, weaponised through facilities, and destroyed rather than captured.

### 1. What a starbase is

Reuses the existing `SystemData` record with `system_type = "station"` — no parallel entity, so intel, facilities, garrison, strikecraft, ownership, and map rendering already work.

- Placement: any **empty hex** (no existing system) that is inside the builder's supply grid at the moment of the order.
- Economy: no innate population/tribute. Population, tribute, and upkeep come **only** from facilities built on it (`tribute_flat`, `tribute_percent`, `maintenance`, plus a new `population_bonus` field). Garrison max uses facility `ground_defense_bonus` only.
- Loss condition: when a starbase's hull reaches 0 it is **removed from the map** along with its facilities and stationed strikecraft. No capture.

### 2. Facility split: planet-only vs starbase-only

New `facility_types` columns:

- `allowed_on` — `planet` | `starbase` | `both` (default `planet`)
- `population_bonus` int (default 0)
- Weapon loadout columns mirroring the ship weapon keys already in `ship_types`: `laser_light`, `laser_medium`, `laser_heavy`, `laser_hull_breaker`, `missile_10kg`, `missile_50kg`, `missile_100kg`, `missile_half_kt`, `missile_synod`, `missile_kraken`, plus `hull_points` and `armor`.

Admin → Assets → Facilities gets an "Allowed on" selector and a collapsible "Weapons & Hull" section. The build dialog filters the facility list by the target's `system_type`.

### 3. Building a starbase

- New order (`order_type: "other"`, `kind: "build_starbase"`) issued from the map: select an empty in-supply hex → "Found Starbase".
- Tunable constants live in `combat_constants`, editable under **Assets → Factions Config → Combat Constants** and included in the exported/imported config bundle (`combat_constants` is already in the bundle's table list):
  - `starbase_build_turns` — **default 3**
  - `starbase_build_cost`
  - `starbase_admin_cost`
- Validation on issue and again at resolution: hex empty, hex in the faction's supply grid, treasury and admin points sufficient. Rejections log `starbase_build_rejected` with the reason.
- In-progress starbases are tracked per game and tick down each turn; the map shows a ghosted marker with turns remaining. On completion the economy phase inserts a new `SystemData` with `system_type: "station"`, owner = builder, name from the faction naming convention, and marks the hex `has_system`.

### 4. Starbases in combat

- A starbase joins a battle as a single synthetic combatant in the **Core** group, built in `battleSetup.ts` from the sum of its facilities' weapon/hull/armor columns. Speed is 0 in every virtual-speed slot.
- Stationed fighters/gunships and ground defenses behave as they do for planets.
- Damage persists in a new `current_hull` field on the system record; at ≤ 0 the starbase is deleted (`starbase_destroyed` log). Planets are unchanged.

### 5. "Attack Planet" → "Attack/Defend Planet"

Rename the strategy/tactical-group label everywhere it is user-visible and in the group key: `FleetBuilder.tsx`, `FleetDetailContent.tsx`, `AdminBattleConfig.tsx`, `AdminShips.tsx` group headers, and the `group_modifiers` / `battle_phases` rows (data update; ship columns such as `virtual_atk_speed_attack_planet` keep their names).

Behaviour splits by target ownership:

- **Hostile target** — unchanged one-shot invasion/bombardment order, consumed at end of turn.
- **Friendly or own planet/starbase** — a **standing defence posture**: not deleted by the turn processor, no re-issue needed. The fleet joins the defender side of any battle at that hex and its ground troops reinforce the garrison rather than landing as invaders. Cleared on explicit cancel, on the fleet moving away, or if the target changes owner.

Implementation: `src/lib/turnProcessor/index.ts` only consumes `fleet_attack` orders whose target is hostile; `combat.ts` and `groundCombat.ts` branch on `ownerMatchesFaction(target.owner, attackerFaction)`.

### 6. Map + UI

- `PlayerMapCanvas.tsx` already distinguishes `isStation`; give starbases a distinct bronze glyph, a build-in-progress ghost, and a hull bar when damaged.
- Left panel system detail shows a Starbase header, hull, filtered facility catalog, garrison card, and no planet-condition/resources rows.
- Manual: new "Starbases" page; updates to the Supply and Ground Combat pages for the defend posture.

### Technical notes

- Migration 1: `facility_types` — `allowed_on`, `population_bonus`, weapon/hull/armor int columns (all defaulted).
- Migration 2: seed `combat_constants` rows `starbase_build_turns` (3), `starbase_build_cost`, `starbase_admin_cost`.
- No new tables: starbases live in `games.map_data_json`, so snapshots and forks capture them automatically.
- Files touched: `src/lib/mapTypes.ts`, `src/hooks/useFacilityTypes.ts`, `src/pages/AdminFacilities.tsx`, `src/lib/battleSetup.ts`, `src/lib/turnProcessor/phases/{economy,combat,groundCombat}.ts`, `src/lib/turnProcessor/index.ts`, `src/components/game-shell/{PlayerMapCanvas,LeftPanel,ContextPanel,FleetDetailContent}.tsx`, `src/pages/{PlayerGame,FleetBuilder,AdminBattleConfig}.tsx`.

### Test plan

- **T1 Build** — T1.1 Found starbase on empty in-supply hex: queued, cost debited. T1.2 Out-of-supply hex: rejected + logged. T1.3 Hex already holding a planet: rejected. T1.4 Insufficient treasury/admin points: rejected. T1.5 Completes exactly 3 turns later with the default constant. T1.6 Change `starbase_build_turns` to 1 in Factions Config: next build completes next turn. T1.7 Export/import a config bundle: the constant round-trips.
- **T2 Facilities** — T2.1 Planet-only facility absent from starbase list. T2.2 Starbase-only absent from planet list. T2.3 `both` appears in each. T2.4 Habitat facility adds population; tribute/upkeep appear in the Economy view.
- **T3 Combat** — T3.1 Unarmed starbase takes damage, hull persists across turns. T3.2 Weapon facilities make it fire in Core group with summed weapons. T3.3 Hull to 0: starbase and facilities removed, logged. T3.4 Stationed fighters launch as today.
- **T4 Attack/Defend** — T4.1 Label reads "Attack/Defend Planet" everywhere. T4.2 Hostile target order consumed after the turn. T4.3 Own planet order persists two turns without re-issue. T4.4 Defending fleet joins the defender side. T4.5 Fleet moves away: standing order cleared. T4.6 Manual cancel works.

### Out of scope

- AI building or defending starbases.
- Repairing starbase hull (later, as a facility or supply cost).
