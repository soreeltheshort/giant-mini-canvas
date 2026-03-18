
CREATE TABLE public.game_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  turn_number integer NOT NULL DEFAULT 0,
  label text NOT NULL DEFAULT '',
  map_data_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.game_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can do everything with game_snapshots"
  ON public.game_snapshots FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Authenticated can read game_snapshots"
  ON public.game_snapshots FOR SELECT TO authenticated
  USING (true);
