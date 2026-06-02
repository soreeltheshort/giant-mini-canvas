DELETE FROM public.ai_persona_followthrough WHERE persona_id='12360be2-766f-4986-b367-b64d7ddec03c';
INSERT INTO public.ai_persona_followthrough (persona_id, step_order, activity_code, enabled, params_json) VALUES
('12360be2-766f-4986-b367-b64d7ddec03c', 1, 'repair_damaged_hulls', true, '{}'),
('12360be2-766f-4986-b367-b64d7ddec03c', 2, 'build_cheapest_offense_hull', true, '{}'),
('12360be2-766f-4986-b367-b64d7ddec03c', 3, 'build_defensive_strikecraft', true, '{}'),
('12360be2-766f-4986-b367-b64d7ddec03c', 4, 'garrison_ground_forces', true, '{}'),
('12360be2-766f-4986-b367-b64d7ddec03c', 5, 'build_cheapest_defense_hull', true, '{}'),
('12360be2-766f-4986-b367-b64d7ddec03c', 6, 'stockpile_treasury', true, '{}');