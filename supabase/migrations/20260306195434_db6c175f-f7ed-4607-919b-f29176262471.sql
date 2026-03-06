
CREATE TABLE public.weapon_target_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  weapon_key text NOT NULL,
  hull_class text NOT NULL,
  priority integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(weapon_key, hull_class)
);

ALTER TABLE public.weapon_target_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Weapon target prefs are public" ON public.weapon_target_preferences FOR SELECT USING (true);
CREATE POLICY "Admins can insert weapon target prefs" ON public.weapon_target_preferences FOR INSERT WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update weapon target prefs" ON public.weapon_target_preferences FOR UPDATE USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete weapon target prefs" ON public.weapon_target_preferences FOR DELETE USING (has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_weapon_target_preferences_updated_at BEFORE UPDATE ON public.weapon_target_preferences FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
