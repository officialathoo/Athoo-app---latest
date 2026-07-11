BEGIN;

ALTER TABLE commission_payments
  DROP CONSTRAINT IF EXISTS commission_payments_amount_positive,
  ADD CONSTRAINT commission_payments_amount_positive CHECK (amount > 0),
  DROP CONSTRAINT IF EXISTS commission_payments_status_valid,
  ADD CONSTRAINT commission_payments_status_valid CHECK (status IN ('pending','approved','rejected'));

ALTER TABLE refund_requests
  DROP CONSTRAINT IF EXISTS refund_requests_amount_positive,
  ADD CONSTRAINT refund_requests_amount_positive CHECK (amount_requested > 0),
  DROP CONSTRAINT IF EXISTS refund_requests_status_valid,
  ADD CONSTRAINT refund_requests_status_valid CHECK (status IN ('pending','approved','rejected'));

ALTER TABLE withdrawal_requests
  DROP CONSTRAINT IF EXISTS withdrawal_requests_amount_positive,
  ADD CONSTRAINT withdrawal_requests_amount_positive CHECK (amount > 0),
  DROP CONSTRAINT IF EXISTS withdrawal_requests_status_valid,
  ADD CONSTRAINT withdrawal_requests_status_valid CHECK (status IN ('pending','approved','rejected','paid')),
  DROP CONSTRAINT IF EXISTS withdrawal_requests_paid_reference_required,
  ADD CONSTRAINT withdrawal_requests_paid_reference_required CHECK (status <> 'paid' OR (payment_reference IS NOT NULL AND length(trim(payment_reference)) > 0));

CREATE UNIQUE INDEX IF NOT EXISTS refund_requests_one_pending_per_booking_idx
  ON refund_requests (booking_id) WHERE status = 'pending';

CREATE UNIQUE INDEX IF NOT EXISTS withdrawal_requests_one_pending_per_provider_idx
  ON withdrawal_requests (provider_id) WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS withdrawal_requests_status_created_idx
  ON withdrawal_requests (status, created_at DESC);
CREATE INDEX IF NOT EXISTS refund_requests_status_created_idx
  ON refund_requests (status, created_at DESC);
CREATE INDEX IF NOT EXISTS commission_payments_status_created_idx
  ON commission_payments (status, created_at DESC);

COMMIT;
