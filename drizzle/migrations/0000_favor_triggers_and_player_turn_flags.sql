ALTER TABLE public.favors
  ADD COLUMN IF NOT EXISTS trigger_type text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS trigger_params jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.game_factions
  ADD COLUMN IF NOT EXISTS turn_flags jsonb NOT NULL DEFAULT '{}'::jsonb;