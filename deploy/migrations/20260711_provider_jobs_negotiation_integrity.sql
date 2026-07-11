ALTER TABLE negotiations ADD COLUMN IF NOT EXISTS booking_id text;

-- One negotiation record may be linked to a booking.
WITH ranked AS (
  SELECT id, row_number() OVER (PARTITION BY booking_id ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST, id DESC) AS rn
  FROM negotiations WHERE booking_id IS NOT NULL
)
UPDATE negotiations SET booking_id = NULL WHERE id IN (SELECT id FROM ranked WHERE rn > 1);
CREATE UNIQUE INDEX IF NOT EXISTS negotiations_booking_id_uidx ON negotiations (booking_id) WHERE booking_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS negotiations_active_expiry_idx ON negotiations (expires_at, updated_at) WHERE status IN ('customer_offer', 'provider_counter');
