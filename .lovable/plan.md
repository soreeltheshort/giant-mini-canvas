## Goal
Give the player a quiet visual cue on every hex their sensors have **never** entered, so the unexplored frontier reads at a glance without cluttering the map.

## Where it fits
All hex drawing happens in `src/components/game-shell/PlayerMapCanvas.tsx` inside the hex loop around lines 240–296. Each hex already computes `isLive`, `isRemembered`, and an implicit "never seen" branch (the `else` at line 290). The indicator only renders in that never-seen branch, so live + remembered hexes are untouched.

## Recommended indicator
A single tiny dot at the hex center, drawn in faint bronze:

- 1px radius (scales with hex size: `Math.max(0.6, size * 0.06)`)
- Color `rgba(200,169,110,0.22)` — same bronze hue already used for the unscouted hex border, slightly above its alpha so the dot reads as intentional rather than as a render artifact
- No glow, no animation, no label
- Skipped for hexes that contain a system the player has ever seen (so explored systems don't get a competing center mark)
- Drawn only above a minimum zoom threshold (e.g. `zoom > 0.6`) so the fully-zoomed-out galaxy view stays clean

Result: zoomed in, the unexplored frontier looks like a faint dotted grid; zoomed out, it disappears into the fog.

## Alternatives (one-line)
- **Dashed hex border** instead of solid — readable but visually noisier than a dot.
- **Faint "?" glyph** at center — clear meaning but feels game-y against the Roman aesthetic.
- **Tiny corner tick** — subtle but harder to spot when scanning.

I'd ship the center dot and we can swap to one of the alternatives if it doesn't read well.

## Files to change
- `src/components/game-shell/PlayerMapCanvas.tsx` — add the dot draw inside the never-seen branch of the hex loop, after the border stroke.

No new props, no schema changes, no other files affected.