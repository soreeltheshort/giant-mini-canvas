ALTER TABLE public.senate_blocs
  ADD COLUMN IF NOT EXISTS senate_votes integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS affinities text[] NOT NULL DEFAULT '{}'::text[];