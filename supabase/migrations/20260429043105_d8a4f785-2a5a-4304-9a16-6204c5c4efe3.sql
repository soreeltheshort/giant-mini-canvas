-- Add a stable engine key to weapons so the battle engine can map DB rows to ship_types weapon mount columns
ALTER TABLE public.weapons ADD COLUMN IF NOT EXISTS weapon_key TEXT;

-- Backfill weapon_key based on existing names
UPDATE public.weapons SET weapon_key = 'laser_2_5cm'    WHERE name = 'Laser 2.5cm';
UPDATE public.weapons SET weapon_key = 'laser_4_5cm'    WHERE name = 'Laser 4.5cm';
UPDATE public.weapons SET weapon_key = 'laser_6_5cm'    WHERE name = 'Laser 6.5cm';
UPDATE public.weapons SET weapon_key = 'laser_10cm'     WHERE name = 'Laser 10cm';
UPDATE public.weapons SET weapon_key = 'laser_14cm'     WHERE name = 'Laser 14cm';
UPDATE public.weapons SET weapon_key = 'laser_20cm'     WHERE name = 'Laser 20cm';
UPDATE public.weapons SET weapon_key = 'laser_28cm'     WHERE name = 'Laser 28cm';
UPDATE public.weapons SET weapon_key = 'laser_50cm'     WHERE name = 'Laser 50cm';
UPDATE public.weapons SET weapon_key = 'missile_10kg'   WHERE name = 'Missile 10kg';
UPDATE public.weapons SET weapon_key = 'missile_50kg'   WHERE name = 'Missile 50kg';
UPDATE public.weapons SET weapon_key = 'missile_100kg'  WHERE name = 'Missile 100kg';
UPDATE public.weapons SET weapon_key = 'missile_half_kt' WHERE name = 'Missile 1/2kt';

-- Enforce uniqueness so each engine key maps to exactly one weapon row
CREATE UNIQUE INDEX IF NOT EXISTS weapons_weapon_key_uniq ON public.weapons(weapon_key) WHERE weapon_key IS NOT NULL;
