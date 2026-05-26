
-- 1. Mark faction eligibility for players
ALTER TABLE public.factions
  ADD COLUMN IF NOT EXISTS is_player_faction boolean NOT NULL DEFAULT false;

UPDATE public.factions
   SET is_player_faction = true
 WHERE code_name IN ('Valerian','Aurelian','Cassian','Dravian','Marcellan','Octavian');

-- 2. Remove orphan game_players rows (no player, no AI)
DELETE FROM public.game_players
 WHERE user_id IS NULL AND ai_persona_id IS NULL;

-- 3. Rename game_players -> game_factions (FKs follow automatically)
ALTER TABLE public.game_players RENAME TO game_factions;

-- 4. Replace partial unique index with full one on (game_id, faction_id)
DO $$
DECLARE
  idx record;
BEGIN
  FOR idx IN
    SELECT indexname
      FROM pg_indexes
     WHERE schemaname = 'public'
       AND tablename = 'game_factions'
       AND indexname LIKE '%faction_id%'
       AND indexdef ILIKE '%where%'
  LOOP
    EXECUTE format('DROP INDEX IF EXISTS public.%I', idx.indexname);
  END LOOP;
END$$;

CREATE UNIQUE INDEX IF NOT EXISTS game_factions_game_faction_uniq
  ON public.game_factions(game_id, faction_id);

-- 5. CHECK: every game_factions row must have either a user or an AI persona
ALTER TABLE public.game_factions
  DROP CONSTRAINT IF EXISTS game_factions_has_operator;
ALTER TABLE public.game_factions
  ADD CONSTRAINT game_factions_has_operator
  CHECK (user_id IS NOT NULL OR ai_persona_id IS NOT NULL);

-- 6. Re-grant on the renamed table
GRANT SELECT, INSERT, UPDATE, DELETE ON public.game_factions TO authenticated;
GRANT ALL ON public.game_factions TO service_role;

-- 7. Tighten lobby-join policy: only player factions
DROP POLICY IF EXISTS "Users can join setup games" ON public.game_factions;
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
  AND EXISTS (
    SELECT 1 FROM public.factions f
     WHERE f.id = game_factions.faction_id
       AND f.is_player_faction = true
  )
);
