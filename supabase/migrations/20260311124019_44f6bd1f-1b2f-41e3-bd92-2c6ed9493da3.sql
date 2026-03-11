ALTER TABLE public.facility_types
  ADD COLUMN consumed_facility_id uuid REFERENCES public.facility_types(id) ON DELETE SET NULL DEFAULT NULL;