ALTER TABLE public.fleets
  ADD COLUMN IF NOT EXISTS current_supply integer NOT NULL DEFAULT 0;

INSERT INTO public.combat_constants (key, value, description)
VALUES (
  'supply_capacity_coefficient',
  10,
  'Multiplier applied to the sum of ship supply_pod values to determine a fleet''s maximum supply capacity.'
)
ON CONFLICT (key) DO NOTHING;