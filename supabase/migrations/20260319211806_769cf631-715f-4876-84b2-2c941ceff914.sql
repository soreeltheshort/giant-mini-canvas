
CREATE TABLE public.game_fleets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  fleet_id uuid NOT NULL REFERENCES public.fleets(id) ON DELETE CASCADE,
  owner_classification text NOT NULL DEFAULT '',
  hex_x integer NOT NULL DEFAULT 0,
  hex_y integer NOT NULL DEFAULT 0,
  fleet_name text NOT NULL DEFAULT '',
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.game_fleets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can do everything with game_fleets"
  ON public.game_fleets FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Authenticated can read game_fleets"
  ON public.game_fleets FOR SELECT TO authenticated
  USING (true);
