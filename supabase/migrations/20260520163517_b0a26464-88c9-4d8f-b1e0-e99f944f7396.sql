
-- =========================================================
-- AI ACTORS — Phase 1: Data Model
-- =========================================================

-- 1. Personas (global, admin-curated)
CREATE TABLE public.ai_personas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  description text NOT NULL DEFAULT '',
  aggression numeric NOT NULL DEFAULT 0.5,
  expansionism numeric NOT NULL DEFAULT 0.5,
  loyalty numeric NOT NULL DEFAULT 0.5,
  risk_tolerance numeric NOT NULL DEFAULT 0.5,
  economic_focus numeric NOT NULL DEFAULT 0.5,
  system_prompt text NOT NULL DEFAULT '',
  model_key text NOT NULL DEFAULT 'google/gemini-2.5-flash',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ai_personas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read personas" ON public.ai_personas FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can insert personas" ON public.ai_personas FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can update personas" ON public.ai_personas FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can delete personas" ON public.ai_personas FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE TRIGGER trg_ai_personas_updated BEFORE UPDATE ON public.ai_personas FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Per-persona goal weights (the personality-authoring matrix)
CREATE TABLE public.ai_persona_goal_weights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  persona_id uuid NOT NULL REFERENCES public.ai_personas(id) ON DELETE CASCADE,
  goal_type text NOT NULL,
  base_weight numeric NOT NULL DEFAULT 1,
  urgency_multiplier numeric NOT NULL DEFAULT 1,
  threshold_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (persona_id, goal_type)
);
ALTER TABLE public.ai_persona_goal_weights ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read goal weights" ON public.ai_persona_goal_weights FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can insert goal weights" ON public.ai_persona_goal_weights FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can update goal weights" ON public.ai_persona_goal_weights FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can delete goal weights" ON public.ai_persona_goal_weights FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE TRIGGER trg_ai_goal_weights_updated BEFORE UPDATE ON public.ai_persona_goal_weights FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Mark game_players as AI + link to persona
ALTER TABLE public.game_players
  ADD COLUMN is_ai boolean NOT NULL DEFAULT false,
  ADD COLUMN ai_persona_id uuid REFERENCES public.ai_personas(id) ON DELETE SET NULL;

-- 4. World beliefs (AI's derived memory)
CREATE TABLE public.ai_world_beliefs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES public.game_players(id) ON DELETE CASCADE,
  turn_number int NOT NULL DEFAULT 0,
  belief_key text NOT NULL,
  value_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  confidence numeric NOT NULL DEFAULT 0.5,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (player_id, belief_key)
);
ALTER TABLE public.ai_world_beliefs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage beliefs" ON public.ai_world_beliefs FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Testers manage beliefs in own games" ON public.ai_world_beliefs FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'tester'::app_role) AND EXISTS (SELECT 1 FROM public.games g WHERE g.id = ai_world_beliefs.game_id AND g.created_by = auth.uid()))
  WITH CHECK (has_role(auth.uid(), 'tester'::app_role) AND EXISTS (SELECT 1 FROM public.games g WHERE g.id = ai_world_beliefs.game_id AND g.created_by = auth.uid()));
CREATE TRIGGER trg_ai_beliefs_updated BEFORE UPDATE ON public.ai_world_beliefs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_ai_beliefs_player_turn ON public.ai_world_beliefs(player_id, turn_number);

-- 5. Relationships (AI's view of other actors)
CREATE TABLE public.ai_relationships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES public.game_players(id) ON DELETE CASCADE,
  target_player_id uuid NOT NULL REFERENCES public.game_players(id) ON DELETE CASCADE,
  opinion int NOT NULL DEFAULT 0,
  trust int NOT NULL DEFAULT 50,
  fear int NOT NULL DEFAULT 0,
  last_interaction_turn int NOT NULL DEFAULT 0,
  notes_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (player_id, target_player_id)
);
ALTER TABLE public.ai_relationships ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage relationships" ON public.ai_relationships FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Testers manage relationships in own games" ON public.ai_relationships FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'tester'::app_role) AND EXISTS (SELECT 1 FROM public.games g WHERE g.id = ai_relationships.game_id AND g.created_by = auth.uid()))
  WITH CHECK (has_role(auth.uid(), 'tester'::app_role) AND EXISTS (SELECT 1 FROM public.games g WHERE g.id = ai_relationships.game_id AND g.created_by = auth.uid()));
CREATE TRIGGER trg_ai_rel_updated BEFORE UPDATE ON public.ai_relationships FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 6. Relationship event log
CREATE TABLE public.ai_relationship_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES public.game_players(id) ON DELETE CASCADE,
  target_player_id uuid NOT NULL REFERENCES public.game_players(id) ON DELETE CASCADE,
  turn_number int NOT NULL DEFAULT 0,
  event_type text NOT NULL,
  opinion_delta int NOT NULL DEFAULT 0,
  trust_delta int NOT NULL DEFAULT 0,
  fear_delta int NOT NULL DEFAULT 0,
  details_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ai_relationship_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage rel events" ON public.ai_relationship_events FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Testers manage rel events in own games" ON public.ai_relationship_events FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'tester'::app_role) AND EXISTS (SELECT 1 FROM public.games g WHERE g.id = ai_relationship_events.game_id AND g.created_by = auth.uid()))
  WITH CHECK (has_role(auth.uid(), 'tester'::app_role) AND EXISTS (SELECT 1 FROM public.games g WHERE g.id = ai_relationship_events.game_id AND g.created_by = auth.uid()));
CREATE INDEX idx_ai_rel_events_player_turn ON public.ai_relationship_events(player_id, turn_number);

-- 7. Goals
CREATE TABLE public.ai_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES public.game_players(id) ON DELETE CASCADE,
  parent_goal_id uuid REFERENCES public.ai_goals(id) ON DELETE SET NULL,
  goal_type text NOT NULL,
  target_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  priority numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active',
  created_turn int NOT NULL DEFAULT 0,
  resolved_turn int,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ai_goals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage goals" ON public.ai_goals FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Testers manage goals in own games" ON public.ai_goals FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'tester'::app_role) AND EXISTS (SELECT 1 FROM public.games g WHERE g.id = ai_goals.game_id AND g.created_by = auth.uid()))
  WITH CHECK (has_role(auth.uid(), 'tester'::app_role) AND EXISTS (SELECT 1 FROM public.games g WHERE g.id = ai_goals.game_id AND g.created_by = auth.uid()));
CREATE TRIGGER trg_ai_goals_updated BEFORE UPDATE ON public.ai_goals FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_ai_goals_player_status ON public.ai_goals(player_id, status);

-- 8. Plans
CREATE TABLE public.ai_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES public.game_players(id) ON DELETE CASCADE,
  goal_id uuid NOT NULL REFERENCES public.ai_goals(id) ON DELETE CASCADE,
  created_turn int NOT NULL DEFAULT 0,
  target_completion_turn int,
  status text NOT NULL DEFAULT 'drafting',
  rationale text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ai_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage plans" ON public.ai_plans FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Testers manage plans in own games" ON public.ai_plans FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'tester'::app_role) AND EXISTS (SELECT 1 FROM public.games g WHERE g.id = ai_plans.game_id AND g.created_by = auth.uid()))
  WITH CHECK (has_role(auth.uid(), 'tester'::app_role) AND EXISTS (SELECT 1 FROM public.games g WHERE g.id = ai_plans.game_id AND g.created_by = auth.uid()));
CREATE TRIGGER trg_ai_plans_updated BEFORE UPDATE ON public.ai_plans FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 9. Plan steps
CREATE TABLE public.ai_plan_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES public.ai_plans(id) ON DELETE CASCADE,
  step_order int NOT NULL DEFAULT 0,
  step_type text NOT NULL,
  payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending',
  scheduled_turn int NOT NULL DEFAULT 0,
  executed_turn int,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ai_plan_steps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage plan steps" ON public.ai_plan_steps FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Testers manage plan steps in own games" ON public.ai_plan_steps FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'tester'::app_role) AND EXISTS (SELECT 1 FROM public.ai_plans p JOIN public.games g ON g.id = p.game_id WHERE p.id = ai_plan_steps.plan_id AND g.created_by = auth.uid()))
  WITH CHECK (has_role(auth.uid(), 'tester'::app_role) AND EXISTS (SELECT 1 FROM public.ai_plans p JOIN public.games g ON g.id = p.game_id WHERE p.id = ai_plan_steps.plan_id AND g.created_by = auth.uid()));
CREATE TRIGGER trg_ai_plan_steps_updated BEFORE UPDATE ON public.ai_plan_steps FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_ai_plan_steps_scheduled ON public.ai_plan_steps(plan_id, scheduled_turn, status);

-- 10. Decision audit log
CREATE TABLE public.ai_decision_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES public.game_players(id) ON DELETE CASCADE,
  turn_number int NOT NULL DEFAULT 0,
  phase text NOT NULL,
  summary text NOT NULL DEFAULT '',
  details_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ai_decision_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage decision log" ON public.ai_decision_log FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Testers manage decision log in own games" ON public.ai_decision_log FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'tester'::app_role) AND EXISTS (SELECT 1 FROM public.games g WHERE g.id = ai_decision_log.game_id AND g.created_by = auth.uid()))
  WITH CHECK (has_role(auth.uid(), 'tester'::app_role) AND EXISTS (SELECT 1 FROM public.games g WHERE g.id = ai_decision_log.game_id AND g.created_by = auth.uid()));
CREATE INDEX idx_ai_decision_log_player_turn ON public.ai_decision_log(player_id, turn_number);

-- 11. Link orders back to plan steps for traceability
ALTER TABLE public.player_orders
  ADD COLUMN source_plan_step_id uuid REFERENCES public.ai_plan_steps(id) ON DELETE SET NULL;
