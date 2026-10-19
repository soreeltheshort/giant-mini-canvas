ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS stance_lean_positive numeric NOT NULL DEFAULT 2.5,
  ADD COLUMN IF NOT EXISTS stance_lean_negative numeric NOT NULL DEFAULT -2.5,
  ADD COLUMN IF NOT EXISTS stance_strong_positive numeric NOT NULL DEFAULT 7.5,
  ADD COLUMN IF NOT EXISTS stance_strong_negative numeric NOT NULL DEFAULT -7.5;

COMMENT ON COLUMN public.senate_vote_types.lean_positive IS 'DEPRECATED: stance tolerances are global — read app_settings.stance_lean_positive instead';
COMMENT ON COLUMN public.senate_vote_types.lean_negative IS 'DEPRECATED: stance tolerances are global — read app_settings.stance_lean_negative instead';
COMMENT ON COLUMN public.senate_vote_types.strong_positive IS 'DEPRECATED: stance tolerances are global — read app_settings.stance_strong_positive instead';
COMMENT ON COLUMN public.senate_vote_types.strong_negative IS 'DEPRECATED: stance tolerances are global — read app_settings.stance_strong_negative instead';