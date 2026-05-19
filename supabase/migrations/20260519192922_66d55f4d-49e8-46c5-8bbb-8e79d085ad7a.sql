
UPDATE public.weapons SET weapon_key = 'laser_light'       WHERE name = 'Light Laser'   AND weapon_key IS NULL;
UPDATE public.weapons SET weapon_key = 'laser_medium'      WHERE name = 'Medium Laser'  AND weapon_key IS NULL;
UPDATE public.weapons SET weapon_key = 'laser_heavy'       WHERE name = 'Heavy Laser'   AND weapon_key IS NULL;
UPDATE public.weapons SET weapon_key = 'laser_hull_breaker' WHERE name = 'Hull Breaker'  AND weapon_key IS NULL;
UPDATE public.weapons SET weapon_key = 'missile_synod'     WHERE name = 'Synod Missile' AND weapon_key IS NULL;
UPDATE public.weapons SET weapon_key = 'missile_kraken'    WHERE name = 'Kraken'        AND weapon_key IS NULL;

ALTER TABLE public.ship_types ADD COLUMN IF NOT EXISTS laser_light        integer NOT NULL DEFAULT 0;
ALTER TABLE public.ship_types ADD COLUMN IF NOT EXISTS laser_medium       integer NOT NULL DEFAULT 0;
ALTER TABLE public.ship_types ADD COLUMN IF NOT EXISTS laser_heavy        integer NOT NULL DEFAULT 0;
ALTER TABLE public.ship_types ADD COLUMN IF NOT EXISTS laser_hull_breaker integer NOT NULL DEFAULT 0;
ALTER TABLE public.ship_types ADD COLUMN IF NOT EXISTS missile_synod      integer NOT NULL DEFAULT 0;
ALTER TABLE public.ship_types ADD COLUMN IF NOT EXISTS missile_kraken     integer NOT NULL DEFAULT 0;
