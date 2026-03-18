
-- Game status enum
CREATE TYPE public.game_status AS ENUM ('setup', 'active', 'paused', 'completed');

-- Games table
CREATE TABLE public.games (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  status public.game_status NOT NULL DEFAULT 'setup',
  turn_number INTEGER NOT NULL DEFAULT 0,
  map_data_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Game players table
CREATE TABLE public.game_players (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  game_id UUID NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  faction_id UUID REFERENCES public.factions(id),
  player_slot INTEGER NOT NULL CHECK (player_slot BETWEEN 1 AND 6),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (game_id, player_slot),
  UNIQUE (game_id, user_id)
);

-- Game logs table
CREATE TABLE public.game_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  game_id UUID NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  turn_number INTEGER NOT NULL DEFAULT 0,
  log_type TEXT NOT NULL DEFAULT 'info',
  message TEXT NOT NULL DEFAULT '',
  details_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.games ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_logs ENABLE ROW LEVEL SECURITY;

-- Games policies
CREATE POLICY "Admins can do everything with games" ON public.games FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Authenticated can read games" ON public.games FOR SELECT TO authenticated USING (true);

-- Game players policies
CREATE POLICY "Admins can do everything with game_players" ON public.game_players FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Authenticated can read game_players" ON public.game_players FOR SELECT TO authenticated USING (true);

-- Game logs policies
CREATE POLICY "Admins can do everything with game_logs" ON public.game_logs FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Authenticated can read game_logs" ON public.game_logs FOR SELECT TO authenticated USING (true);

-- Updated_at trigger for games
CREATE TRIGGER update_games_updated_at BEFORE UPDATE ON public.games FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
