CREATE TABLE public.senate_vote_types (
  key text PRIMARY KEY,
  label text NOT NULL,
  title_template text NOT NULL,
  description_template text NOT NULL,
  fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.senate_vote_types TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.senate_vote_types TO authenticated;
GRANT ALL ON public.senate_vote_types TO service_role;
ALTER TABLE public.senate_vote_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view vote types" ON public.senate_vote_types FOR SELECT USING (true);
CREATE POLICY "Admins manage vote types" ON public.senate_vote_types FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TABLE public.senate_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  vote_type text NOT NULL REFERENCES public.senate_vote_types(key),
  params jsonb NOT NULL DEFAULT '{}'::jsonb,
  title text NOT NULL,
  description text NOT NULL,
  sponsor_bloc_id uuid REFERENCES public.senate_blocs(id) ON DELETE SET NULL,
  proposed_by uuid NOT NULL DEFAULT auth.uid(),
  status text NOT NULL DEFAULT 'proposed',
  turn_number int,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.senate_proposals TO authenticated;
GRANT ALL ON public.senate_proposals TO service_role;
ALTER TABLE public.senate_proposals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Game members view proposals" ON public.senate_proposals FOR SELECT TO authenticated USING (public.can_access_game(game_id));
CREATE POLICY "Game members propose" ON public.senate_proposals FOR INSERT TO authenticated
  WITH CHECK (public.can_access_game(game_id) AND proposed_by = auth.uid());
CREATE POLICY "Admins manage proposals" ON public.senate_proposals FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE OR REPLACE FUNCTION public.validate_senate_proposal()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.vote_type = 'sanction_war' THEN
    IF coalesce(NEW.params->>'combatant_1','') = '' OR coalesce(NEW.params->>'combatant_2','') = '' THEN
      RAISE EXCEPTION 'Sanction War requires two combatants';
    END IF;
    IF NEW.params->>'combatant_1' = NEW.params->>'combatant_2' THEN
      RAISE EXCEPTION 'Combatants must be different factions';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_validate_senate_proposal BEFORE INSERT OR UPDATE ON public.senate_proposals
  FOR EACH ROW EXECUTE FUNCTION public.validate_senate_proposal();