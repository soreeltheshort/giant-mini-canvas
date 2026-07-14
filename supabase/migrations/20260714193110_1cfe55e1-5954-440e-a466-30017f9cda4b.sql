
ALTER TABLE public.game_snapshots
  ADD COLUMN IF NOT EXISTS game_fleets_json jsonb,
  ADD COLUMN IF NOT EXISTS game_fleet_ships_json jsonb,
  ADD COLUMN IF NOT EXISTS game_factions_json jsonb,
  ADD COLUMN IF NOT EXISTS player_system_intel_json jsonb,
  ADD COLUMN IF NOT EXISTS player_fleet_intel_json jsonb,
  ADD COLUMN IF NOT EXISTS player_orders_json jsonb,
  ADD COLUMN IF NOT EXISTS game_meta_json jsonb;
