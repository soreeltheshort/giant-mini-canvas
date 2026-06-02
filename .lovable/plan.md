## Goal

Remove red-on-dark text from the Factions Config screen (`/map-testing/config`) so it's legible for red-green color blindness. Replace with a warm mustard yellow / burnt orange tone that fits the existing Roman techno-classical palette (ivory + bronze).

## Approach

Introduce a new semantic token `--alert` (mustard yellow, roughly `hsl(38 78% 55%)` — sits between bronze and a burnt-orange highlight) in `src/index.css` and `tailwind.config.ts`, exposing `text-alert` and `accent-alert` utility classes. This keeps everything routed through design tokens rather than hard-coded hex.

Then swap every red usage on the Factions Config page from `text-destructive` / `accent-destructive` to the new `text-alert` / `accent-alert`:

- `src/pages/MapTestingConfig.tsx` — lines 259, 402, 408, 468, 470, 522, 605, 889 (Infect label, Infect checkbox accent, Delete buttons)
- `src/components/factions-config/RelationshipOverridesPanel.tsx` — lines 99 (enemy label) and 105 (× remove button)

Scope is limited to these two files (everything rendered on /map-testing/config). Other screens that use `text-destructive` are left untouched.

## Color choice

Default to **mustard yellow** `hsl(42 85% 55%)` for strong contrast on the dark/marble surfaces. If you'd prefer **burnt orange** `hsl(22 80% 50%)` instead, say so and I'll use that value when I implement.

## Out of scope

- No behavior changes (Delete still deletes, Infect still toggles).
- No changes to `--destructive` itself, so destructive styling elsewhere in the app is unaffected.
