
CREATE TABLE IF NOT EXISTS public.ship_hull_classes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  label text NOT NULL DEFAULT '',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ship_hull_classes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Hull classes are public"
  ON public.ship_hull_classes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins insert hull classes"
  ON public.ship_hull_classes FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins update hull classes"
  ON public.ship_hull_classes FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins delete hull classes"
  ON public.ship_hull_classes FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_ship_hull_classes_updated_at
  BEFORE UPDATE ON public.ship_hull_classes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.ship_hull_classes (code, sort_order) VALUES
  ('FS', 10), ('FH', 20), ('GS', 30), ('DD', 40),
  ('CL', 50), ('CM', 60), ('CH', 70), ('BB', 80), ('T', 90)
ON CONFLICT (code) DO NOTHING;

ALTER TABLE public.facility_types
  ALTER COLUMN max_ship_hull_class DROP NOT NULL,
  ALTER COLUMN max_ship_hull_class DROP DEFAULT;

UPDATE public.facility_types SET max_ship_hull_class = NULL WHERE max_ship_hull_class = 'Any';
