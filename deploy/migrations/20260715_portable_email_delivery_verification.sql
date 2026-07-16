BEGIN;

-- A verified email must identify exactly one account. If historical data contains
-- duplicate verified addresses, disable email login for all conflicting rows
-- rather than guessing which account owns the address.
WITH duplicate_verified_emails AS (
  SELECT lower(trim(email)) AS normalized_email
  FROM users
  WHERE email IS NOT NULL AND email_verified = true
  GROUP BY lower(trim(email))
  HAVING count(*) > 1
)
UPDATE users
SET email_verified = false, updated_at = now()
WHERE email_verified = true
  AND lower(trim(email)) IN (SELECT normalized_email FROM duplicate_verified_emails);

CREATE UNIQUE INDEX IF NOT EXISTS users_verified_email_lower_uidx
  ON users (lower(trim(email)))
  WHERE email IS NOT NULL AND email_verified = true;

CREATE TABLE IF NOT EXISTS email_verification_challenges (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email text NOT NULL,
  purpose text NOT NULL,
  role text,
  code_hash text NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 5,
  expires_at timestamp NOT NULL,
  used_at timestamp,
  invalidated_reason text,
  created_at timestamp DEFAULT now()
);
CREATE INDEX IF NOT EXISTS email_challenges_user_purpose_created_idx ON email_verification_challenges(user_id, purpose, created_at);
CREATE INDEX IF NOT EXISTS email_challenges_email_purpose_created_idx ON email_verification_challenges(email, purpose, created_at);
CREATE INDEX IF NOT EXISTS email_challenges_expires_at_idx ON email_verification_challenges(expires_at);
CREATE UNIQUE INDEX IF NOT EXISTS email_challenges_one_open_uidx
  ON email_verification_challenges(user_id, purpose)
  WHERE used_at IS NULL;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'email_challenges_purpose_check') THEN
    ALTER TABLE email_verification_challenges ADD CONSTRAINT email_challenges_purpose_check
      CHECK (purpose IN ('verify_email', 'login', 'email_change'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'email_challenges_role_check') THEN
    ALTER TABLE email_verification_challenges ADD CONSTRAINT email_challenges_role_check
      CHECK (role IS NULL OR role IN ('customer', 'provider'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'email_challenges_attempts_check') THEN
    ALTER TABLE email_verification_challenges ADD CONSTRAINT email_challenges_attempts_check
      CHECK (attempts >= 0 AND max_attempts BETWEEN 1 AND 10);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS email_preferences (
  user_id text PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  booking_updates boolean NOT NULL DEFAULT true,
  account_updates boolean NOT NULL DEFAULT true,
  product_updates boolean NOT NULL DEFAULT false,
  marketing_emails boolean NOT NULL DEFAULT false,
  marketing_consent_at timestamp,
  unsubscribed_at timestamp,
  updated_at timestamp DEFAULT now()
);
INSERT INTO email_preferences (user_id)
SELECT id FROM users
ON CONFLICT (user_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS email_campaigns (
  id text PRIMARY KEY,
  name text NOT NULL,
  subject text NOT NULL,
  body text NOT NULL,
  audience text NOT NULL DEFAULT 'all',
  category text NOT NULL DEFAULT 'marketing',
  status text NOT NULL DEFAULT 'draft',
  created_by text REFERENCES users(id) ON DELETE SET NULL,
  scheduled_at timestamp,
  started_at timestamp,
  completed_at timestamp,
  recipient_count integer NOT NULL DEFAULT 0,
  sent_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);
CREATE INDEX IF NOT EXISTS email_campaigns_status_scheduled_idx ON email_campaigns(status, scheduled_at);
CREATE INDEX IF NOT EXISTS email_campaigns_created_at_idx ON email_campaigns(created_at);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'email_campaigns_audience_check') THEN
    ALTER TABLE email_campaigns ADD CONSTRAINT email_campaigns_audience_check
      CHECK (audience IN ('all', 'customer', 'provider', 'premium'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'email_campaigns_category_check') THEN
    ALTER TABLE email_campaigns ADD CONSTRAINT email_campaigns_category_check
      CHECK (category IN ('marketing', 'product'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'email_campaigns_status_check') THEN
    ALTER TABLE email_campaigns ADD CONSTRAINT email_campaigns_status_check
      CHECK (status IN ('draft', 'queued', 'sending', 'completed', 'cancelled', 'failed'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS email_deliveries (
  id text PRIMARY KEY,
  user_id text REFERENCES users(id) ON DELETE SET NULL,
  campaign_id text REFERENCES email_campaigns(id) ON DELETE SET NULL,
  to_email text NOT NULL,
  template_key text NOT NULL,
  category text NOT NULL DEFAULT 'transactional',
  subject text,
  provider text,
  provider_message_id text,
  status text NOT NULL DEFAULT 'queued',
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 4,
  last_error text,
  dedupe_key text,
  variables jsonb DEFAULT '{}'::jsonb,
  metadata jsonb DEFAULT '{}'::jsonb,
  queued_at timestamp DEFAULT now(),
  sent_at timestamp,
  failed_at timestamp,
  updated_at timestamp DEFAULT now()
);
CREATE INDEX IF NOT EXISTS email_deliveries_status_queued_idx ON email_deliveries(status, queued_at);
CREATE INDEX IF NOT EXISTS email_deliveries_user_created_idx ON email_deliveries(user_id, queued_at);
CREATE INDEX IF NOT EXISTS email_deliveries_campaign_idx ON email_deliveries(campaign_id);
CREATE UNIQUE INDEX IF NOT EXISTS email_deliveries_dedupe_uidx
  ON email_deliveries(dedupe_key)
  WHERE dedupe_key IS NOT NULL;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'email_deliveries_category_check') THEN
    ALTER TABLE email_deliveries ADD CONSTRAINT email_deliveries_category_check
      CHECK (category IN ('security', 'transactional', 'booking', 'product', 'marketing'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'email_deliveries_status_check') THEN
    ALTER TABLE email_deliveries ADD CONSTRAINT email_deliveries_status_check
      CHECK (status IN ('queued', 'sending', 'sent', 'retrying', 'failed', 'suppressed'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'email_deliveries_attempts_check') THEN
    ALTER TABLE email_deliveries ADD CONSTRAINT email_deliveries_attempts_check
      CHECK (attempts >= 0 AND max_attempts BETWEEN 1 AND 10);
  END IF;
END $$;

COMMIT;
