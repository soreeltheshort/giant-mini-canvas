ALTER TABLE public.senate_vote_types
  ADD COLUMN affinity_weights jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.senate_vote_types.affinity_weights IS 'Map of affinity id -> score weight. A bloc''s pre-influence score sums the weights of the affinities it holds (positive leans yea, negative leans nay).';

UPDATE public.senate_vote_types
SET affinity_weights = '{"war": 5, "peace": -5, "expansion": 2.5, "improvement": -2.5}'::jsonb
WHERE key = 'sanction_war';