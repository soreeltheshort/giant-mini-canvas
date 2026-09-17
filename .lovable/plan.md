# Favor Triggers + Per-Player Turn Flags

Add a general "trigger" concept to Favores: a condition that must be true before a Favor is eligible to be drawn. The first trigger: **a Synod fleet is visible to the player**.

Triggers read from a small, pre-computed set of per-player flags written during turn processing, so the Favores routine never has to scan the map itself. The flag system is deliberately open-ended — any turn step can contribute flags, not just visibility.

## 1. Trigger registry (general structure)

New file `src/lib/favorTriggers.ts`, modeled exactly on the existing `favorCriteria.ts` registry:

- `TRIGGER_TYPES` — array of trigger definitions, each with `id`, `label`, `description`, and its own parameter `fields` (same field shapes already used by criteria).
- `none` — the default trigger: always eligible.
- `synod_fleet_visible` — eligible only for players whose flags say they can currently see a Synod fleet. Optional field: "Minimum fleets seen" (default 1).
- `evaluateTrigger(trigger_type, params, flags)` — single entry point returning true/false, given a player's flag record. Adding a trigger later means one entry here plus one flag producer.

## 2. Per-player turn flags (open architecture)

New file `src/lib/turnProcessor/playerFlags.ts` defining a shared, additive flag bag:

- `PlayerTurnFlags` — a plain record of named values (booleans, counts, ids), no fixed schema beyond a `turn` stamp.
- `setPlayerFlags(ctx, playerId, partial)` — any phase, at any point in the turn, merges its own keys into that player's bag in memory. Later phases can overwrite or add. No phase needs to know what other phases contribute.
- The turn runner writes each player's accumulated bag once at the end of processing, so there is exactly one write per player per turn regardless of how many phases contributed.
- Each turn starts from a clean bag stamped with the turn number, so stale flags never leak forward.

This means future flags ("was attacked this turn", "lost a planet", "treasury below X") slot in from whatever phase naturally knows the answer — economy, combat, ground combat — with no change to the trigger layer.

### First producer: Synod fleet visibility

The visibility phase already computes, per player, sensor coverage and which enemy fleets sit inside it. At the end of that pass it contributes:

```text
synod_fleet_visible: true/false
synod_fleets_seen: <count>
```

A Synod fleet = a fleet whose owner faction is flagged `infect` (the existing Synod marker used throughout the code). "Visible" reuses the exact sensor test already used to write enemy fleet intel, so the flag matches what the player sees on the map.

## 3. Storage

- Migration adds `trigger_type text not null default 'none'` and `trigger_params jsonb not null default '{}'` to `favors`.
- Migration adds `turn_flags jsonb not null default '{}'` to `game_factions` (one row per player per game), holding the whole bag.

`src/lib/favores.ts` gains the trigger fields on the `Favor` type, its create/update calls, and its export/import bundle.

## 4. Admin editor

In `/admin/favores`, each favor gets a **Trigger** selector beside the existing Criterion selector, with its parameter fields rendered from the registry. Default "Always (no trigger)".

## 5. Reading it

`src/lib/favores.ts` gains `isFavorEligible(favor, flags)` delegating to `evaluateTrigger`. Future per-turn favor generation filters the draw pool through this one call — a single cheap read of the player's `turn_flags`, no map scan.

## Technical notes

- All schema changes are additive with defaults; existing rows stay valid (`trigger_type = 'none'`, empty flag bag).
- Flags are intentionally untyped beyond a light helper type, so adding a flag never requires a migration.
- No in-game favor generation, bidding, or resolution in this step.
