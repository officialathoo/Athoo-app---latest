ALTER TABLE commission_payments ADD COLUMN IF NOT EXISTS client_request_id text;
ALTER TABLE withdrawal_requests ADD COLUMN IF NOT EXISTS client_request_id text;


-- Resolve legacy collisions before enforcing uniqueness. Keep the newest pending withdrawal.
WITH ranked AS (
  SELECT id, row_number() OVER (PARTITION BY provider_id ORDER BY created_at DESC, id DESC) AS rn
  FROM withdrawal_requests WHERE status = 'pending'
)
UPDATE withdrawal_requests w
SET status = 'rejected', rejection_note = COALESCE(w.rejection_note, 'Closed during finance integrity migration'), updated_at = now()
FROM ranked r WHERE w.id = r.id AND r.rn > 1;

WITH ranked AS (
  SELECT id, row_number() OVER (PARTITION BY lower(reference) ORDER BY created_at, id) AS rn
  FROM commission_payments WHERE reference IS NOT NULL AND trim(reference) <> ''
)
UPDATE commission_payments p SET reference = NULL, updated_at = now()
FROM ranked r WHERE p.id = r.id AND r.rn > 1;

WITH ranked AS (
  SELECT id, row_number() OVER (PARTITION BY payment_reference ORDER BY paid_at, updated_at, id) AS rn
  FROM withdrawal_requests WHERE payment_reference IS NOT NULL
)
UPDATE withdrawal_requests w SET payment_reference = NULL, updated_at = now()
FROM ranked r WHERE w.id = r.id AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS commission_payments_provider_request_uidx
  ON commission_payments (provider_id, client_request_id)
  WHERE client_request_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS withdrawal_requests_provider_request_uidx
  ON withdrawal_requests (provider_id, client_request_id)
  WHERE client_request_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS withdrawal_requests_one_pending_uidx
  ON withdrawal_requests (provider_id)
  WHERE status = 'pending';
CREATE UNIQUE INDEX IF NOT EXISTS withdrawal_requests_payment_reference_uidx
  ON withdrawal_requests (payment_reference)
  WHERE payment_reference IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS commission_payments_reference_uidx
  ON commission_payments (lower(reference))
  WHERE reference IS NOT NULL AND trim(reference) <> '';

ALTER TABLE commission_payments DROP CONSTRAINT IF EXISTS commission_payments_amount_check;
ALTER TABLE commission_payments ADD CONSTRAINT commission_payments_amount_check CHECK (amount > 0);
ALTER TABLE commission_payments DROP CONSTRAINT IF EXISTS commission_payments_status_check;
ALTER TABLE commission_payments ADD CONSTRAINT commission_payments_status_check CHECK (status IN ('pending','approved','rejected'));
ALTER TABLE withdrawal_requests DROP CONSTRAINT IF EXISTS withdrawal_requests_amount_check;
ALTER TABLE withdrawal_requests ADD CONSTRAINT withdrawal_requests_amount_check CHECK (amount >= 500);
ALTER TABLE withdrawal_requests DROP CONSTRAINT IF EXISTS withdrawal_requests_status_check;
ALTER TABLE withdrawal_requests ADD CONSTRAINT withdrawal_requests_status_check CHECK (status IN ('pending','approved','rejected','paid'));
