-- fleets: owner, staff, or referenced by a game I can access ---------------
DROP POLICY IF EXISTS "Users can read all fleets" ON public.fleets;
CREATE POLICY "Owner staff or in-game read fleets" ON public.fleets FOR SELECT TO authenticated
USING (
  owner_user_id = auth.uid()
  OR public.is_staff(auth.uid())
  OR EXISTS (SELECT 1 FROM public.game_fleets gf WHERE gf.fleet_id = fleets.id AND public.can_access_game(gf.game_id))
);

DROP POLICY IF EXISTS "Users can read all fleet ships" ON public.fleet_ships;
CREATE POLICY "Owner staff or in-game read fleet ships" ON public.fleet_ships FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.fleets f WHERE f.id = fleet_ships.fleet_id AND (
    f.owner_user_id = auth.uid()
    OR public.is_staff(auth.uid())
    OR EXISTS (SELECT 1 FROM public.game_fleets gf WHERE gf.fleet_id = f.id AND public.can_access_game(gf.game_id))
  ))
);

DROP POLICY IF EXISTS "Authenticated users can read fleet faction tags" ON public.fleet_faction_tags;
CREATE POLICY "Owner staff or in-game read fleet faction tags" ON public.fleet_faction_tags FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.fleets f WHERE f.id = fleet_faction_tags.fleet_id AND (
    f.owner_user_id = auth.uid()
    OR public.is_staff(auth.uid())
    OR EXISTS (SELECT 1 FROM public.game_fleets gf WHERE gf.fleet_id = f.id AND public.can_access_game(gf.game_id))
  ))
);

-- Fleet template writes: keep owner rules, narrow blanket tester writes ----
DROP POLICY IF EXISTS "Users can insert own fleets" ON public.fleets;
CREATE POLICY "Users can insert own fleets" ON public.fleets FOR INSERT TO authenticated WITH CHECK (auth.uid() = owner_user_id);
DROP POLICY IF EXISTS "Users can update own fleets" ON public.fleets;
CREATE POLICY "Users can update own fleets" ON public.fleets FOR UPDATE TO authenticated USING (auth.uid() = owner_user_id) WITH CHECK (auth.uid() = owner_user_id);
DROP POLICY IF EXISTS "Users can delete own fleets" ON public.fleets;
CREATE POLICY "Users can delete own fleets" ON public.fleets FOR DELETE TO authenticated USING (auth.uid() = owner_user_id);

DROP POLICY IF EXISTS "Users can insert own fleet ships" ON public.fleet_ships;
CREATE POLICY "Users can insert own fleet ships" ON public.fleet_ships FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.fleets f WHERE f.id = fleet_ships.fleet_id AND f.owner_user_id = auth.uid()));
DROP POLICY IF EXISTS "Users can update own fleet ships" ON public.fleet_ships;
CREATE POLICY "Users can update own fleet ships" ON public.fleet_ships FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM public.fleets f WHERE f.id = fleet_ships.fleet_id AND f.owner_user_id = auth.uid()));
DROP POLICY IF EXISTS "Users can delete own fleet ships" ON public.fleet_ships;
CREATE POLICY "Users can delete own fleet ships" ON public.fleet_ships FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM public.fleets f WHERE f.id = fleet_ships.fleet_id AND f.owner_user_id = auth.uid()));

-- saved maps / configs: owner or staff ------------------------------------
DROP POLICY IF EXISTS "Authenticated can read all saved maps" ON public.saved_maps;
DROP POLICY IF EXISTS "Users can read own maps" ON public.saved_maps;
DROP POLICY IF EXISTS "Admins can read all maps" ON public.saved_maps;
CREATE POLICY "Owner or staff read saved maps" ON public.saved_maps FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "Authenticated can read factions configs" ON public.saved_factions_configs;
CREATE POLICY "Owner or staff read factions configs" ON public.saved_factions_configs FOR SELECT TO authenticated
USING (uploaded_by = auth.uid() OR public.is_staff(auth.uid()));

-- battle runs / events: creator or staff ----------------------------------
DROP POLICY IF EXISTS "Battle runs are public" ON public.battle_runs;
CREATE POLICY "Creator or staff read battle runs" ON public.battle_runs FOR SELECT TO authenticated
USING (created_by_user_id = auth.uid() OR public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "Battle events are public" ON public.battle_events;
CREATE POLICY "Creator or staff read battle events" ON public.battle_events FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.battle_runs br WHERE br.id = battle_events.battle_run_id AND (br.created_by_user_id = auth.uid() OR public.is_staff(auth.uid()))));

-- user_roles: explicit authenticated targeting ----------------------------
DROP POLICY IF EXISTS "Users can read own roles" ON public.user_roles;
CREATE POLICY "Users can read own roles" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Admins can read all roles" ON public.user_roles;
CREATE POLICY "Admins can read all roles" ON public.user_roles FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "Admins can insert roles" ON public.user_roles;
CREATE POLICY "Admins can insert roles" ON public.user_roles FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "Admins can delete roles" ON public.user_roles;
CREATE POLICY "Admins can delete roles" ON public.user_roles FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));

-- storage: drop blanket reads, add staff reads ----------------------------
DROP POLICY IF EXISTS "Authenticated can read map-files" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can read config files" ON storage.objects;
CREATE POLICY "Staff can read map files" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'map-files' AND public.is_staff(auth.uid()));
CREATE POLICY "Staff can read config files" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'config-files' AND public.is_staff(auth.uid()));