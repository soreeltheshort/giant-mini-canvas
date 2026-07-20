
CREATE TABLE public.fleet_faction_tags (
  fleet_id uuid NOT NULL REFERENCES public.fleets(id) ON DELETE CASCADE,
  faction_id uuid NOT NULL REFERENCES public.factions(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (fleet_id, faction_id)
);

CREATE INDEX IF NOT EXISTS fleet_faction_tags_faction_idx ON public.fleet_faction_tags (faction_id);
CREATE INDEX IF NOT EXISTS fleet_faction_tags_fleet_idx   ON public.fleet_faction_tags (fleet_id);

GRANT SELECT ON public.fleet_faction_tags TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.fleet_faction_tags TO authenticated;
GRANT ALL ON public.fleet_faction_tags TO service_role;

ALTER TABLE public.fleet_faction_tags ENABLE ROW LEVEL SECURITY;

-- Anyone signed in may read tags (needed by fleet builder UI, AI code path, and admin tools).
CREATE POLICY "Authenticated users can read fleet faction tags"
  ON public.fleet_faction_tags FOR SELECT
  TO authenticated
  USING (true);

-- Only the fleet's owner or an admin may write tags.
CREATE POLICY "Fleet owner or admin can insert fleet faction tags"
  ON public.fleet_faction_tags FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (SELECT 1 FROM public.fleets f WHERE f.id = fleet_id AND f.owner_user_id = auth.uid())
  );

CREATE POLICY "Fleet owner or admin can delete fleet faction tags"
  ON public.fleet_faction_tags FOR DELETE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (SELECT 1 FROM public.fleets f WHERE f.id = fleet_id AND f.owner_user_id = auth.uid())
  );
