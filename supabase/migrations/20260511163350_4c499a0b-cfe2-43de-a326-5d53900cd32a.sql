-- 1. app_settings singleton table
CREATE TABLE IF NOT EXISTS public.app_settings (
  id text PRIMARY KEY DEFAULT 'global',
  default_map_id uuid REFERENCES public.saved_maps(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.app_settings (id) VALUES ('global') ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read app settings"
  ON public.app_settings FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can insert app settings"
  ON public.app_settings FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update app settings"
  ON public.app_settings FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- 2. saved_maps: allow any authenticated user to read all maps
CREATE POLICY "Authenticated can read all saved maps"
  ON public.saved_maps FOR SELECT TO authenticated USING (true);

-- 3. storage: allow authenticated to read map-files bucket
CREATE POLICY "Authenticated can read map-files"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'map-files');

-- 4. Tester creator policies on game-related tables.
-- A tester can fully manage games they created (games.created_by = auth.uid())
-- and all child rows attached to those games.

-- games
CREATE POLICY "Testers can insert own games"
  ON public.games FOR INSERT TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'tester'::app_role)
    AND created_by = auth.uid()
  );

CREATE POLICY "Testers can update own games"
  ON public.games FOR UPDATE TO authenticated
  USING (created_by = auth.uid() AND has_role(auth.uid(), 'tester'::app_role));

CREATE POLICY "Testers can delete own games"
  ON public.games FOR DELETE TO authenticated
  USING (created_by = auth.uid() AND has_role(auth.uid(), 'tester'::app_role));

-- game_players
CREATE POLICY "Testers can manage players in own games"
  ON public.game_players FOR ALL TO authenticated
  USING (
    has_role(auth.uid(), 'tester'::app_role)
    AND EXISTS (SELECT 1 FROM public.games g WHERE g.id = game_players.game_id AND g.created_by = auth.uid())
  )
  WITH CHECK (
    has_role(auth.uid(), 'tester'::app_role)
    AND EXISTS (SELECT 1 FROM public.games g WHERE g.id = game_players.game_id AND g.created_by = auth.uid())
  );

-- game_logs
CREATE POLICY "Testers can manage logs in own games"
  ON public.game_logs FOR ALL TO authenticated
  USING (
    has_role(auth.uid(), 'tester'::app_role)
    AND EXISTS (SELECT 1 FROM public.games g WHERE g.id = game_logs.game_id AND g.created_by = auth.uid())
  )
  WITH CHECK (
    has_role(auth.uid(), 'tester'::app_role)
    AND EXISTS (SELECT 1 FROM public.games g WHERE g.id = game_logs.game_id AND g.created_by = auth.uid())
  );

-- game_snapshots
CREATE POLICY "Testers can manage snapshots in own games"
  ON public.game_snapshots FOR ALL TO authenticated
  USING (
    has_role(auth.uid(), 'tester'::app_role)
    AND EXISTS (SELECT 1 FROM public.games g WHERE g.id = game_snapshots.game_id AND g.created_by = auth.uid())
  )
  WITH CHECK (
    has_role(auth.uid(), 'tester'::app_role)
    AND EXISTS (SELECT 1 FROM public.games g WHERE g.id = game_snapshots.game_id AND g.created_by = auth.uid())
  );

-- game_fleets
CREATE POLICY "Testers can manage fleets in own games"
  ON public.game_fleets FOR ALL TO authenticated
  USING (
    has_role(auth.uid(), 'tester'::app_role)
    AND EXISTS (SELECT 1 FROM public.games g WHERE g.id = game_fleets.game_id AND g.created_by = auth.uid())
  )
  WITH CHECK (
    has_role(auth.uid(), 'tester'::app_role)
    AND EXISTS (SELECT 1 FROM public.games g WHERE g.id = game_fleets.game_id AND g.created_by = auth.uid())
  );

-- game_fleet_ships (joined through game_fleets → games)
CREATE POLICY "Testers can manage fleet ships in own games"
  ON public.game_fleet_ships FOR ALL TO authenticated
  USING (
    has_role(auth.uid(), 'tester'::app_role)
    AND EXISTS (
      SELECT 1 FROM public.game_fleets gf
      JOIN public.games g ON g.id = gf.game_id
      WHERE gf.id = game_fleet_ships.game_fleet_id AND g.created_by = auth.uid()
    )
  )
  WITH CHECK (
    has_role(auth.uid(), 'tester'::app_role)
    AND EXISTS (
      SELECT 1 FROM public.game_fleets gf
      JOIN public.games g ON g.id = gf.game_id
      WHERE gf.id = game_fleet_ships.game_fleet_id AND g.created_by = auth.uid()
    )
  );

-- player_orders: testers can manage all orders in their own games (for impersonation/testing)
CREATE POLICY "Testers can manage orders in own games"
  ON public.player_orders FOR ALL TO authenticated
  USING (
    has_role(auth.uid(), 'tester'::app_role)
    AND EXISTS (SELECT 1 FROM public.games g WHERE g.id = player_orders.game_id AND g.created_by = auth.uid())
  )
  WITH CHECK (
    has_role(auth.uid(), 'tester'::app_role)
    AND EXISTS (SELECT 1 FROM public.games g WHERE g.id = player_orders.game_id AND g.created_by = auth.uid())
  );

-- player_system_intel: testers can manage in own games
CREATE POLICY "Testers can manage system intel in own games"
  ON public.player_system_intel FOR ALL TO authenticated
  USING (
    has_role(auth.uid(), 'tester'::app_role)
    AND EXISTS (SELECT 1 FROM public.games g WHERE g.id = player_system_intel.game_id AND g.created_by = auth.uid())
  )
  WITH CHECK (
    has_role(auth.uid(), 'tester'::app_role)
    AND EXISTS (SELECT 1 FROM public.games g WHERE g.id = player_system_intel.game_id AND g.created_by = auth.uid())
  );

-- player_fleet_intel: testers can manage in own games
CREATE POLICY "Testers can manage fleet intel in own games"
  ON public.player_fleet_intel FOR ALL TO authenticated
  USING (
    has_role(auth.uid(), 'tester'::app_role)
    AND EXISTS (SELECT 1 FROM public.games g WHERE g.id = player_fleet_intel.game_id AND g.created_by = auth.uid())
  )
  WITH CHECK (
    has_role(auth.uid(), 'tester'::app_role)
    AND EXISTS (SELECT 1 FROM public.games g WHERE g.id = player_fleet_intel.game_id AND g.created_by = auth.uid())
  );
