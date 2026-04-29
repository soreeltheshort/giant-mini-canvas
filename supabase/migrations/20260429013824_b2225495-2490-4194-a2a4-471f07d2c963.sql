-- 1) Drop the legacy unique constraint that forces one row per (fleet, type, group)
DROP INDEX IF EXISTS public.idx_game_fleet_ships_unique;

-- 2) Add per-ship state columns
ALTER TABLE public.game_fleet_ships
  ADD COLUMN IF NOT EXISTS current_hp integer,
  ADD COLUMN IF NOT EXISTS crippled boolean NOT NULL DEFAULT false;

-- 3) Expand existing aggregated rows: a row with quantity N becomes N rows of quantity 1
DO $$
DECLARE
  r record;
  i int;
BEGIN
  FOR r IN
    SELECT id, game_fleet_id, ship_type_id, quantity, tactical_group, notes
    FROM public.game_fleet_ships
    WHERE quantity > 1
  LOOP
    -- Reduce the existing row to qty 1
    UPDATE public.game_fleet_ships SET quantity = 1 WHERE id = r.id;
    -- Insert (quantity - 1) clones
    FOR i IN 1..(r.quantity - 1) LOOP
      INSERT INTO public.game_fleet_ships
        (game_fleet_id, ship_type_id, quantity, tactical_group, notes, current_hp, crippled)
      VALUES
        (r.game_fleet_id, r.ship_type_id, 1, r.tactical_group, r.notes, NULL, false);
    END LOOP;
  END LOOP;
END $$;

-- 4) Replace the snapshot trigger function so each ship is materialised as its own row
CREATE OR REPLACE FUNCTION public.snapshot_game_fleet_ships()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r record;
  i int;
BEGIN
  FOR r IN
    SELECT ship_type_id, tactical_group, quantity, notes
    FROM public.fleet_ships
    WHERE fleet_id = NEW.fleet_id
  LOOP
    FOR i IN 1..GREATEST(r.quantity, 1) LOOP
      INSERT INTO public.game_fleet_ships
        (game_fleet_id, ship_type_id, quantity, tactical_group, notes, current_hp, crippled)
      VALUES
        (NEW.id, r.ship_type_id, 1, r.tactical_group, r.notes, NULL, false);
    END LOOP;
  END LOOP;
  RETURN NEW;
END;
$function$;