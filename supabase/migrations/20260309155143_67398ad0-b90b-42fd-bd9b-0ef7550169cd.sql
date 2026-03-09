
-- Factions table
CREATE TABLE public.factions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  color text NOT NULL DEFAULT '#888888',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.factions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Factions are public" ON public.factions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can insert factions" ON public.factions FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update factions" ON public.factions FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete factions" ON public.factions FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'));

-- Actions table (economic actions for systems)
CREATE TABLE public.system_actions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  icon text NOT NULL DEFAULT '⚡',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.system_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Actions are public" ON public.system_actions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can insert actions" ON public.system_actions FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update actions" ON public.system_actions FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete actions" ON public.system_actions FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'));
