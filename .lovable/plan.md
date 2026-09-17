# Favor Triggers + Per-Player World Flags

Add a general "trigger" concept to Favores: a condition that must be true before a Favor is eligible to be drawn. The first trigger: **a Synod fleet is visible to the player**.

Triggers read from a small, pre-computed set of per-player flags written during turn processing, so the Favores routine never has to scan the map itself.

## 1. Trigger registry (general structure)

New file `src/lib/favorTriggers.ts`, modeled exactly on the existing `favorCriteria.ts` registry:

- `TRIGGER_TYPES` — array of trigger definitions, each with `id`, `label`, `description`, and its own parameter `fields` (same field shapes already used by criteria: number / text / facility).
- `none` — the default trigger: always eligible.
- `synod_fleet_visible` — eligible only for players whose flags say they can currently see a Synod fleet. Optional field: "Minimum fleets seen" (default 1).
- `evaluateTrigger(trigger_type, params, flags)` — single entry point returning true/false, given a player's flag record. Adding a trigger later means one entry here plus one flag producer.

## 2. Storage on a Favor

Migration adds two columns to `favors`:
- `trigger_type text not null default 'none'`
- `trigger_params jsonb not null default '{}'`

`src/lib/favores.ts` gains these on the `Favor` type, its create/update calls, and its export/import bundle.

## 3. Admin editor

In `/admin/favores`, each favor gets a **Trigger** selector beside the existing Criterion selector, with its parameter fields rendered from the registry (same pattern as criterion params). Default "Always (no trigger)".

## 4. Per-player flags produced during turn processing

A new section at the end of the visibility phase (which already computes, per player, sensor coverage and enemy-fleet sightings) writes a compact flag record per player:

```text
favor_flags = {
  turn: <turn number>,
  synod_fleet_visible: true/false,
  synod_fleets_seen: <count>
}
```

A Synod fleet = a fleet whose owner faction is flagged `infect` (the existing Synod marker used throughout the code). "Visible" reuses the same sensor-coverage test the phase already runs to write enemy fleet intel, so the flag matches exactly what the player can see on the map.

Stored in a new `jsonb` column `favor_flags` on `game_factions` (one row per player per game), default `{}`. Overwritten each turn.

## 5. Reading it

`src/lib/favores.ts` gains `isFavorEligible(favor, flags)` which delegates to `evaluateTrigger`. When per-turn favor generation is built later, it filters the draw pool through this one call — a single cheap read of the player's `favor_flags`, no map scan.

## Technical notes

- Migration: two additive columns on `favors`, one additive column on `game_factions`, all with defaults — no breaking change, existing rows stay valid (`trigger_type = 'none'`).
- No in-game favor generation, bidding, or resolution in this step; this only adds the trigger structure and the flags feed.
