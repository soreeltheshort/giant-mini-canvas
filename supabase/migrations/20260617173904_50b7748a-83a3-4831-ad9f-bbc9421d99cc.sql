
ALTER TABLE public.games
  ADD COLUMN IF NOT EXISTS parent_game_id uuid REFERENCES public.games(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS parent_snapshot_id uuid REFERENCES public.game_snapshots(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS forked_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_opened_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_games_parent_game_id ON public.games(parent_game_id);
CREATE INDEX IF NOT EXISTS idx_games_forked_at_desc ON public.games(forked_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_games_last_opened_at_desc ON public.games(last_opened_at DESC NULLS LAST);
