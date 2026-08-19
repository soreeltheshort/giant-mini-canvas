-- Helper functions -------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_staff(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(_user_id, 'admin'::app_role) OR public.has_role(_user_id, 'tester'::app_role)
$$;
REVOKE ALL ON FUNCTION public.is_staff(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_staff(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.can_access_game(_game_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    _game_id IS NOT NULL
    AND (
      public.has_role(auth.uid(), 'admin'::app_role)
      OR EXISTS (SELECT 1 FROM public.games g WHERE g.id = _game_id AND g.created_by = auth.uid())
      OR EXISTS (SELECT 1 FROM public.game_factions gf WHERE gf.game_id = _game_id AND gf.user_id = auth.uid())
    )
$$;
REVOKE ALL ON FUNCTION public.can_access_game(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_game(uuid) TO authenticated, service_role;

CREATE INDEX IF NOT EXISTS idx_game_factions_game_user ON public.game_factions(game_id, user_id);
CREATE INDEX IF NOT EXISTS idx_game_fleets_game ON public.game_fleets(game_id);
CREATE INDEX IF NOT EXISTS idx_game_fleets_fleet ON public.game_fleets(fleet_id);

-- games -------------------------------------------------------------------
DROP POLICY IF EXISTS "Authenticated can read games" ON public.games;
CREATE POLICY "Members can read their games" ON public.games FOR SELECT TO authenticated
USING (public.can_access_game(id) OR status = 'setup'::game_status);

-- game_factions -----------------------------------------------------------
DROP POLICY IF EXISTS "Authenticated can read game_players" ON public.game_factions;
CREATE POLICY "Members can read game factions" ON public.game_factions FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR public.can_access_game(game_id)
  OR EXISTS (SELECT 1 FROM public.games g WHERE g.id = game_factions.game_id AND g.status = 'setup'::game_status)
);

-- game_fleets -------------------------------------------------------------
DROP POLICY IF EXISTS "Authenticated can read game_fleets" ON public.game_fleets;
CREATE POLICY "Members can read game fleets" ON public.game_fleets FOR SELECT TO authenticated
USING (public.can_access_game(game_id));

-- game_fleet_ships --------------------------------------------------------
DROP POLICY IF EXISTS "Authenticated can read game fleet ships" ON public.game_fleet_ships;
CREATE POLICY "Members can read game fleet ships" ON public.game_fleet_ships FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.game_fleets gf WHERE gf.id = game_fleet_ships.game_fleet_id AND public.can_access_game(gf.game_id)));

-- game_logs ---------------------------------------------------------------
DROP POLICY IF EXISTS "Authenticated can read game_logs" ON public.game_logs;
CREATE POLICY "Members can read game logs" ON public.game_logs FOR SELECT TO authenticated
USING (public.can_access_game(game_id));

-- game_snapshots ----------------------------------------------------------
DROP POLICY IF EXISTS "Authenticated can read game_snapshots" ON public.game_snapshots;
CREATE POLICY "Members can read game snapshots" ON public.game_snapshots FOR SELECT TO authenticated
USING (public.can_access_game(game_id));

-- ships_in_transit --------------------------------------------------------
DROP POLICY IF EXISTS "Authenticated can read ships in transit" ON public.ships_in_transit;
CREATE POLICY "Members can read ships in transit" ON public.ships_in_transit FOR SELECT TO authenticated
USING (public.can_access_game(game_id));

-- system_ship_production --------------------------------------------------
DROP POLICY IF EXISTS "Authenticated can read ship production" ON public.system_ship_production;
CREATE POLICY "Members can read ship production" ON public.system_ship_production FOR SELECT TO authenticated
USING (public.can_access_game(game_id));