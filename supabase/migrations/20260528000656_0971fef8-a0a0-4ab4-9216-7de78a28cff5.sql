
-- 1. Faction relationship overrides (directional viewer -> target)
CREATE TABLE public.faction_relationship_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  viewer_faction_id uuid NOT NULL REFERENCES public.factions(id) ON DELETE CASCADE,
  target_faction_id uuid NOT NULL REFERENCES public.factions(id) ON DELETE CASCADE,
  forced_class text NOT NULL CHECK (forced_class IN ('friend','enemy')),
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (viewer_faction_id, target_faction_id),
  CHECK (viewer_faction_id <> target_faction_id)
);
GRANT SELECT ON public.faction_relationship_overrides TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.faction_relationship_overrides TO authenticated;
GRANT ALL ON public.faction_relationship_overrides TO service_role;
ALTER TABLE public.faction_relationship_overrides ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read overrides" ON public.faction_relationship_overrides FOR SELECT USING (true);
CREATE POLICY "Admins insert overrides" ON public.faction_relationship_overrides FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins update overrides" ON public.faction_relationship_overrides FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins delete overrides" ON public.faction_relationship_overrides FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE TRIGGER trg_fro_updated_at BEFORE UPDATE ON public.faction_relationship_overrides FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Persona follow-through queue
CREATE TABLE public.ai_persona_followthrough (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  persona_id uuid NOT NULL REFERENCES public.ai_personas(id) ON DELETE CASCADE,
  step_order int NOT NULL,
  activity_code text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  params_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (persona_id, step_order)
);
GRANT SELECT ON public.ai_persona_followthrough TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_persona_followthrough TO authenticated;
GRANT ALL ON public.ai_persona_followthrough TO service_role;
ALTER TABLE public.ai_persona_followthrough ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read followthrough" ON public.ai_persona_followthrough FOR SELECT USING (true);
CREATE POLICY "Admins insert followthrough" ON public.ai_persona_followthrough FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins update followthrough" ON public.ai_persona_followthrough FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins delete followthrough" ON public.ai_persona_followthrough FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE TRIGGER trg_apf_updated_at BEFORE UPDATE ON public.ai_persona_followthrough FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Derived class columns on ai_relationships
ALTER TABLE public.ai_relationships
  ADD COLUMN derived_class text NOT NULL DEFAULT 'competitor' CHECK (derived_class IN ('friend','competitor','neutral','enemy')),
  ADD COLUMN class_source text NOT NULL DEFAULT 'dynamic' CHECK (class_source IN ('override','dynamic')),
  ADD COLUMN class_updated_turn int NOT NULL DEFAULT 0;
