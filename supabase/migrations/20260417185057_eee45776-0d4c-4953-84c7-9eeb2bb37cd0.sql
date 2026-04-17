-- Add new order types for the centralized orders model
ALTER TYPE public.order_type ADD VALUE IF NOT EXISTS 'set_readiness';
ALTER TYPE public.order_type ADD VALUE IF NOT EXISTS 'set_strategy';
ALTER TYPE public.order_type ADD VALUE IF NOT EXISTS 'fleet_composition_change';

-- Add phase column to game_logs for grouping by processing phase
ALTER TABLE public.game_logs
  ADD COLUMN IF NOT EXISTS phase text NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS game_logs_game_turn_phase_idx
  ON public.game_logs (game_id, turn_number, phase);