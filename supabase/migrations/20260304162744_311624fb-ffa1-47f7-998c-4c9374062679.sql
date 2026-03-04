
-- Battle phases table
CREATE TABLE public.battle_phases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seq_order integer NOT NULL,
  name text NOT NULL,
  groups_a text[] NOT NULL DEFAULT '{}',
  groups_b text[] NOT NULL DEFAULT '{}',
  mod_a numeric NOT NULL DEFAULT 0,
  mod_b numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.battle_phases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Battle phases are public" ON public.battle_phases FOR SELECT USING (true);
CREATE POLICY "Admins can insert battle phases" ON public.battle_phases FOR INSERT WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can update battle phases" ON public.battle_phases FOR UPDATE USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can delete battle phases" ON public.battle_phases FOR DELETE USING (has_role(auth.uid(), 'admin'::app_role));

-- Group modifiers table
CREATE TABLE public.group_modifiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_name text NOT NULL UNIQUE,
  attack_mod numeric NOT NULL DEFAULT 0,
  defense_mod numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.group_modifiers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Group modifiers are public" ON public.group_modifiers FOR SELECT USING (true);
CREATE POLICY "Admins can insert group modifiers" ON public.group_modifiers FOR INSERT WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can update group modifiers" ON public.group_modifiers FOR UPDATE USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can delete group modifiers" ON public.group_modifiers FOR DELETE USING (has_role(auth.uid(), 'admin'::app_role));

-- Seed default data: phases
INSERT INTO public.battle_phases (seq_order, name, groups_a, groups_b, mod_a, mod_b) VALUES
  (1, 'Skirmishers vs Skirmishers', ARRAY['Special1'], ARRAY['Special1'], 0.1, 0.1),
  (2, 'Outflank vs Flank', ARRAY['Special2'], ARRAY['Special1','Special2'], 0.1, -0.1),
  (3, 'Flank vs Cover Retreat', ARRAY['Special1','Special2'], ARRAY['Retreat'], 0, 0),
  (4, 'Attack vs Attack', ARRAY['Core'], ARRAY['Core'], 0, 0),
  (5, 'Main Engagement', ARRAY['Core','Special1','Special2'], ARRAY['Core','Rear','Special1','Special2'], 0, 0);

-- Seed default data: group modifiers
INSERT INTO public.group_modifiers (group_name, attack_mod, defense_mod) VALUES
  ('Core', 0, 0),
  ('Attack', 0, 0),
  ('Special1', 0.1, -0.1),
  ('Special2', 0.1, -0.1),
  ('Rear', -0.1, 0.2),
  ('Retreat', 0, 0);
