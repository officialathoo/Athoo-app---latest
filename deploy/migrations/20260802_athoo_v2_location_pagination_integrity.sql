-- Athoo App V2 canonical location snapshots and scalable booking cursors.
-- Additive and retry-safe. Existing records remain readable and are marked as
-- legacy until the user confirms the location in a V2 workflow.

BEGIN;

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS location_city text,
  ADD COLUMN IF NOT EXISTS location_area text,
  ADD COLUMN IF NOT EXISTS location_province text,
  ADD COLUMN IF NOT EXISTS location_country_code text,
  ADD COLUMN IF NOT EXISTS location_source text,
  ADD COLUMN IF NOT EXISTS location_accuracy real,
  ADD COLUMN IF NOT EXISTS location_confirmed_at timestamp,
  ADD COLUMN IF NOT EXISTS location_verified_at timestamp;

ALTER TABLE broadcast_requests
  ADD COLUMN IF NOT EXISTS location_city text,
  ADD COLUMN IF NOT EXISTS location_area text,
  ADD COLUMN IF NOT EXISTS location_province text,
  ADD COLUMN IF NOT EXISTS location_country_code text,
  ADD COLUMN IF NOT EXISTS location_source text,
  ADD COLUMN IF NOT EXISTS location_accuracy real,
  ADD COLUMN IF NOT EXISTS location_confirmed_at timestamp,
  ADD COLUMN IF NOT EXISTS location_verified_at timestamp;

ALTER TABLE negotiations
  ADD COLUMN IF NOT EXISTS location_city text,
  ADD COLUMN IF NOT EXISTS location_area text,
  ADD COLUMN IF NOT EXISTS location_province text,
  ADD COLUMN IF NOT EXISTS location_country_code text,
  ADD COLUMN IF NOT EXISTS location_source text,
  ADD COLUMN IF NOT EXISTS location_accuracy real,
  ADD COLUMN IF NOT EXISTS location_confirmed_at timestamp,
  ADD COLUMN IF NOT EXISTS location_verified_at timestamp;

ALTER TABLE saved_addresses
  ADD COLUMN IF NOT EXISTS location_city text,
  ADD COLUMN IF NOT EXISTS location_area text,
  ADD COLUMN IF NOT EXISTS location_province text,
  ADD COLUMN IF NOT EXISTS location_country_code text,
  ADD COLUMN IF NOT EXISTS location_source text,
  ADD COLUMN IF NOT EXISTS location_accuracy real,
  ADD COLUMN IF NOT EXISTS location_confirmed_at timestamp;

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS location_city text,
  ADD COLUMN IF NOT EXISTS location_area text,
  ADD COLUMN IF NOT EXISTS location_country_code text;

UPDATE bookings
SET location_source = COALESCE(location_source, 'legacy')
WHERE location_source IS NULL;

UPDATE broadcast_requests
SET location_source = COALESCE(location_source, 'legacy')
WHERE location_source IS NULL;

UPDATE negotiations
SET location_source = COALESCE(location_source, 'legacy')
WHERE location_source IS NULL;

UPDATE saved_addresses
SET location_source = COALESCE(location_source, 'legacy')
WHERE location_source IS NULL;

CREATE INDEX IF NOT EXISTS bookings_customer_updated_cursor_idx
  ON bookings (customer_id, updated_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS bookings_provider_updated_cursor_idx
  ON bookings (provider_id, updated_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS negotiations_customer_updated_cursor_idx
  ON negotiations (customer_id, updated_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS negotiations_provider_updated_cursor_idx
  ON negotiations (provider_id, updated_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS broadcast_requests_customer_updated_cursor_idx
  ON broadcast_requests (customer_id, updated_at DESC, id DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'bookings_location_accuracy_check'
  ) THEN
    ALTER TABLE bookings ADD CONSTRAINT bookings_location_accuracy_check
      CHECK (location_accuracy IS NULL OR (location_accuracy >= 0 AND location_accuracy <= 100000));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'broadcast_requests_location_accuracy_check'
  ) THEN
    ALTER TABLE broadcast_requests ADD CONSTRAINT broadcast_requests_location_accuracy_check
      CHECK (location_accuracy IS NULL OR (location_accuracy >= 0 AND location_accuracy <= 100000));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'negotiations_location_accuracy_check'
  ) THEN
    ALTER TABLE negotiations ADD CONSTRAINT negotiations_location_accuracy_check
      CHECK (location_accuracy IS NULL OR (location_accuracy >= 0 AND location_accuracy <= 100000));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'bookings_location_country_code_check'
  ) THEN
    ALTER TABLE bookings ADD CONSTRAINT bookings_location_country_code_check
      CHECK (location_country_code IS NULL OR location_country_code ~ '^[A-Z]{2}$');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'broadcast_requests_location_country_code_check'
  ) THEN
    ALTER TABLE broadcast_requests ADD CONSTRAINT broadcast_requests_location_country_code_check
      CHECK (location_country_code IS NULL OR location_country_code ~ '^[A-Z]{2}$');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'negotiations_location_country_code_check'
  ) THEN
    ALTER TABLE negotiations ADD CONSTRAINT negotiations_location_country_code_check
      CHECK (location_country_code IS NULL OR location_country_code ~ '^[A-Z]{2}$');
  END IF;
END $$;

COMMIT;
