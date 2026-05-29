ALTER TABLE public.ai_personas
  ADD COLUMN IF NOT EXISTS enemy_strength_total_tolerance_pct numeric NOT NULL DEFAULT 0.15,
  ADD COLUMN IF NOT EXISTS enemy_strength_nearby_tolerance_pct numeric NOT NULL DEFAULT 0.25;