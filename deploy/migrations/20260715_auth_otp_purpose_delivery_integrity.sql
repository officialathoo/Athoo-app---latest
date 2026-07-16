-- Athoo RC2: purpose-scoped OTPs, attempt limits, and delivery audit metadata.
-- Additive and backward compatible; existing OTP rows remain invalid after their normal TTL.
ALTER TABLE otps ADD COLUMN IF NOT EXISTS purpose text NOT NULL DEFAULT 'login';
ALTER TABLE otps ADD COLUMN IF NOT EXISTS role text;
ALTER TABLE otps ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0;
ALTER TABLE otps ADD COLUMN IF NOT EXISTS max_attempts integer NOT NULL DEFAULT 5;
ALTER TABLE otps ADD COLUMN IF NOT EXISTS delivery_channel text;
ALTER TABLE otps ADD COLUMN IF NOT EXISTS delivered_at timestamp;
ALTER TABLE otps ADD COLUMN IF NOT EXISTS invalidated_reason text;

CREATE INDEX IF NOT EXISTS otps_phone_purpose_created_idx
  ON otps (phone, purpose, created_at DESC);
CREATE INDEX IF NOT EXISTS otps_phone_purpose_used_expires_idx
  ON otps (phone, purpose, used, expires_at);

-- Preserve only the newest open OTP per phone/purpose/role before enforcing uniqueness.
WITH ranked_open_otps AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY phone, purpose, COALESCE(role, '')
           ORDER BY created_at DESC, id DESC
         ) AS row_rank
  FROM otps
  WHERE used = false
)
UPDATE otps
SET used = true,
    invalidated_reason = COALESCE(invalidated_reason, 'migration_duplicate_cleanup')
WHERE id IN (SELECT id FROM ranked_open_otps WHERE row_rank > 1);

CREATE UNIQUE INDEX IF NOT EXISTS otps_one_open_purpose_role_uidx
  ON otps (phone, purpose, COALESCE(role, ''))
  WHERE used = false;

ALTER TABLE otps DROP CONSTRAINT IF EXISTS otps_purpose_check;
ALTER TABLE otps ADD CONSTRAINT otps_purpose_check
  CHECK (purpose IN ('login', 'registration', 'password_reset'));
ALTER TABLE otps DROP CONSTRAINT IF EXISTS otps_attempts_check;
ALTER TABLE otps ADD CONSTRAINT otps_attempts_check
  CHECK (attempts >= 0 AND max_attempts BETWEEN 1 AND 10 AND attempts <= max_attempts);
