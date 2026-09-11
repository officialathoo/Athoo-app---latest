-- Broadcast provider pre-filter support.
--
-- Broadcast delivery previously loaded every provider row into the API process
-- and filtered by distance in JavaScript. Candidate selection now applies an
-- eligibility-flag and lat/lng bounding-box pre-filter in SQL; these expression
-- indexes keep that pre-filter index-assisted even though latitude/longitude
-- are stored as text columns.
--
-- Idempotent: safe to re-run, never drops or rewrites data.

CREATE INDEX IF NOT EXISTS users_provider_geo_lat_num_idx
  ON users (((latitude::double precision)))
  WHERE role = 'provider';

CREATE INDEX IF NOT EXISTS users_provider_geo_lng_num_idx
  ON users (((longitude::double precision)))
  WHERE role = 'provider';
