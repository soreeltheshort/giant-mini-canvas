GRANT SELECT ON public.ai_persona_followthrough TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.ai_persona_followthrough TO authenticated;
GRANT ALL ON public.ai_persona_followthrough TO service_role;