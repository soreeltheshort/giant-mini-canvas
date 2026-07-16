INSERT INTO public.combat_constants (key, value, description)
VALUES (
  'ground_defense_pop_divisor',
  20,
  'Divisor applied to a planet''s current population when computing baseline max ground defenses: max_ground_defenses = floor(current_population / divisor) + facility bonuses.'
)
ON CONFLICT (key) DO NOTHING;