ALTER TABLE public.senate_vote_types
  ADD COLUMN lean_positive numeric NOT NULL DEFAULT 2.5,
  ADD COLUMN lean_negative numeric NOT NULL DEFAULT -2.5,
  ADD COLUMN strong_positive numeric NOT NULL DEFAULT 7.5,
  ADD COLUMN strong_negative numeric NOT NULL DEFAULT -7.5;