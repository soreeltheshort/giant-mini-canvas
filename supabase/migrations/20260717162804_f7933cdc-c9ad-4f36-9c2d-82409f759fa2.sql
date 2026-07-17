
-- 1. New table: ai_goal_slates
CREATE TABLE IF NOT EXISTS public.ai_goal_slates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES public.game_factions(id) ON DELETE CASCADE,
  faction_key text,
  slot1_goal_id uuid REFERENCES public.ai_goals(id) ON DELETE SET NULL,
  slot2_goal_id uuid REFERENCES public.ai_goals(id) ON DELETE SET NULL,
  slot3_goal_id uuid REFERENCES public.ai_goals(id) ON DELETE SET NULL,
  committed_turn integer NOT NULL DEFAULT 0,
  next_mandatory_review_turn integer NOT NULL DEFAULT 0,
  worldview_snapshot_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  worldview_hash text NOT NULL DEFAULT '',
  last_revision_reason text NOT NULL DEFAULT 'initial',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (game_id, player_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_goal_slates TO authenticated;
GRANT ALL ON public.ai_goal_slates TO service_role;

ALTER TABLE public.ai_goal_slates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage all ai_goal_slates"
  ON public.ai_goal_slates FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Players read own ai_goal_slates"
  ON public.ai_goal_slates FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.game_factions gf
      WHERE gf.id = ai_goal_slates.player_id
        AND gf.user_id = auth.uid()
    )
  );

CREATE TRIGGER ai_goal_slates_touch_updated_at
  BEFORE UPDATE ON public.ai_goal_slates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. ai_goals: slate slot + progress + outcome
ALTER TABLE public.ai_goals
  ADD COLUMN IF NOT EXISTS slate_slot integer,
  ADD COLUMN IF NOT EXISTS progress_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS outcome text NOT NULL DEFAULT 'pending';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ai_goals_outcome_check'
  ) THEN
    ALTER TABLE public.ai_goals
      ADD CONSTRAINT ai_goals_outcome_check
      CHECK (outcome IN ('pending','achieved','abandoned','superseded'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ai_goals_slate_slot_check'
  ) THEN
    ALTER TABLE public.ai_goals
      ADD CONSTRAINT ai_goals_slate_slot_check
      CHECK (slate_slot IS NULL OR slate_slot BETWEEN 1 AND 3);
  END IF;
END$$;

-- 3. games: opt-in flag for AI slate phase
ALTER TABLE public.games
  ADD COLUMN IF NOT EXISTS enable_ai_slates boolean NOT NULL DEFAULT false;
