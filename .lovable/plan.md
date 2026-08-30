# Politics Mode — Faction Cards Surface

## Goal
When the player clicks the POLITICS mode tab in the game shell, the hex map is replaced by a politics surface: 9 playing-card-proportioned faction cards across the top, with a details window below that fills in as you hover a card. Dummy images and dummy attributes for now — this is layout plumbing for the politics section, not real diplomacy data yet.

## Current state (verified)
- Mode tabs live in `LeftPanel.tsx` (`MODE_ITEMS`, id `"diplomacy"` labeled "Politics") and call `onModeChange` → `handleModeChange` in `PlayerGame.tsx` (line 1227), which sets `activeMode` (line 369).
- The map (`PlayerMapCanvas`, PlayerGame.tsx ~line 2191) renders regardless of mode; mode currently only changes panel content.
- Faction data is available via `useFactions()` (`name`, `color`, `foreground_color`); up to 9 factions exist (6 provinces + Synod, Neutral Colonies, etc.).

## Changes

### 1. New component: `src/components/game-shell/PoliticsPanel.tsx`
- Fills the center area (same flex slot the map occupies).
- **Top row:** exactly 9 faction cards in a horizontal row (wrap to 2 rows on narrow screens), each with playing-card proportions (aspect ratio 5:7), ImperialCard styling: ivory marble face, bronze trim, crimson accent.
- Card content: dummy portrait image (see assets below), faction name in Cinzel, faction color swatch. Real faction names/colors from `useFactions` where available; padded with generic dummy cards ("Faction VII"…) up to 9.
- **Hover behavior:** `onMouseEnter` sets the hovered faction; a details window below the card row fills with that faction's dummy dossier: Leader, Government, Treasury, Military Strength, Relations, Influence, Stability (dummy values). Hover-out keeps the last-hovered faction shown (so the window isn't flickering empty); default selection = player's own faction.
- Light hover lift/tint on the active card; selected card gets a crimson border ring.

### 2. Dummy images
- Generate 3 Roman techno-classical portrait images (marble bust / imperial seal style, ivory/bronze/crimson palette) into `src/assets/` and cycle them across the 9 cards.

### 3. Wire into `src/pages/PlayerGame.tsx`
- In the center area (~line 2190): when `activeMode === "diplomacy"`, render `<PoliticsPanel ... />` instead of `PlayerMapCanvas`. All map props/targeting logic stays untouched — switching back to Military or Economy restores the map exactly as before.
- Clear any active hex/fleet targeting when entering Politics mode (a targeting prompt over a hidden map would be confusing).

## Out of scope
- Real diplomacy data, relationship values, or actions (envoys, treaties) — attributes are placeholders.
- NavRail `diplomacy` tab (that rail component is currently unused).
