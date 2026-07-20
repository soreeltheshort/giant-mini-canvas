# Enhance Offense — Full Vertical Slice (with faction-flagged templates)

Replace the current "queue one cheap ship" behavior with a real offensive build-up: pick a production hub, spawn a new fleet nearby seeded from **faction-appropriate** fleet templates, and queue ship production across nearby owned systems with a big-ships-first priority.

## Scope

Only the `enhance_offense` branch of `aiActionsPhase` changes. Goal slate, plan binding, and other goal types are untouched. Runs only for AI factions, only when a bound plan has `feasibility ≥ 0.5`.

## 1. Fleet template ↔ faction tagging (schema)

Templates are the rows in `fleets` (owned by the game creator / admin). One template may be usable by many factions, and one faction may have many templates → many-to-many.

**New table `fleet_faction_tags`** (join table, migration required):
- `fleet_id uuid` → `fleets.id` (cascade delete)
- `faction_id uuid` → `factions.id` (cascade delete)
- PK: `(fleet_id, faction_id)`
- RLS: admin-only write; read to `authenticated` (needed by AI code path and admin UI). Grants: `SELECT` to `authenticated`, `ALL` to `service_role`.

**Fleet admin UI (Map Editor → Fleets panel)**: add a multi-select "Available to factions" control on the fleet detail form that reads/writes `fleet_faction_tags`. Non-blocking for AI logic — untagged templates simply aren't picked by any AI.

**Backfill**: none. Existing templates start with zero tags; user tags them as needed. If a faction has zero tagged templates, `enhance_offense` logs `no_templates_for_faction` and skips — no silent fallback to mixed-faction pool.

## 2. New / changed pieces

### `src/lib/ai/productionHub.ts` (new, testable in isolation)
`selectProductionHub(gameId, factionId, ctx) → { systemId, hexX, hexY, capacity } | null`
- Loads faction-owned systems via `ownerMatchesFaction`.
- Ranks by summed facility `ship_build_capacity`. Tie-breakers: population desc, then lowest `system_id`.
- Returns null if no shipyard-capable owned system.

`selectSpawnHex(gameId, hubHex, ctx) → { hexX, hexY }`
- Nearest empty adjacent hex (no `game_fleets` row) using pointy-top odd-r neighbors.
- Deterministic neighbor ordering `(dy, dx)`; falls back to hub hex if all occupied.

### `src/lib/ai/fleetComposer.ts` (new)
`composeFleetFromTemplates(pointBudget, factionId) → { ships, usedTemplates, totalPoints }`
- Candidate pool: `fleets` rows joined through `fleet_faction_tags` where `faction_id = factionId` AND `is_garrison = false`.
- Compute each template's point value from `fleet_ships` × `ship_types.points_value` (cached per call).
- Greedy pack: pick largest template ≤ remaining budget, subtract, repeat until nothing fits.
- Aggregate duplicate `ship_type_id`s across chosen templates into a single composition list.
- Empty pool → return `{ ships: [], totalPoints: 0 }` with reason `no_templates_for_faction`.

Target `pointBudget` comes from the goal slate (`ai_goals.target_fleet_points`). If missing, fall back to `persona.aggression * 200` and log a warning.

### `src/lib/turnProcessor/phases/aiActions.ts` (rewrite enhance_offense branch)
Per active `enhance_offense` plan:
1. `hub = selectProductionHub(...)`. Null → skip `no_production_hub`.
2. `spawn = selectSpawnHex(gameId, hub)`.
3. `composition = composeFleetFromTemplates(budget, factionId)`. Empty → skip with composer reason.
4. Insert:
   - `fleets` row (owner = game creator, name `AI Buildup - <faction> T<turn>`, `points_budget = composition.totalPoints`).
   - `game_fleets` row at `spawn` hex, `is_garrison=false`, owner_classification = faction label. Ship roster empty; ships arrive as production completes.
5. Queue production: find faction-owned systems within 8 hexes of hub (Chebyshev on axial using existing range helper).
   - Order systems by shipyard capacity desc → "most powerful spaceports".
   - Walk `composition.ships` by `ship_types.points_value` desc → "big ships first".
   - Assign each hull to highest-capacity system with free queue slots this turn, deducting treasury as we go; stop when treasury dry.
   - Insert one `system_ship_production` row per assignment with `destination_game_fleet_id = new game_fleet.id`.
6. Log `ai_action` with `{ hub, spawn, composition, queued, skipped_for_treasury }`.

### AI Inspector
Add a **Latest Actions** panel showing the last enhance_offense action per faction (hub name, spawn hex, composition points, queued rows), sourced from `ai_action` log payload.

### Snapshots
No snapshot code changes — new fleets/orders/tags live in tables already baked into snapshots (tags table gets added to snapshot capture in the same migration turn).

## 3. Test plan (hierarchical)

- **T1 Faction tagging**
  - T1.1 Tag template A to Factions X and Y → both AIs can draw A; unrelated Faction Z cannot.
  - T1.2 Untag template A from X → X composer no longer includes A next turn.
  - T1.3 Faction with zero tagged templates → `enhance_offense` skips with `no_templates_for_faction`.
- **T2 Production hub selector**
  - T2.1 Three shipyards → highest-capacity wins.
  - T2.2 Capacity tie → higher population wins.
  - T2.3 No shipyards → null, skip `no_production_hub`.
- **T3 Spawn hex selector**
  - T3.1 Empty neighbors → first-in-order neighbor.
  - T3.2 All neighbors occupied → falls back to hub hex.
- **T4 Fleet composer**
  - T4.1 Budget 500, largest tagged template 480 → returns just that template.
  - T4.2 Budget 1000, templates 600/300/300 → returns 600 + 300 (900 total).
  - T4.3 Budget below smallest tagged template → empty, skip logged.
- **T5 Production queueing**
  - T5.1 Hub + 2 owned systems within 8 hexes → big ships go to highest-capacity system first.
  - T5.2 Owned system 9 hexes away → excluded.
  - T5.3 Treasury runs out mid-assignment → remainder logged as `skipped_for_treasury`.
- **T6 Vertical slice on Test052**
  - T6.1 Tag templates for one AI faction; advance one turn; verify new `game_fleets` row, `system_ship_production` rows, treasury debited.
  - T6.2 Advance N turns; verify completed ships enter the new game_fleet via existing production completion path.

## Files touched

- migration: create `fleet_faction_tags` with grants + RLS
- add `src/lib/ai/productionHub.ts`
- add `src/lib/ai/fleetComposer.ts`
- edit `src/lib/turnProcessor/phases/aiActions.ts`
- edit `src/components/map-editor/RightPanel.tsx` (fleet detail: faction multi-select)
- edit `src/components/admin/ai/AIInspector.tsx` (Latest Actions panel)
