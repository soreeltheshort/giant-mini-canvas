-- Reference/config tables: signed-in read only (no anonymous access) -------
DROP POLICY IF EXISTS "Public read followthrough" ON public.ai_persona_followthrough;
CREATE POLICY "Authenticated read followthrough" ON public.ai_persona_followthrough FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Battle phases are public" ON public.battle_phases;
CREATE POLICY "Authenticated read battle phases" ON public.battle_phases FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Combat constants are public" ON public.combat_constants;
CREATE POLICY "Authenticated read combat constants" ON public.combat_constants FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Public read overrides" ON public.faction_relationship_overrides;
CREATE POLICY "Authenticated read overrides" ON public.faction_relationship_overrides FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Ground combat outcomes are public" ON public.ground_combat_outcomes;
CREATE POLICY "Authenticated read ground combat outcomes" ON public.ground_combat_outcomes FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Group modifiers are public" ON public.group_modifiers;
CREATE POLICY "Authenticated read group modifiers" ON public.group_modifiers FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Ship types are public" ON public.ship_types;
CREATE POLICY "Authenticated read ship types" ON public.ship_types FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Weapon target prefs are public" ON public.weapon_target_preferences;
CREATE POLICY "Authenticated read weapon target prefs" ON public.weapon_target_preferences FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Weapons are public" ON public.weapons;
CREATE POLICY "Authenticated read weapons" ON public.weapons FOR SELECT TO authenticated USING (true);

-- Revoke anonymous grants on reference tables (wiki stays public) ---------
REVOKE ALL ON public.ai_persona_followthrough, public.ai_persona_goal_weights, public.ai_personas,
  public.app_settings, public.battle_phases, public.combat_constants, public.cutscene_slides,
  public.cutscenes, public.facility_types, public.faction_relationship_overrides, public.factions,
  public.fleet_size_categories, public.ground_combat_outcomes, public.group_modifiers,
  public.naming_conventions, public.planet_types, public.ship_hull_classes, public.ship_types,
  public.system_actions, public.weapon_target_preferences, public.weapons FROM anon;

-- Revoke anonymous grants on game/personal tables -------------------------
REVOKE ALL ON public.games, public.game_factions, public.game_fleets, public.game_fleet_ships,
  public.game_logs, public.game_snapshots, public.ships_in_transit, public.system_ship_production,
  public.fleets, public.fleet_ships, public.fleet_faction_tags, public.saved_maps,
  public.saved_factions_configs, public.player_orders, public.player_system_intel,
  public.player_fleet_intel, public.battle_runs, public.battle_events, public.user_roles FROM anon;