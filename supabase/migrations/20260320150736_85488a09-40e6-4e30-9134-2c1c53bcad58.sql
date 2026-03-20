ALTER TABLE public.game_players
  ADD COLUMN admin_capability integer NOT NULL DEFAULT 3,
  ADD COLUMN combat_capability integer NOT NULL DEFAULT 3,
  ADD COLUMN admin_points_remaining integer NOT NULL DEFAULT 3,
  ADD COLUMN combat_points_remaining integer NOT NULL DEFAULT 3;