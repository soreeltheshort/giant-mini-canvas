
-- Add new columns to ship_types
ALTER TABLE public.ship_types 
  ADD COLUMN ship_id text,
  ADD COLUMN target_preference text NOT NULL DEFAULT '',
  ADD COLUMN maintenance numeric NOT NULL DEFAULT 0,
  ADD COLUMN map_speed integer NOT NULL DEFAULT 0,
  ADD COLUMN cbt_speed integer NOT NULL DEFAULT 0,
  ADD COLUMN laser_2_5cm integer NOT NULL DEFAULT 0,
  ADD COLUMN laser_4_5cm integer NOT NULL DEFAULT 0,
  ADD COLUMN laser_6_5cm integer NOT NULL DEFAULT 0,
  ADD COLUMN laser_10cm integer NOT NULL DEFAULT 0,
  ADD COLUMN laser_14cm integer NOT NULL DEFAULT 0,
  ADD COLUMN laser_20cm integer NOT NULL DEFAULT 0,
  ADD COLUMN laser_28cm integer NOT NULL DEFAULT 0,
  ADD COLUMN laser_50cm integer NOT NULL DEFAULT 0,
  ADD COLUMN missile_10kg integer NOT NULL DEFAULT 0,
  ADD COLUMN missile_50kg integer NOT NULL DEFAULT 0,
  ADD COLUMN missile_100kg integer NOT NULL DEFAULT 0,
  ADD COLUMN missile_half_kt integer NOT NULL DEFAULT 0,
  ADD COLUMN ground_invasion integer NOT NULL DEFAULT 0,
  ADD COLUMN repair_pod integer NOT NULL DEFAULT 0,
  ADD COLUMN supply_pod integer NOT NULL DEFAULT 0,
  ADD COLUMN scout_sensors integer NOT NULL DEFAULT 0,
  ADD COLUMN fighter_bay integer NOT NULL DEFAULT 0,
  ADD COLUMN fighter_storage integer NOT NULL DEFAULT 0,
  ADD COLUMN gun_ship_link integer NOT NULL DEFAULT 0,
  ADD COLUMN gunship_storage integer NOT NULL DEFAULT 0;

-- Drop old aggregate columns
ALTER TABLE public.ship_types 
  DROP COLUMN lasers,
  DROP COLUMN missiles,
  DROP COLUMN max_jump,
  DROP COLUMN supply_capacity;

-- Add armor_penetration to weapons
ALTER TABLE public.weapons ADD COLUMN armor_penetration integer NOT NULL DEFAULT 0;

-- Clear old data
DELETE FROM public.fleet_ships;
DELETE FROM public.ship_types;
DELETE FROM public.weapons;

-- Seed weapons
INSERT INTO public.weapons (name, type, damage, armor_penetration, hit_chance, range, rate_of_fire, point_cost) VALUES
('Laser 2.5cm', 'Laser', 1, 0, 0.70, 'Short', 1, 1),
('Laser 4.5cm', 'Laser', 2, 0, 0.65, 'Short', 1, 2),
('Laser 6.5cm', 'Laser', 3, 0, 0.60, 'Medium', 1, 3),
('Laser 10cm', 'Laser', 6, 0, 0.55, 'Medium', 1, 6),
('Laser 14cm', 'Laser', 8, 0, 0.50, 'Long', 1, 8),
('Laser 20cm', 'Laser', 11, 0, 0.45, 'Long', 1, 11),
('Laser 28cm', 'Laser', 14, 0, 0.40, 'Long', 1, 14),
('Laser 50cm', 'Laser', 18, 0, 0.35, 'Long', 1, 18),
('Missile 10kg', 'Missile', 2, 2, 0.60, 'Medium', 1, 3),
('Missile 50kg', 'Missile', 4, 3, 0.55, 'Medium', 1, 5),
('Missile 100kg', 'Missile', 5, 4, 0.50, 'Long', 1, 7),
('Missile 1/2kt', 'Missile', 8, 5, 0.45, 'Long', 1, 10);
