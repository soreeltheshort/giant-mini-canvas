
CREATE TABLE public.planet_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  min_initial_condition integer NOT NULL DEFAULT 0,
  max_initial_condition integer NOT NULL DEFAULT 100,
  min_resources integer NOT NULL DEFAULT 0,
  max_resources integer NOT NULL DEFAULT 100,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.planet_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Planet types are public" ON public.planet_types FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can insert planet types" ON public.planet_types FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can update planet types" ON public.planet_types FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can delete planet types" ON public.planet_types FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
