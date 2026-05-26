ALTER TABLE public.game_players ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.game_players ALTER COLUMN player_slot DROP NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS game_players_game_faction_unique ON public.game_players (game_id, faction_id) WHERE faction_id IS NOT NULL AND user_id IS NULL;