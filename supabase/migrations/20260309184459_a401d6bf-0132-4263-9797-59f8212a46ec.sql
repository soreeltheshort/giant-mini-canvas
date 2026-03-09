
CREATE TABLE public.ground_combat_outcomes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  min_force INTEGER NOT NULL DEFAULT 0,
  max_force INTEGER NOT NULL DEFAULT 0,
  casualties_inflicted INTEGER NOT NULL DEFAULT 0,
  description TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.ground_combat_outcomes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Ground combat outcomes are public" ON public.ground_combat_outcomes FOR SELECT TO public USING (true);
CREATE POLICY "Admins can insert ground combat outcomes" ON public.ground_combat_outcomes FOR INSERT TO public WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can update ground combat outcomes" ON public.ground_combat_outcomes FOR UPDATE TO public USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can delete ground combat outcomes" ON public.ground_combat_outcomes FOR DELETE TO public USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_ground_combat_outcomes_updated_at BEFORE UPDATE ON public.ground_combat_outcomes FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
