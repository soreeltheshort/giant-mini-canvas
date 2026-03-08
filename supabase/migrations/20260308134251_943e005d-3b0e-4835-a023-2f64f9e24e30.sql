
CREATE TABLE public.facility_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  icon text NOT NULL DEFAULT '🏭',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.facility_types ENABLE ROW LEVEL SECURITY;

-- Everyone can read facility types
CREATE POLICY "Facility types are public" ON public.facility_types
  FOR SELECT TO authenticated
  USING (true);

-- Admins can manage facility types
CREATE POLICY "Admins can insert facility types" ON public.facility_types
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update facility types" ON public.facility_types
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete facility types" ON public.facility_types
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Add updated_at trigger
CREATE TRIGGER update_facility_types_updated_at
  BEFORE UPDATE ON public.facility_types
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
