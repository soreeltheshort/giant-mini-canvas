ALTER TABLE public.fleets ADD COLUMN special1_role text NOT NULL DEFAULT 'Flank';
ALTER TABLE public.fleets ADD COLUMN special2_role text NOT NULL DEFAULT 'Flank';
ALTER TABLE public.fleet_ships DROP COLUMN special_role;