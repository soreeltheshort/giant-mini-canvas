ALTER TABLE public.factions ADD COLUMN IF NOT EXISTS infect boolean NOT NULL DEFAULT false;

UPDATE public.factions
SET infect = true
WHERE lower(name) = 'synod' OR lower(code_name) LIKE 'synod%';