
CREATE POLICY "Players can update own initialization"
  ON public.game_players FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
