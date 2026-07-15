## Problem

Test-mode Save on the Garrison card clamps `current` to `max`. In `handleTestSetGarrison` (src/pages/PlayerGame.tsx:1242-1250):

```ts
const m = Math.max(0, Math.floor(max));
const c = Math.max(0, Math.min(m, Math.floor(current))); // ← clamp
```

Vesta Line (sid 14) has persisted `cur=1, max=0` (added earlier via the map editor, which does not clamp). In the game UI you type e.g. `Cur=8, Max=0` (or leave max blank at 0) and click Save. The clamp collapses the write to `0/0`, and the log confirms it — every recent `test_mode_edit` for this game persisted `0/0`:

```
TEST MODE: set garrison on system 16 → 0/0
TEST MODE: set garrison on system 14 → 0/0
```

The display "doesn't appear to change" because the write silently forces both fields to 0 whenever `max` is 0.

## Fix

Remove the clamp in Test Mode — it is a raw admin override, not the player-facing recruit path (which already clamps in `handleRecruitGarrison`).

**src/pages/PlayerGame.tsx** — `handleTestSetGarrison`:
- `m = max(0, floor(max))`
- `c = max(0, floor(current))` (no `min(m, …)`)
- Keep the existing log payload.

That's the only change. No UI, RPC, or type changes needed. After Save, `mapState` updates, `gameData.systems` re-derives, and `GarrisonCard` re-reads `current_ground_defenses`/`max_ground_defenses` — the display will reflect exactly what was typed.

## Out of scope

- Player-facing Draft/Disband buttons (already correctly clamped).
- Reconciling `max_ground_defenses` against facility `ground_defense_bonus` (turn engine already recomputes each turn; the stored value is the display source between turns and should remain admin-overridable).
