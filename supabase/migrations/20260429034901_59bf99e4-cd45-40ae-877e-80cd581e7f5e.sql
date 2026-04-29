UPDATE games
SET map_data_json = jsonb_set(
  map_data_json,
  '{fleets}',
  jsonb_build_array(
    jsonb_build_object(
      'hex_x', -9,
      'hex_y', 8,
      'fleet_id', '11111111-1111-1111-1111-111111111101',
      'fleet_name', 'Cruisers in Attack',
      'source_fleet_id', 'bd1a7cb3-5d02-4cba-af43-5d1b427d5a0e',
      'owner_classification', 'PROVINCE_4'
    ),
    jsonb_build_object(
      'hex_x', -9,
      'hex_y', 9,
      'fleet_id', '11111111-1111-1111-1111-111111111102',
      'fleet_name', 'Cruisers in Attack',
      'source_fleet_id', 'bd1a7cb3-5d02-4cba-af43-5d1b427d5a0e',
      'owner_classification', 'PROVINCE_2'
    )
  )
)
WHERE id = '9387da4e-10e8-4594-b26e-750785ce8d7b';