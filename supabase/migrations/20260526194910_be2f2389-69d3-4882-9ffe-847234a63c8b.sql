
ALTER TABLE public.naming_conventions DROP CONSTRAINT IF EXISTS naming_conventions_kind_check;
ALTER TABLE public.naming_conventions ADD CONSTRAINT naming_conventions_kind_check CHECK (kind = ANY (ARRAY['planet'::text, 'fleet'::text, 'ship'::text]));

ALTER TABLE public.factions ADD COLUMN IF NOT EXISTS ship_naming_convention_id uuid REFERENCES public.naming_conventions(id) ON DELETE SET NULL;
ALTER TABLE public.factions DROP COLUMN IF EXISTS planet_naming_convention_id;
ALTER TABLE public.factions DROP COLUMN IF EXISTS planet_naming_convention;

ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS planet_naming_convention_id uuid REFERENCES public.naming_conventions(id) ON DELETE SET NULL;
