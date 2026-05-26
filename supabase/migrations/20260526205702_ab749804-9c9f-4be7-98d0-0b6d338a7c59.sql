
DROP POLICY IF EXISTS "Users can join setup games as player faction" ON public.game_factions;

CREATE POLICY "Users can join setup games as player faction"
ON public.game_factions
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.games g
     WHERE g.id = game_factions.game_id
       AND g.status = 'setup'::game_status
  )
  AND (
    faction_id IS NULL
    OR EXISTS (
      SELECT 1 FROM public.factions f
       WHERE f.id = game_factions.faction_id
         AND f.is_player_faction = true
    )
  )
);
