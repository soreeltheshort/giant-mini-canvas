CREATE TABLE public.senate_affinity_config (
  id text PRIMARY KEY,
  label text NOT NULL,
  icon_url text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.senate_affinity_config TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.senate_affinity_config TO authenticated;
GRANT ALL ON public.senate_affinity_config TO service_role;

ALTER TABLE public.senate_affinity_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view affinity config" ON public.senate_affinity_config FOR SELECT USING (true);
CREATE POLICY "Admins can insert affinity config" ON public.senate_affinity_config FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update affinity config" ON public.senate_affinity_config FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete affinity config" ON public.senate_affinity_config FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_senate_affinity_config_updated_at BEFORE UPDATE ON public.senate_affinity_config FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.senate_affinity_config (id, label, sort_order) VALUES
 ('peace','Peace',1),
 ('war','War',2),
 ('expansion','Expansion',3),
 ('improvement','Improvement',4),
 ('populist','Populist',5),
 ('patrician','Patrician',6),
 ('sullani','Sullani',7),
 ('mariani','Mariani',8),
 ('tsaesariani','Tsaesariani',9),
 ('pompeiani','Pompeiani',10);