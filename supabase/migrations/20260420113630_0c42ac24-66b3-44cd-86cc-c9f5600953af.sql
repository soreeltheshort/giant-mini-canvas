-- Player system intel: per-player "last known state" snapshot of a system.
-- Used to render fog-of-war memory: a system the player once saw but no
-- longer has in sensor range still shows its last-known data, faded.
CREATE TABLE public.player_system_intel (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  observer_player_id uuid NOT NULL REFERENCES public.game_players(id) ON DELETE CASCADE,
  system_id integer NOT NULL,
  last_seen_turn integer NOT NULL DEFAULT 0,
  snapshot_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (observer_player_id, system_id)
);

CREATE INDEX idx_player_system_intel_observer ON public.player_system_intel (observer_player_id);
CREATE INDEX idx_player_system_intel_game ON public.player_system_intel (game_id);

ALTER TABLE public.player_system_intel ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Players can read own system intel"
ON public.player_system_intel
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.game_players gp
    WHERE gp.id = player_system_intel.observer_player_id
      AND gp.user_id = auth.uid()
  )
);

CREATE POLICY "Admins can read all system intel"
ON public.player_system_intel
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert system intel"
ON public.player_system_intel
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update system intel"
ON public.player_system_intel
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete system intel"
ON public.player_system_intel
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_player_system_intel_updated_at
BEFORE UPDATE ON public.player_system_intel
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();