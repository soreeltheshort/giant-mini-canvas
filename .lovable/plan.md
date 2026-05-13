# Mini Giant Games Studio Homepage

## Goal
Replace the current `/` page with a focused studio homepage anchored by the uploaded logo, presenting Third Republic as the studio's first game in development.

## Layout (top to bottom)

1. **Header** — existing site header (already shows "Mini Giant Games" on `/`).
2. **Studio mark** — the uploaded logo, centered, large but not full-bleed. Sits on the ivory background. Since the logo art has a dark navy backdrop baked in, it reads as a framed plaque on the ivory page rather than a dark-mode section.
3. **"Now in Development" section** — single feature card for Third Republic:
   - Cover art (left), title + short pitch (right)
   - Primary CTA → `/games/third-republic`
   - Secondary text link → "View all games" (`/games`)
4. **Footer** — existing footer.

No hero copy, no tagline, no About section, no social links — per project conventions.

## Assets
- Copy `user-uploads://1c6d595e-aef1-43cb-a008-41243de05d8f.png` → `src/assets/mini-giant-games-logo.png`
- Import as ES6 module in `Index.tsx`

## Files to change
- **`src/pages/Index.tsx`** — rewrite with the logo + single in-development game card (currently a generic games grid).
- **`src/assets/mini-giant-games-logo.png`** — new file.

## Out of scope
- Header/Footer changes
- Third Republic detail page (already holds the rich content moved last turn)
- Any new routes or backend work
