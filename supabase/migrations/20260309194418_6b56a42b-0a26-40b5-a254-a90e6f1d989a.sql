
ALTER TABLE public.ground_combat_outcomes
  DROP COLUMN min_force,
  DROP COLUMN max_force,
  DROP COLUMN casualties_inflicted,
  ADD COLUMN probability NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN damage NUMERIC NOT NULL DEFAULT 0;
