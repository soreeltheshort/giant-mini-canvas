-- Fleet size categories: points range → descriptor
CREATE TABLE public.fleet_size_categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  descriptor TEXT NOT NULL,
  min_points INTEGER NOT NULL DEFAULT 0,
  max_points INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.fleet_size_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Fleet size categories are public"
  ON public.fleet_size_categories FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Admins can insert fleet size categories"
  ON public.fleet_size_categories FOR INSERT
  TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update fleet size categories"
  ON public.fleet_size_categories FOR UPDATE
  TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete fleet size categories"
  ON public.fleet_size_categories FOR DELETE
  TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_fleet_size_categories_updated_at
  BEFORE UPDATE ON public.fleet_size_categories
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.fleet_size_categories (descriptor, min_points, max_points, sort_order) VALUES
  ('Skirmish Force', 0, 49, 1),
  ('Squadron',      50, 149, 2),
  ('Flotilla',     150, 299, 3),
  ('Task Force',   300, 599, 4),
  ('Battlegroup',  600, 999, 5),
  ('Armada',      1000, 999999, 6);

-- Player fleet intel: which enemy ship types a player has encountered in combat
CREATE TABLE public.player_fleet_intel (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  game_id UUID NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  observer_player_id UUID NOT NULL REFERENCES public.game_players(id) ON DELETE CASCADE,
  enemy_fleet_id UUID NOT NULL,
  ship_type_id UUID NOT NULL REFERENCES public.ship_types(id) ON DELETE CASCADE,
  quantity_seen INTEGER NOT NULL DEFAULT 0,
  last_seen_turn INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (observer_player_id, enemy_fleet_id, ship_type_id)
);

CREATE INDEX idx_player_fleet_intel_lookup
  ON public.player_fleet_intel (observer_player_id, enemy_fleet_id);

ALTER TABLE public.player_fleet_intel ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Players can read own intel"
  ON public.player_fleet_intel FOR SELECT
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.game_players gp
      WHERE gp.id = player_fleet_intel.observer_player_id AND gp.user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can read all intel"
  ON public.player_fleet_intel FOR SELECT
  TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert intel"
  ON public.player_fleet_intel FOR INSERT
  TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update intel"
  ON public.player_fleet_intel FOR UPDATE
  TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete intel"
  ON public.player_fleet_intel FOR DELETE
  TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_player_fleet_intel_updated_at
  BEFORE UPDATE ON public.player_fleet_intel
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();