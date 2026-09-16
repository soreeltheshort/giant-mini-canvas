CREATE TABLE public.favor_sets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.favor_sets TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.favor_sets TO authenticated;
GRANT ALL ON public.favor_sets TO service_role;

ALTER TABLE public.favor_sets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view favor sets" ON public.favor_sets FOR SELECT USING (true);
CREATE POLICY "Admins can insert favor sets" ON public.favor_sets FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can update favor sets" ON public.favor_sets FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can delete favor sets" ON public.favor_sets FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_favor_sets_updated_at BEFORE UPDATE ON public.favor_sets FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.favors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  set_id uuid NOT NULL REFERENCES public.favor_sets(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'New Favor',
  description text NOT NULL DEFAULT '',
  variables jsonb NOT NULL DEFAULT '[]'::jsonb,
  criterion_type text NOT NULL DEFAULT 'credit_auction',
  criterion_params jsonb NOT NULL DEFAULT '{}'::jsonb,
  rarity text NOT NULL DEFAULT 'common',
  rarity_weight integer NOT NULL DEFAULT 100,
  bloc_reward integer NOT NULL DEFAULT 0,
  affinity_reward integer NOT NULL DEFAULT 0,
  target_bloc_ids uuid[] NOT NULL DEFAULT '{}',
  target_affinities text[] NOT NULL DEFAULT '{}',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.favors TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.favors TO authenticated;
GRANT ALL ON public.favors TO service_role;

ALTER TABLE public.favors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view favors" ON public.favors FOR SELECT USING (true);
CREATE POLICY "Admins can insert favors" ON public.favors FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can update favors" ON public.favors FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can delete favors" ON public.favors FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX idx_favors_set_id ON public.favors(set_id);

CREATE TRIGGER update_favors_updated_at BEFORE UPDATE ON public.favors FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS default_favor_set_id uuid;