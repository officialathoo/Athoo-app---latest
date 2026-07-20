BEGIN;

ALTER TABLE payment_accounts
  ADD COLUMN IF NOT EXISTS qr_code_url TEXT;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS location_accuracy REAL,
  ADD COLUMN IF NOT EXISTS location_updated_at TIMESTAMP;

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS booking_public_id TEXT,
  ADD COLUMN IF NOT EXISTS rate_per_hour INTEGER,
  ADD COLUMN IF NOT EXISTS duration_minutes INTEGER,
  ADD COLUMN IF NOT EXISTS job_started_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS job_completed_at TIMESTAMP;

CREATE INDEX IF NOT EXISTS users_provider_location_freshness_idx
  ON users (location_updated_at)
  WHERE role = 'provider' AND is_available = true;

CREATE INDEX IF NOT EXISTS invoices_booking_public_id_idx
  ON invoices (booking_public_id);

CREATE INDEX IF NOT EXISTS invoices_booking_id_idx
  ON invoices (booking_id);

COMMIT;
