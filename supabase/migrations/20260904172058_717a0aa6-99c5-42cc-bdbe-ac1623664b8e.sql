CREATE TABLE public.senate_bloc_sets (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.senate_bloc_sets TO authenticated;
GRANT ALL ON public.senate_bloc_sets TO service_role;
ALTER TABLE public.senate_bloc_sets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view bloc sets" ON public.senate_bloc_sets FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can insert bloc sets" ON public.senate_bloc_sets FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update bloc sets" ON public.senate_bloc_sets FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete bloc sets" ON public.senate_bloc_sets FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.senate_blocs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  set_id uuid NOT NULL REFERENCES public.senate_bloc_sets(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  image_url text,
  accent_color text NOT NULL DEFAULT '#8a6d3b',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.senate_blocs TO authenticated;
GRANT ALL ON public.senate_blocs TO service_role;
ALTER TABLE public.senate_blocs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view blocs" ON public.senate_blocs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can insert blocs" ON public.senate_blocs FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update blocs" ON public.senate_blocs FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete blocs" ON public.senate_blocs FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_senate_blocs_set ON public.senate_blocs(set_id, sort_order);

CREATE TRIGGER update_senate_bloc_sets_updated_at BEFORE UPDATE ON public.senate_bloc_sets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_senate_blocs_updated_at BEFORE UPDATE ON public.senate_blocs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.app_settings ADD COLUMN default_senate_bloc_set_id uuid REFERENCES public.senate_bloc_sets(id) ON DELETE SET NULL;
ALTER TABLE public.games ADD COLUMN senate_bloc_set_id uuid REFERENCES public.senate_bloc_sets(id) ON DELETE SET NULL;

WITH s AS (
  INSERT INTO public.senate_bloc_sets (name, description)
  VALUES ('Republic Senate', 'Default slate of senate blocs contesting the Third Republic.')
  RETURNING id
)
INSERT INTO public.senate_blocs (set_id, name, description, accent_color, sort_order)
SELECT s.id, v.name, v.description, v.color, v.ord FROM s, (VALUES
  ('Optimate Concord', 'Old blood of the inner worlds. Guards precedent, property, and the right of the great houses to speak first.', '#7a2230', 1),
  ('Populares Union', 'Voice of the shipyard guilds and the hungry orbitals. Demands bread, berths, and a wider franchise.', '#8a6d3b', 2),
  ('Mercantile Curia', 'Charter holders and tariff barons. Every vote is priced, every price is negotiable.', '#b08d3a', 3),
  ('Collegium Technica', 'Engineers, surveyors, and drive-wrights who believe the Republic is a machine to be tuned.', '#2f5d63', 4),
  ('Cult of the Iron Sun', 'Ascetic order of the furnace worlds. Holds that only fire purifies a decadent Senate.', '#9c4a1a', 5),
  ('Legionary League', 'Serving officers and veteran colonies. Votes with the fleet budget and remembers every betrayal.', '#4a4f3a', 6),
  ('Frontier Petitioners', 'Rim delegates begging for garrisons and grain. Loud, poor, and increasingly armed.', '#3f6b4a', 7),
  ('Provincial Assembly', 'Governors'' proxies who trade provincial quiet for imperial indulgence.', '#5b4a7a', 8),
  ('Old Republic Loyalists', 'Antiquarians of the first charter. Would rather the Republic fall correctly than survive amended.', '#6b6b6b', 9)
) AS v(name, description, color, ord);

UPDATE public.app_settings
SET default_senate_bloc_set_id = (SELECT id FROM public.senate_bloc_sets ORDER BY created_at LIMIT 1)
WHERE id = 'global';