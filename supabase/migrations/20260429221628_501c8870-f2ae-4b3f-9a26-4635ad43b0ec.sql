INSERT INTO public.combat_constants (key, value, description)
VALUES ('supply_cost_coefficient', 1, 'Treasury cost per unit of supply replenished by a fleet (charged as maintenance).')
ON CONFLICT (key) DO NOTHING;