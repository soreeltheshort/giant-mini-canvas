
ALTER TABLE public.ai_plans
  ADD COLUMN IF NOT EXISTS slate_slot int,
  ADD COLUMN IF NOT EXISTS target_kind text,
  ADD COLUMN IF NOT EXISTS target_id text,
  ADD COLUMN IF NOT EXISTS target_label text,
  ADD COLUMN IF NOT EXISTS estimated_cost_credits int,
  ADD COLUMN IF NOT EXISTS estimated_cost_turns int,
  ADD COLUMN IF NOT EXISTS feasibility numeric,
  ADD COLUMN IF NOT EXISTS feasibility_reason text,
  ADD COLUMN IF NOT EXISTS committed_turn int,
  ADD COLUMN IF NOT EXISTS scoring_breakdown_json jsonb DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_ai_plans_game_player_slot ON public.ai_plans (game_id, player_id, slate_slot);
CREATE INDEX IF NOT EXISTS idx_ai_plans_status ON public.ai_plans (game_id, player_id, status);
