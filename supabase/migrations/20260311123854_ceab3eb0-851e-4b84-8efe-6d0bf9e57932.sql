ALTER TABLE public.facility_types
  ADD COLUMN turns_to_build integer NOT NULL DEFAULT 1,
  ADD COLUMN construction_kickback integer NOT NULL DEFAULT 0;