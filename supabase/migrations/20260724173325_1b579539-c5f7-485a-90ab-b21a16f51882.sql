GRANT SELECT ON public.ship_types TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.ship_types TO authenticated;
GRANT ALL ON public.ship_types TO service_role;

-- Same class of bug likely affects sibling reference tables read by the composer/hub.
GRANT SELECT ON public.fleets TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.fleets TO authenticated;
GRANT ALL ON public.fleets TO service_role;

GRANT SELECT ON public.fleet_ships TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.fleet_ships TO authenticated;
GRANT ALL ON public.fleet_ships TO service_role;

GRANT SELECT ON public.fleet_faction_tags TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.fleet_faction_tags TO authenticated;
GRANT ALL ON public.fleet_faction_tags TO service_role;

GRANT SELECT ON public.ship_hull_classes TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.ship_hull_classes TO authenticated;
GRANT ALL ON public.ship_hull_classes TO service_role;