-- 1) Per-game ship roster
CREATE TABLE public.game_fleet_ships (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  game_fleet_id uuid NOT NULL REFERENCES public.game_fleets(id) ON DELETE CASCADE,
  ship_type_id uuid NOT NULL REFERENCES public.ship_types(id),
  quantity integer NOT NULL DEFAULT 1,
  tactical_group text NOT NULL DEFAULT 'Core',
  notes text
);

CREATE INDEX idx_game_fleet_ships_game_fleet_id ON public.game_fleet_ships(game_fleet_id);
-- Unique on the natural key for clean upserts/aggregation
CREATE UNIQUE INDEX idx_game_fleet_ships_unique
  ON public.game_fleet_ships(game_fleet_id, ship_type_id, tactical_group);

-- 2) RLS
ALTER TABLE public.game_fleet_ships ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read game fleet ships"
  ON public.game_fleet_ships FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins and testers can insert game fleet ships"
  ON public.game_fleet_ships FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'tester'::app_role));

CREATE POLICY "Admins and testers can update game fleet ships"
  ON public.game_fleet_ships FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'tester'::app_role));

CREATE POLICY "Admins and testers can delete game fleet ships"
  ON public.game_fleet_ships FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'tester'::app_role));

-- 3) Auto-snapshot trigger: when a game_fleets row is inserted, copy
--    the current source fleet_ships rows into game_fleet_ships.
CREATE OR REPLACE FUNCTION public.snapshot_game_fleet_ships()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.game_fleet_ships (game_fleet_id, ship_type_id, quantity, tactical_group, notes)
  SELECT NEW.id, fs.ship_type_id, fs.quantity, fs.tactical_group, fs.notes
  FROM public.fleet_ships fs
  WHERE fs.fleet_id = NEW.fleet_id
  ON CONFLICT (game_fleet_id, ship_type_id, tactical_group)
  DO UPDATE SET quantity = public.game_fleet_ships.quantity + EXCLUDED.quantity;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_game_fleets_snapshot_ships
  AFTER INSERT ON public.game_fleets
  FOR EACH ROW
  EXECUTE FUNCTION public.snapshot_game_fleet_ships();

-- 4) Backfill: any game_fleets with no game_fleet_ships gets the current source composition
INSERT INTO public.game_fleet_ships (game_fleet_id, ship_type_id, quantity, tactical_group, notes)
SELECT gf.id, fs.ship_type_id, SUM(fs.quantity)::int, fs.tactical_group, MAX(fs.notes)
FROM public.game_fleets gf
JOIN public.fleet_ships fs ON fs.fleet_id = gf.fleet_id
WHERE NOT EXISTS (
  SELECT 1 FROM public.game_fleet_ships gfs WHERE gfs.game_fleet_id = gf.id
)
GROUP BY gf.id, fs.ship_type_id, fs.tactical_group;