BEGIN;

-- The application schema has always exposed refund_requests.booking_public_id,
-- but the historical production lineage did not create the physical column.
-- Drizzle full-table selects therefore failed before refund rows could load.
ALTER TABLE public.refund_requests
  ADD COLUMN IF NOT EXISTS booking_public_id text;

-- Preserve a stable public booking reference for existing refund records.
-- This update is retry-safe and does not expose internal booking identifiers.
UPDATE public.refund_requests AS refund
SET booking_public_id = booking.public_id
FROM public.bookings AS booking
WHERE refund.booking_id = booking.id
  AND refund.booking_public_id IS NULL
  AND booking.public_id IS NOT NULL;

COMMIT;