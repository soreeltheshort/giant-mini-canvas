
ALTER TABLE public.factions ADD COLUMN IF NOT EXISTS code_name TEXT;

UPDATE public.factions SET code_name = name || '_int' WHERE code_name IS NULL;

-- Distinguish the existing Synod / Lost Colonies row as the first of the set
UPDATE public.factions SET code_name = 'Synod_int1' WHERE name = 'Synod';
UPDATE public.factions SET code_name = 'Lost Colonies_int1' WHERE name = 'Lost Colonies';

ALTER TABLE public.factions ALTER COLUMN code_name SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS factions_code_name_unique ON public.factions(code_name);

-- Add 7 more Synod factions (int2..int8)
INSERT INTO public.factions (name, color, code_name)
SELECT 'Synod', '#888888', 'Synod_int' || g
FROM generate_series(2, 8) AS g
ON CONFLICT (code_name) DO NOTHING;

-- Add 11 more Lost Colonies factions (int2..int12)
INSERT INTO public.factions (name, color, code_name)
SELECT 'Lost Colonies', '#ffffff', 'Lost Colonies_int' || g
FROM generate_series(2, 12) AS g
ON CONFLICT (code_name) DO NOTHING;
