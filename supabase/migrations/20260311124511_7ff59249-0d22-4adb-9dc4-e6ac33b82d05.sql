ALTER TABLE public.facility_types
  ADD COLUMN fighter_capacity integer NOT NULL DEFAULT 0,
  ADD COLUMN gunship_capacity integer NOT NULL DEFAULT 0;