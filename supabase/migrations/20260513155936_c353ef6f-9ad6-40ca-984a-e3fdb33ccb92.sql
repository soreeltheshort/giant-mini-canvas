
-- 1. New facility_types column for ship-yard output
ALTER TABLE public.facility_types
  ADD COLUMN IF NOT EXISTS ship_build_capacity integer NOT NULL DEFAULT 0;

-- 2. Per-system ship production queue
CREATE TABLE IF NOT EXISTS public.system_ship_production (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid NOT NULL,
  system_id integer NOT NULL,
  position integer NOT NULL DEFAULT 0,
  ship_type_id uuid NOT NULL,
  quantity integer NOT NULL DEFAULT 1,
  destination_fleet_id uuid,
  points_remaining integer NOT NULL DEFAULT 0,
  cost_paid integer NOT NULL DEFAULT 0,
  owner_classification text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ssp_game_system ON public.system_ship_production(game_id, system_id, position);

ALTER TABLE public.system_ship_production ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read ship production"
  ON public.system_ship_production FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins manage ship production"
  ON public.system_ship_production FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Owners manage ship production in own games"
  ON public.system_ship_production FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM games g WHERE g.id = system_ship_production.game_id AND g.created_by = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM games g WHERE g.id = system_ship_production.game_id AND g.created_by = auth.uid()));

CREATE POLICY "Players manage ship production in own systems"
  ON public.system_ship_production FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM game_players gp
    WHERE gp.game_id = system_ship_production.game_id
      AND gp.user_id = auth.uid()
      AND gp.faction_id::text = system_ship_production.owner_classification
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM game_players gp
    WHERE gp.game_id = system_ship_production.game_id
      AND gp.user_id = auth.uid()
  ));

CREATE TRIGGER trg_ssp_updated BEFORE UPDATE ON public.system_ship_production
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Virtual ships in transit (no map presence)
CREATE TABLE IF NOT EXISTS public.ships_in_transit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid NOT NULL,
  owner_classification text NOT NULL DEFAULT '',
  ship_type_id uuid NOT NULL,
  quantity integer NOT NULL DEFAULT 1,
  destination_fleet_id uuid,
  origin_system_id integer,
  virt_x integer NOT NULL DEFAULT 0,
  virt_y integer NOT NULL DEFAULT 0,
  created_turn integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sit_game ON public.ships_in_transit(game_id);
CREATE INDEX IF NOT EXISTS idx_sit_dest ON public.ships_in_transit(destination_fleet_id);

ALTER TABLE public.ships_in_transit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read ships in transit"
  ON public.ships_in_transit FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins manage ships in transit"
  ON public.ships_in_transit FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Owners manage ships in transit in own games"
  ON public.ships_in_transit FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM games g WHERE g.id = ships_in_transit.game_id AND g.created_by = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM games g WHERE g.id = ships_in_transit.game_id AND g.created_by = auth.uid()));

CREATE TRIGGER trg_sit_updated BEFORE UPDATE ON public.ships_in_transit
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
