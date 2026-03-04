
CREATE TABLE public.wiki_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  content text NOT NULL DEFAULT '',
  sort_order integer NOT NULL DEFAULT 0,
  parent_slug text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.wiki_pages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Wiki pages are public" ON public.wiki_pages FOR SELECT USING (true);
CREATE POLICY "Admins can insert wiki pages" ON public.wiki_pages FOR INSERT WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can update wiki pages" ON public.wiki_pages FOR UPDATE USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can delete wiki pages" ON public.wiki_pages FOR DELETE USING (has_role(auth.uid(), 'admin'::app_role));

-- Seed some starter pages
INSERT INTO public.wiki_pages (slug, title, content, sort_order) VALUES
  ('introduction', 'Introduction', '# Welcome to the Manual

This is the rules manual for MiniGiantGames. Use the sidebar to navigate between sections.

Admins can edit any page by clicking the **Edit** button.', 0),
  ('fleet-building', 'Fleet Building', '# Fleet Building Rules

## Points
Each ship has a point cost. Build your fleet by selecting ships within your budget.

## Tactical Groups
Ships are assigned to tactical groups that determine when they engage in battle:
- **Core** — Main battle line
- **Attack** — Aggressive forward element
- **Special 1 & 2** — Flanking, skirmishing, or special roles
- **Rear** — Reserve forces with defensive bonuses
- **Retreat** — Ships withdrawing from combat', 1),
  ('combat', 'Combat', '# Combat Rules

## Battle Phases
Combat proceeds through multiple phases. Each phase determines which tactical groups engage.

## Hit Chance
Hit chance is calculated as:
```
finalHitChance = clamp(baseHitChance + attackMod - defenseMod, min, max)
```

## Critical Hits
On a successful hit, a second roll determines if the hit is critical, multiplying damage.

## Damage
Damage is calculated with variance and reduced by target armor.', 2),
  ('ship-classes', 'Ship Classes', '# Ship Classes

## Hull Classes
- **Light** — Fast, fragile scouts and escorts
- **Medium** — Balanced combat vessels
- **Heavy** — Durable warships
- **Capital** — Massive flagships

## Combat Roles
- **General** — Targets smaller ships first
- **Assault** — Targets larger ships first
- **Escort** — Protects the fleet by targeting small threats', 3);
