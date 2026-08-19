UPDATE public.games SET enable_ai_slates = true WHERE enable_ai_slates = false;
ALTER TABLE public.games ALTER COLUMN enable_ai_slates SET DEFAULT true;