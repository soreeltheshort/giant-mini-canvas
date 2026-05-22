CREATE TABLE public.naming_conventions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('planet','fleet')),
  names text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.naming_conventions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "naming_conventions readable by authenticated"
  ON public.naming_conventions FOR SELECT TO authenticated USING (true);

CREATE POLICY "naming_conventions admin insert"
  ON public.naming_conventions FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "naming_conventions admin update"
  ON public.naming_conventions FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "naming_conventions admin delete"
  ON public.naming_conventions FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_naming_conventions_updated_at
  BEFORE UPDATE ON public.naming_conventions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.factions
  ADD COLUMN planet_naming_convention_id uuid REFERENCES public.naming_conventions(id) ON DELETE SET NULL,
  ADD COLUMN fleet_naming_convention_id uuid REFERENCES public.naming_conventions(id) ON DELETE SET NULL;