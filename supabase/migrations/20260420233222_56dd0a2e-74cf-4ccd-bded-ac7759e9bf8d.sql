-- Backfill: re-seed visible_system_ids for the Test12 game so explored-marches
-- (system.classification = 'MARCHES') systems are included even when the
-- underlying hex is still tagged 'UNEXPLORED_MARCHES'.
WITH g AS (
  SELECT map_data_json AS m FROM games WHERE id = '86e2395e-2e62-412c-811f-9e1cf6d446ae'
),
hex_class AS (
  SELECT (h->1->>'hex_id')::int AS hex_id, h->1->>'classification' AS hex_cls
  FROM g, jsonb_array_elements(m->'hexes') h
),
sys AS (
  SELECT (s->1->>'system_id')::int AS sid,
         (s->1->>'hex_id')::int AS hex_id,
         s->1->>'classification' AS sys_cls
  FROM g, jsonb_array_elements(m->'systems') s
),
baseline AS (
  SELECT DISTINCT s.sid
  FROM sys s LEFT JOIN hex_class hc USING(hex_id)
  WHERE upper(s.sys_cls) IN ('CORE','MARCHES') OR upper(s.sys_cls) LIKE 'PROVINCE\_%'
     OR upper(hc.hex_cls) IN ('CORE','MARCHES') OR upper(hc.hex_cls) LIKE 'PROVINCE\_%'
)
UPDATE public.game_players
SET visible_system_ids = (SELECT jsonb_agg(sid ORDER BY sid) FROM baseline)
WHERE game_id = '86e2395e-2e62-412c-811f-9e1cf6d446ae';