ALTER TABLE users ADD COLUMN IF NOT EXISTS availability_updated_at timestamptz;
ALTER TABLE users ADD COLUMN IF NOT EXISTS availability_override_reason text;

UPDATE users SET availability_updated_at = COALESCE(updated_at, now())
WHERE role = 'provider' AND availability_updated_at IS NULL;

CREATE INDEX IF NOT EXISTS bookings_provider_completed_at_idx
  ON bookings (provider_id, job_completed_at DESC)
  WHERE status = 'completed';
CREATE INDEX IF NOT EXISTS bookings_provider_status_updated_idx
  ON bookings (provider_id, status, updated_at DESC);
