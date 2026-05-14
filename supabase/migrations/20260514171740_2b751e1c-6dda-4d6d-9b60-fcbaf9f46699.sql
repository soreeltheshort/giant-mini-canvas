ALTER TABLE public.system_ship_production
  ADD COLUMN IF NOT EXISTS destination_hex_x integer,
  ADD COLUMN IF NOT EXISTS destination_hex_y integer;