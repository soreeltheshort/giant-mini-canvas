ALTER TABLE public.factions
  ADD COLUMN IF NOT EXISTS ai_persona_id uuid NULL,
  ADD COLUMN IF NOT EXISTS planet_naming_convention text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS fleet_naming_convention text NOT NULL DEFAULT '';