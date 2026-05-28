INSERT INTO public.combat_constants (key, value, description)
VALUES ('infect_survivor_multiplier', 5, 'Multiplier applied to an INFECT-flagged invader''s surviving ground forces when both attacker and defender still have ground forces after a ground-combat round.')
ON CONFLICT (key) DO NOTHING;