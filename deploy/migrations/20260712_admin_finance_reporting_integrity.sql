-- Manual-finance ledger, paid refunds, and reporting integrity.
ALTER TABLE refund_requests ADD COLUMN IF NOT EXISTS paid_at timestamp;
ALTER TABLE refund_requests ADD COLUMN IF NOT EXISTS payment_reference text;

ALTER TABLE refund_requests DROP CONSTRAINT IF EXISTS refund_requests_status_check;
ALTER TABLE refund_requests ADD CONSTRAINT refund_requests_status_check
  CHECK (status IN ('pending','approved','rejected','paid'));

CREATE UNIQUE INDEX IF NOT EXISTS refund_requests_payment_reference_uidx
  ON refund_requests (payment_reference) WHERE payment_reference IS NOT NULL;

CREATE TABLE IF NOT EXISTS finance_ledger (
  id text PRIMARY KEY,
  entry_type text NOT NULL,
  reference_type text NOT NULL,
  reference_id text NOT NULL,
  booking_id text REFERENCES bookings(id) ON DELETE SET NULL,
  provider_id text REFERENCES users(id) ON DELETE SET NULL,
  customer_id text REFERENCES users(id) ON DELETE SET NULL,
  amount integer NOT NULL CHECK (amount > 0),
  payment_reference text,
  note text,
  created_by text REFERENCES users(id) ON DELETE SET NULL,
  occurred_at timestamp NOT NULL DEFAULT now(),
  created_at timestamp DEFAULT now(),
  CONSTRAINT finance_ledger_entry_type_check CHECK (entry_type IN ('commission_received','provider_withdrawal','customer_refund'))
);
CREATE UNIQUE INDEX IF NOT EXISTS finance_ledger_reference_uidx ON finance_ledger(reference_type, reference_id);
CREATE INDEX IF NOT EXISTS finance_ledger_type_occurred_idx ON finance_ledger(entry_type, occurred_at DESC);
CREATE INDEX IF NOT EXISTS finance_ledger_provider_occurred_idx ON finance_ledger(provider_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS finance_ledger_customer_occurred_idx ON finance_ledger(customer_id, occurred_at DESC);

INSERT INTO finance_ledger (id, entry_type, reference_type, reference_id, provider_id, amount, payment_reference, created_by, occurred_at)
SELECT gen_random_uuid()::text, 'commission_received', 'commission_payment', cp.id, cp.provider_id, cp.amount, cp.reference, cp.reviewed_by,
       COALESCE(cp.reviewed_at, cp.updated_at, cp.created_at, now())
FROM commission_payments cp
WHERE cp.status = 'approved'
ON CONFLICT (reference_type, reference_id) DO NOTHING;

INSERT INTO finance_ledger (id, entry_type, reference_type, reference_id, provider_id, amount, payment_reference, created_by, occurred_at)
SELECT gen_random_uuid()::text, 'provider_withdrawal', 'withdrawal_request', wr.id, wr.provider_id, wr.amount, wr.payment_reference, wr.reviewed_by,
       COALESCE(wr.paid_at, wr.updated_at, wr.created_at, now())
FROM withdrawal_requests wr
WHERE wr.status = 'paid'
ON CONFLICT (reference_type, reference_id) DO NOTHING;

-- Only one unresolved refund request per booking.
DELETE FROM refund_requests a USING refund_requests b
WHERE a.booking_id = b.booking_id AND a.status = 'pending' AND b.status = 'pending'
  AND (a.created_at, a.id) > (b.created_at, b.id);
CREATE UNIQUE INDEX IF NOT EXISTS refund_requests_pending_booking_uidx
  ON refund_requests (booking_id) WHERE status = 'pending';
