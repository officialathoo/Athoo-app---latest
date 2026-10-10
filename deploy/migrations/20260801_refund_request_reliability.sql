BEGIN;

-- Preserve the earliest approved request (or earliest pending request when no
-- approval exists) and close any historical duplicate unresolved rows before
-- installing the stronger uniqueness rule.
WITH ranked_unresolved AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY booking_id
      ORDER BY CASE WHEN status = 'approved' THEN 0 ELSE 1 END, created_at ASC NULLS LAST, id ASC
    ) AS position
  FROM refund_requests
  WHERE status IN ('pending', 'approved')
)
UPDATE refund_requests AS refund
SET
  status = 'rejected',
  resolution_note = COALESCE(refund.resolution_note, 'Closed during unresolved-refund integrity migration'),
  resolved_at = COALESCE(refund.resolved_at, now()),
  updated_at = now()
FROM ranked_unresolved AS ranked
WHERE refund.id = ranked.id
  AND ranked.position > 1;

DROP INDEX IF EXISTS refund_requests_pending_booking_uidx;
DROP INDEX IF EXISTS refund_requests_one_pending_per_booking_idx;

CREATE UNIQUE INDEX IF NOT EXISTS refund_requests_unresolved_booking_uidx
  ON refund_requests (booking_id)
  WHERE status IN ('pending', 'approved');

CREATE INDEX IF NOT EXISTS refund_requests_booking_status_idx
  ON refund_requests (booking_id, status)
  INCLUDE (amount_requested);

CREATE INDEX IF NOT EXISTS bookings_customer_refund_eligibility_idx
  ON bookings (customer_id, created_at DESC)
  INCLUDE (service, price, visit_charge, scheduled_date, scheduled_time, public_id)
  WHERE status IN ('completed', 'cancelled')
    AND payment_status IN ('paid', 'received');

COMMIT;
