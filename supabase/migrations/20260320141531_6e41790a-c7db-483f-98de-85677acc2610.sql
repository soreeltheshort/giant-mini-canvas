ALTER TABLE public.game_players
  ADD COLUMN treasury integer NOT NULL DEFAULT 0,
  ADD COLUMN last_tribute integer NOT NULL DEFAULT 0,
  ADD COLUMN last_maintenance integer NOT NULL DEFAULT 0;