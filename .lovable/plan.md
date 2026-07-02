# Clickable Submission Issue (One at a Time)

Replace the current red list at the bottom of the left panel with a single-issue banner. It shows the first outstanding blocker; when it's resolved, the next one appears; when none remain, the banner disappears and Submit Turn becomes enabled. The banner is clickable and jumps to the fleet causing it.

## Behavior

- Only the **first** issue in the current list is rendered.
- The banner is a button. Clicking it:
  1. Selects the offending fleet (`setSelection({ type: "army", id: "fleet-<id>" })`).
  2. Opens the right panel to Fleet Detail.
- When the user fixes that issue, the effect re-runs and either:
  - Shows the next issue, or
  - Clears the banner and enables Submit Turn.
- Submit Turn remains disabled while any issue exists (unchanged logic — still driven by `submissionIssues.length > 0`).
- Small `1 of N` counter shown next to the message so the user knows more may follow. If only one issue exists, no counter.

## Scope of issue types wired up

All existing issues produced in `PlayerGame.tsx` (lines 930–978) are tied to a specific fleet, so all get a `fleetId` target:
- Strikecraft over-capacity (fighters/gunships per tactical group)
- Attack target no longer exists
- Attack target out of range
- Attack target not visible

## Technical Details

**`src/pages/PlayerGame.tsx`**
- Change `submissionIssues` state type from `string[]` to `SubmissionIssue[]`:
  ```ts
  type SubmissionIssue = { message: string; fleetId?: string };
  ```
- In the issues-building effect, push `{ message, fleetId: f.fleet_id }` instead of raw strings. Order is preserved so the "first" issue is stable across re-renders.
- Add `handleIssueClick(issue)` mirroring `handleFleetClick`: sets selection + opens right panel.
- Pass `submissionIssues` (new shape) and `onIssueClick` to `LeftPanel`.

**`src/components/game-shell/LeftPanel.tsx`**
- Update `submissionIssues` prop type to `SubmissionIssue[]`; add optional `onIssueClick(issue)`.
- Replace the `<ul>` with a single `<button>` banner rendering only `submissionIssues[0]`:
  - Crimson palette (same as today).
  - Hover: `bg-crimson/10`; focus ring in bronze; cursor pointer.
  - Small right-aligned counter `1 / N` when `N > 1`.
- Submit button disable logic unchanged.

## Out of scope

- Map panning/centering on the fleet's hex (no pan helper exists today).
- Changing which conditions produce an issue.
- Any backend / turn-validation changes.
