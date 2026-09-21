# Senate Voting Interface (dummy data)

Add a voting surface to the Politics screen: review an open vote and set how you want to sway each bloc, plus propose a new vote. All content is dummy data for now — nothing is saved or resolved yet, except one real admin setting.

## Where it lives

Politics gets a tab strip at the top of the lower area, using the existing TabControl:

`FAVORES | VOTES | PROPOSE`

The bloc card row stays across the top on every tab, and the right-hand detail card stays shared — clicking a bloc still opens its dossier there.

```text
[ bloc cards x9 ................................ ]
[ FAVORES | VOTES | PROPOSE ]
[ tab content (2/3)          ][ detail card (1/3) ]
```

## Votes tab — influencing an open vote

Header shows the dummy open vote: title, sponsoring bloc, short text, turns remaining, and a running tally of projected Yea / Nay / Abstain votes.

Below it, one row per senate bloc:

- Bloc name, its senate votes, and its inherent preference on this vote (Leans Yea / Leans Nay / Undecided) with a barrier number — the influence you must overcome to swing it your way.
- Your choice: Yea / Nay / Leave alone.
- Influence to commit: a number box, drawing from your available influence pool (dummy total shown above the list).
- A "Spend 1 Admin Point" toggle per bloc that multiplies the committed influence by the configured coefficient (default 1.5) — shown as "12 -> 18".
- A live outcome hint: effective influence vs. the bloc's barrier, marked Swung / Not enough.

Totals bar at the bottom: influence committed, admin points spent, projected result of the vote.

## Propose tab — new vote

A simple form: vote title, description, a required sponsoring senate bloc chosen from a dropdown of the blocs in the active set, a vote category (dummy list, e.g. War Powers, Appropriations, Censure, Colonial Charter), and a Submit button that just shows a confirmation toast for now. A short note explains the sponsor requirement and shows the sponsor's affinities so the choice reads as meaningful.

## Admin setting

Assets > Politics gains an "Influence Coefficient" field in the settings area above Senate Blocs (next to the affinities table): the multiplier applied when a player spends 1 admin point, default 1.5, editable and stored globally so the game reads one value.

## Technical notes

- New `src/components/game-shell/politics/VotesPanel.tsx` and `ProposeVotePanel.tsx`; `PoliticsPanel.tsx` keeps the bloc row, tab state and shared dossier, and renders the active tab into the left two-thirds.
- Dummy data lives in one file (`src/lib/votingDummy.ts`) so swapping it for real data later is a single change: open vote, bloc preferences/barriers, player influence pool and admin points.
- Real persistence: add `app_settings.influence_admin_point_multiplier` (numeric, default 1.5) with a small `src/lib/votingConfig.ts` getter/setter, read by the Votes tab and edited in AdminPolitics.
- Styling reuses ImperialCard, TabControl and the existing dossier helpers; no new visual language.

## Out of scope

- Saving vote choices, resolving votes at turn processing, AI bloc behaviour, deducting influence or admin points.
