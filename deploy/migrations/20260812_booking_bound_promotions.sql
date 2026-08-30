-- Booking-bound promotions.
-- Promo terms are snapshotted on each booking so later admin edits do not
-- retroactively alter an agreed customer discount.

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS promotion_id text;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS promo_code text;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS promo_discount_type text;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS promo_discount_value integer;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS promo_usage_reserved_at timestamp;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS promo_usage_released_at timestamp;

DO $$
BEGIN
  ALTER TABLE bookings
    ADD CONSTRAINT bookings_promotion_id_fk
    FOREIGN KEY (promotion_id) REFERENCES promotions(id) ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS bookings_promotion_id_idx ON bookings(promotion_id);

ALTER TABLE bookings
  DROP CONSTRAINT IF EXISTS bookings_promo_discount_type_chk;
ALTER TABLE bookings
  ADD CONSTRAINT bookings_promo_discount_type_chk
  CHECK (promo_discount_type IS NULL OR promo_discount_type IN ('fixed', 'percentage'));

ALTER TABLE bookings
  DROP CONSTRAINT IF EXISTS bookings_promo_discount_value_chk;
ALTER TABLE bookings
  ADD CONSTRAINT bookings_promo_discount_value_chk
  CHECK (promo_discount_value IS NULL OR promo_discount_value > 0);