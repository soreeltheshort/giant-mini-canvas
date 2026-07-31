ALTER TABLE public.facility_types
  ADD COLUMN IF NOT EXISTS allowed_on text NOT NULL DEFAULT 'planet',
  ADD COLUMN IF NOT EXISTS population_bonus integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS hull_points integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS armor integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS laser_light integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS laser_medium integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS laser_heavy integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS laser_hull_breaker integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS missile_10kg integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS missile_50kg integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS missile_100kg integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS missile_half_kt integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS missile_synod integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS missile_kraken integer NOT NULL DEFAULT 0;

ALTER TABLE public.facility_types
  DROP CONSTRAINT IF EXISTS facility_types_allowed_on_check;
ALTER TABLE public.facility_types
  ADD CONSTRAINT facility_types_allowed_on_check CHECK (allowed_on IN ('planet','starbase','both'));