
-- Owners (any authenticated user) can manage games they created
CREATE POLICY "Owners can insert own games"
ON public.games FOR INSERT TO authenticated
WITH CHECK (created_by = auth.uid());

CREATE POLICY "Owners can update own games"
ON public.games FOR UPDATE TO authenticated
USING (created_by = auth.uid())
WITH CHECK (created_by = auth.uid());

CREATE POLICY "Owners can delete own games"
ON public.games FOR DELETE TO authenticated
USING (created_by = auth.uid());

-- Owners can manage children of their own games
CREATE POLICY "Owners can manage fleets in own games"
ON public.game_fleets FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.games g WHERE g.id = game_fleets.game_id AND g.created_by = auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM public.games g WHERE g.id = game_fleets.game_id AND g.created_by = auth.uid()));

CREATE POLICY "Owners can manage fleet ships in own games"
ON public.game_fleet_ships FOR ALL TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.game_fleets gf
  JOIN public.games g ON g.id = gf.game_id
  WHERE gf.id = game_fleet_ships.game_fleet_id AND g.created_by = auth.uid()
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.game_fleets gf
  JOIN public.games g ON g.id = gf.game_id
  WHERE gf.id = game_fleet_ships.game_fleet_id AND g.created_by = auth.uid()
));

CREATE POLICY "Owners can manage logs in own games"
ON public.game_logs FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.games g WHERE g.id = game_logs.game_id AND g.created_by = auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM public.games g WHERE g.id = game_logs.game_id AND g.created_by = auth.uid()));

-- Any authenticated user can claim an open seat in a game still in setup
CREATE POLICY "Users can join setup games"
ON public.game_players FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (SELECT 1 FROM public.games g WHERE g.id = game_players.game_id AND g.status = 'setup')
);
