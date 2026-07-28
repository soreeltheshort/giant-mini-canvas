ALTER TABLE public.facility_types
  ADD COLUMN IF NOT EXISTS supply_range integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS requires_supply boolean NOT NULL DEFAULT true;