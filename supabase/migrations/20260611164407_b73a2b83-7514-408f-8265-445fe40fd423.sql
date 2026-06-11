
ALTER TABLE public.games ADD COLUMN IF NOT EXISTS is_test_mode boolean NOT NULL DEFAULT false;

ALTER TABLE public.ai_world_beliefs DROP CONSTRAINT IF EXISTS ai_world_beliefs_player_id_belief_key_key;

ALTER TABLE public.ai_world_beliefs
  ADD CONSTRAINT ai_world_beliefs_game_player_key_turn_key
  UNIQUE (game_id, player_id, belief_key, turn_number);

CREATE INDEX IF NOT EXISTS ai_world_beliefs_lookup_idx
  ON public.ai_world_beliefs (game_id, player_id, belief_key, turn_number DESC);
