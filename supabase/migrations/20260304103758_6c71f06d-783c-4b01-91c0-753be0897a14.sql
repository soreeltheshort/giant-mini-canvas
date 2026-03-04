
CREATE TABLE public.weapons (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  type text NOT NULL DEFAULT 'Laser',
  damage integer NOT NULL DEFAULT 1,
  hit_chance numeric(5,2) NOT NULL DEFAULT 0.50,
  range text NOT NULL DEFAULT 'Medium',
  rate_of_fire integer NOT NULL DEFAULT 1,
  special_notes text DEFAULT '',
  point_cost integer NOT NULL DEFAULT 1,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.weapons ENABLE ROW LEVEL SECURITY;

-- Everyone can read
CREATE POLICY "Weapons are public" ON public.weapons FOR SELECT USING (true);

-- Only admins can insert/update/delete
CREATE POLICY "Admins can insert weapons" ON public.weapons FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update weapons" ON public.weapons FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete weapons" ON public.weapons FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Trigger for updated_at
CREATE TRIGGER update_weapons_updated_at BEFORE UPDATE ON public.weapons FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed initial weapons
INSERT INTO public.weapons (name, type, damage, hit_chance, range, rate_of_fire, special_notes, point_cost) VALUES
  ('Light Laser', 'Laser', 2, 0.70, 'Short', 2, 'Fast firing, low damage', 1),
  ('Medium Laser', 'Laser', 4, 0.60, 'Medium', 1, 'Standard laser armament', 2),
  ('Heavy Laser', 'Laser', 8, 0.50, 'Long', 1, 'High damage, lower accuracy', 4),
  ('Point Defense Laser', 'Laser', 1, 0.80, 'Short', 3, 'Anti-missile defense', 1),
  ('Light Missile', 'Missile', 6, 0.40, 'Long', 1, 'Standard missile', 3),
  ('Heavy Missile', 'Missile', 12, 0.35, 'Long', 1, 'Devastating but inaccurate', 5),
  ('Torpedo', 'Missile', 16, 0.30, 'Medium', 1, 'Close-range heavy ordnance', 6),
  ('Flak Battery', 'Kinetic', 3, 0.65, 'Short', 2, 'Effective against small craft', 2),
  ('Railgun', 'Kinetic', 10, 0.45, 'Long', 1, 'Armor-piercing kinetic weapon', 5),
  ('Plasma Cannon', 'Energy', 14, 0.40, 'Medium', 1, 'Ignores partial armor', 7);
