ALTER TABLE public.game_fleets
  ADD COLUMN IF NOT EXISTS dest_x integer,
  ADD COLUMN IF NOT EXISTS dest_y integer,
  ADD COLUMN IF NOT EXISTS dest_set_turn integer;

COMMENT ON COLUMN public.game_fleets.dest_x IS 'Persistent movement waypoint X. Set when a fleet_move order does not reach its destination in one turn; cleared on arrival or cancellation.';
COMMENT ON COLUMN public.game_fleets.dest_y IS 'Persistent movement waypoint Y. See dest_x.';
COMMENT ON COLUMN public.game_fleets.dest_set_turn IS 'Turn on which the underlying fleet_move order was issued.';