BEGIN;

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS scheduled_day_reminder_sent_at timestamp;

CREATE INDEX IF NOT EXISTS bookings_scheduled_reminder_due_idx
  ON bookings (status, scheduled_date, scheduled_time)
  WHERE status = 'accepted';

ALTER TABLE negotiations
  ADD COLUMN IF NOT EXISTS customer_travelling_charge integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS provider_travelling_charge integer,
  ADD COLUMN IF NOT EXISTS final_travelling_charge integer NOT NULL DEFAULT 0;

ALTER TABLE negotiations
  DROP CONSTRAINT IF EXISTS negotiations_customer_travelling_charge_check,
  DROP CONSTRAINT IF EXISTS negotiations_provider_travelling_charge_check,
  DROP CONSTRAINT IF EXISTS negotiations_final_travelling_charge_check;

ALTER TABLE negotiations
  ADD CONSTRAINT negotiations_customer_travelling_charge_check CHECK (customer_travelling_charge BETWEEN 0 AND 1000000),
  ADD CONSTRAINT negotiations_provider_travelling_charge_check CHECK (provider_travelling_charge IS NULL OR provider_travelling_charge BETWEEN 0 AND 1000000),
  ADD CONSTRAINT negotiations_final_travelling_charge_check CHECK (final_travelling_charge BETWEEN 0 AND 1000000);

COMMIT;
