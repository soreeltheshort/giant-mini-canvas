
## Goal

When a ground combat resolves:

1. Every player who can *see* the target system gets a DISPATCH.
2. Each dispatch stores a rich JSON payload — including a **human-readable die-roll transcript** so you can debug bad rolls without opening the DB.
3. The same payload is structured enough to hand to an LLM in Phase 2 for flavor rewriting.

## Scope

- Modify `src/lib/turnProcessor/phases/groundCombat.ts`:
  - Change `resolveRound` to also return per-unit roll records (`{ side, unit_index, roll, kill_chance, hit }`).
  - Build a per-engagement `combat_transcript` (Phase A pairings + Phase B round) and a `debug_lines[]` pretty-print.
  - Determine observers (attacker, defender, previous owner, plus every player whose `player_system_intel` on `currentTurn` shows the target `system_id` as visible, plus any player whose `scouted_hex_ids` contains the target hex).
  - Insert one `dispatch_ground_combat` row per observer with observer-specific `role` / `fog_level` in `details_json.observer`.
- Update `src/pages/PlayerGame.tsx` to fetch and surface `dispatch_ground_combat` rows scoped to the current player (via `details_json->observer->>player_id`). Keep legacy `planet_captured/colonized` loader as fallback and dedupe by `(turn, system_id)`.
- Update `src/components/game-shell/TurnLogViewer.tsx` to pretty-print the transcript inline for admin view (collapsible `<details>` block showing `debug_lines` as a monospace list).

No schema changes — reuse `game_logs.details_json`.

## Dispatch payload (`log_type: "dispatch_ground_combat"`)

```jsonc
{
  "schema": "dispatch.ground_combat.v1",
  "turn": 47,
  "system": { "id": 14, "name": "Vesta Line", "hex": {"x":42,"y":71},
              "planet_type": "Terrestrial",
              "population_before": 40, "population_after": 0 },
  "attacker": {
    "faction": "Synod_int1", "faction_display": "The Synod",
    "is_infect": true,
    "fleet_name": "Synod Fleet S48",
    "ground_force_start": 6, "ground_force_end": 5,
    "transports_destroyed": 2
  },
  "defender": {
    "faction": "Dravian", "faction_display": "Dravian Concord",
    "ground_defenses_start": 1, "ground_defenses_end": 0
  },
  "outcome": {
    "kind": "capture",           // capture|colonize|repulsed|stalemate|mutual_annihilation
    "rule_path": "infect",
    "new_owner": "Synod_int1",
    "previous_owner": "Dravian",
    "kill_chance": 0.8,
    "synod_purge": null
  },

  // ─── Debug transcript ───────────────────────────────
  "combat_transcript": {
    "seed": "fc12…-t47-gc-sys14",
    "kill_chance": 0.8,
    "phase_a": [
      // one entry per pairing; empty array if 0 or 1 invader
      {
        "attacker": "Synod Fleet S48", "defender": "Aurelian 3rd",
        "a_start": 6, "b_start": 4,
        "a_rolls": [ {"i":1,"roll":0.213,"hit":true},
                     {"i":2,"roll":0.884,"hit":false}, … ],
        "b_rolls": [ … ],
        "a_kills_on_b": 3, "b_kills_on_a": 2,
        "a_end": 4, "b_end": 1
      }
    ],
    "phase_b": {
      "champion": "Synod Fleet S48", "defenses_start": 1,
      "champion_rolls": [ {"i":1,"roll":0.117,"hit":true},
                          {"i":2,"roll":0.902,"hit":false},
                          {"i":3,"roll":0.451,"hit":true},
                          {"i":4,"roll":0.734,"hit":true},
                          {"i":5,"roll":0.522,"hit":true},
                          {"i":6,"roll":0.981,"hit":false} ],
      "defense_rolls": [ {"i":1,"roll":0.334,"hit":true} ],
      "champion_kills_on_defenses": 1,
      "defense_kills_on_champion": 1,
      "champion_end": 5, "defenses_end": 0,
      "infect_multiplied": false, "infect_multiplier": null
    }
  },

  // ─── Pre-formatted human debug lines ───────────────
  // Rendered as-is by TurnLogViewer inside a <pre> block.
  "debug_lines": [
    "Vesta Line — turn 47 — seed fc12…-t47-gc-sys14 — killChance 0.80",
    "PHASE A: (no other invaders)",
    "PHASE B: Synod Fleet S48 (6) vs defenses (1)",
    "  attacker rolls: 0.213 HIT  0.884 miss  0.451 HIT  0.734 HIT  0.522 HIT  0.981 miss   → 5 hits",
    "  defense  rolls: 0.334 HIT                                                            → 1 hit",
    "  applied simultaneously — attacker −1 (5→? capped at defenses size 1), defenses −1 (1→0)",
    "  RESULT: defenses eliminated, attacker survives with 5 GI → CAPTURE",
    "  transports destroyed: 2 (INFECT drop)"
  ],

  "observer": {
    "player_id": "…", "faction": "Aurelian",
    "role": "third_party",         // attacker|defender|previous_owner|third_party
    "fog_level": "clear"           // clear|scouted|reported
  },
  "narration_hints": {
    "tone": "grim",                // infect capture → grim; repulsed → heroic; colonize → neutral
    "headline_seed": "Vesta Line falls to the Synod"
  }
}
```

The row's `message` field stays as a plain one-liner ("Sensors confirm Synod forces have overrun Vesta Line."). Debug detail lives in `details_json`.

## Implementation notes

### `resolveRound` change
```ts
interface RollRecord { i: number; roll: number; hit: boolean; }
interface RoundResult {
  aLeft: number; bLeft: number; aKilled: number; bKilled: number;
  aRolls: RollRecord[]; bRolls: RollRecord[];
}
```
Kill computation stays identical (cap at opposing pool size). Rolls are collected in a stable order (index 1..N) so the transcript is deterministic and matches the RNG stream.

### `debug_lines` builder
Pure function `formatTranscript(t: CombatTranscript): string[]`. Uses fixed-width formatting (`roll.toFixed(3)`, HIT/miss). Truncates roll lists over 40 entries to `head 20 … tail 20` with `… 12 more …` note.

### Observer resolution
- `attacker` = champion fleet owner's player row.
- `defender` / `previous_owner` = player whose `faction_name` matches `previousOwner`.
- Visible-to-others: single query
  `SELECT player_id FROM player_system_intel WHERE game_id=? AND system_id=? AND turn_number=? AND visible=true`.
- Scouted-hex fallback: iterate `ctx.players` and check `scouted_hex_ids.includes(hexIdOfSystem)`.
- Union, dedupe by `player_id`, compute `role` and `fog_level` per observer.

### Redaction per fog level
- `clear` / involved parties: full transcript + attacker faction + fleet name.
- `scouted`: transcript included but attacker's `fleet_name` replaced with `"Unidentified force"`; `ground_force_start/end` bucketed (`"small"`/`"medium"`/`"large"`).
- `reported` (involved but not visible — e.g. previous owner who has since lost all intel): transcript included; observers can always see engagements they were in.

### TurnLogViewer
When a row has `log_type === "dispatch_ground_combat"` and `showDetails`, render `debug_lines` inside a `<pre>` after the message. Keep the existing raw-JSON `<details>` fallback.

## Out of scope (Phase 2)

Edge function that reads `dispatch_ground_combat`, feeds `{system, attacker, defender, outcome, narration_hints}` (not the debug transcript) to the LLM, and patches `message`/headline with flavor prose. Debug transcript stays for admin/tester use.
