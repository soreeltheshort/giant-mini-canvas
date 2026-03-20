
-- Turn phase enum
CREATE TYPE public.turn_phase AS ENUM ('orders', 'processing');

-- Add turn_phase column to games (default 'orders')
ALTER TABLE public.games ADD COLUMN turn_phase public.turn_phase NOT NULL DEFAULT 'orders';

-- Order type enum
CREATE TYPE public.order_type AS ENUM (
  'fleet_move',
  'build_facility',
  'scrap_facility',
  'set_standing_order',
  'diplomacy',
  'other'
);

-- Player orders table: one row per order per player per turn
CREATE TABLE public.player_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES public.game_players(id) ON DELETE CASCADE,
  turn_number INTEGER NOT NULL,
  order_type public.order_type NOT NULL DEFAULT 'other',
  order_json JSONB NOT NULL DEFAULT '{}',
  submitted_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  notes TEXT NOT NULL DEFAULT ''
);

-- Index for fast lookups
CREATE INDEX idx_player_orders_game_turn ON public.player_orders(game_id, turn_number);
CREATE INDEX idx_player_orders_player ON public.player_orders(player_id, turn_number);

-- Enable RLS
ALTER TABLE public.player_orders ENABLE ROW LEVEL SECURITY;

-- RLS: Admins full access
CREATE POLICY "Admins can do everything with player_orders"
  ON public.player_orders FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- RLS: Players can insert their own orders
CREATE POLICY "Players can insert own orders"
  ON public.player_orders FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.game_players gp
      WHERE gp.id = player_orders.player_id
        AND gp.user_id = auth.uid()
    )
  );

-- RLS: Players can read their own orders
CREATE POLICY "Players can read own orders"
  ON public.player_orders FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.game_players gp
      WHERE gp.id = player_orders.player_id
        AND gp.user_id = auth.uid()
    )
  );

-- RLS: Players can delete their own orders (before processing)
CREATE POLICY "Players can delete own orders"
  ON public.player_orders FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.game_players gp
        JOIN public.games g ON g.id = player_orders.game_id
      WHERE gp.id = player_orders.player_id
        AND gp.user_id = auth.uid()
        AND g.turn_phase = 'orders'
    )
  );

-- Track whether a player has finalized orders for the current turn
ALTER TABLE public.game_players ADD COLUMN orders_locked BOOLEAN NOT NULL DEFAULT false;
