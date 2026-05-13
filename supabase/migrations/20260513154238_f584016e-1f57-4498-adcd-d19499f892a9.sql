
ALTER TABLE public.game_fleets
  ADD COLUMN IF NOT EXISTS is_garrison boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS system_id integer;

CREATE UNIQUE INDEX IF NOT EXISTS game_fleets_garrison_unique
  ON public.game_fleets (game_id, system_id)
  WHERE is_garrison = true;

CREATE INDEX IF NOT EXISTS game_fleets_is_garrison_idx
  ON public.game_fleets (game_id, is_garrison);

-- Helper: idempotently create one immobile garrison fleet per system in a game.
CREATE OR REPLACE FUNCTION public.ensure_game_garrisons(_game_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  game_creator uuid;
  systems_json jsonb;
  hexes_json jsonb;
  hex_lookup jsonb := '{}'::jsonb;
  hex_entry jsonb;
  sys jsonb;
  sys_id int;
  sys_name text;
  sys_owner text;
  sys_hex_id int;
  hx int;
  hy int;
  new_fleet_id uuid;
  created_count int := 0;
BEGIN
  SELECT created_by,
         map_data_json -> 'systems',
         map_data_json -> 'hexes'
    INTO game_creator, systems_json, hexes_json
  FROM public.games WHERE id = _game_id;

  IF systems_json IS NULL OR jsonb_typeof(systems_json) <> 'array' THEN
    RETURN 0;
  END IF;

  IF hexes_json IS NOT NULL AND jsonb_typeof(hexes_json) = 'array' THEN
    FOR hex_entry IN SELECT jsonb_array_elements(hexes_json) LOOP
      hex_lookup := hex_lookup || jsonb_build_object(
        (hex_entry->1->>'hex_id'),
        jsonb_build_object('x', hex_entry->1->>'x', 'y', hex_entry->1->>'y')
      );
    END LOOP;
  END IF;

  FOR sys IN SELECT jsonb_array_elements(systems_json) LOOP
    sys_id := NULLIF(sys->1->>'system_id','')::int;
    IF sys_id IS NULL THEN CONTINUE; END IF;
    sys_name := COALESCE(sys->1->>'system_name','System');
    sys_owner := COALESCE(sys->1->>'owner','');
    sys_hex_id := NULLIF(sys->1->>'hex_id','')::int;
    hx := COALESCE(NULLIF(hex_lookup->sys_hex_id::text->>'x','')::int, 0);
    hy := COALESCE(NULLIF(hex_lookup->sys_hex_id::text->>'y','')::int, 0);

    IF EXISTS (
      SELECT 1 FROM public.game_fleets
      WHERE game_id = _game_id AND is_garrison = true AND system_id = sys_id
    ) THEN CONTINUE; END IF;

    INSERT INTO public.fleets (owner_user_id, name, points_budget)
    VALUES (game_creator, 'Garrison: ' || sys_name, 0)
    RETURNING id INTO new_fleet_id;

    INSERT INTO public.game_fleets
      (game_id, fleet_id, fleet_name, owner_classification, hex_x, hex_y, is_garrison, system_id)
    VALUES
      (_game_id, new_fleet_id, 'Garrison: ' || sys_name, sys_owner, hx, hy, true, sys_id);

    created_count := created_count + 1;
  END LOOP;

  RETURN created_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_game_garrisons(uuid) TO authenticated;
