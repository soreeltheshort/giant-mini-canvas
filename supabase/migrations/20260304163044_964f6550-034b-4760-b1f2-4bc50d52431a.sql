
CREATE TABLE public.combat_constants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  value numeric NOT NULL DEFAULT 0,
  description text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.combat_constants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Combat constants are public" ON public.combat_constants FOR SELECT USING (true);
CREATE POLICY "Admins can insert combat constants" ON public.combat_constants FOR INSERT WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can update combat constants" ON public.combat_constants FOR UPDATE USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can delete combat constants" ON public.combat_constants FOR DELETE USING (has_role(auth.uid(), 'admin'::app_role));

-- Seed hit chance formula constants
INSERT INTO public.combat_constants (key, value, description) VALUES
  ('hit_chance_min', 0.10, 'Minimum possible hit chance after all modifiers'),
  ('hit_chance_max', 0.95, 'Maximum possible hit chance after all modifiers'),
  ('dmg_variance_min', 0.70, 'Minimum damage variance multiplier'),
  ('dmg_variance_range', 0.60, 'Range added to min variance (actual = min + rand*range)'),
  ('critical_hit_chance', 0.05, 'Chance of a critical hit on a successful hit roll'),
  ('critical_hit_multiplier', 2.0, 'Damage multiplier applied on critical hits');
