-- Canonical review records, one review per completed booking.
INSERT INTO reviews (id, booking_id, reviewer_id, reviewer_name, reviewed_id, reviewed_name, rating, review, created_at, updated_at)
SELECT gen_random_uuid()::text, b.id, b.customer_id, b.customer_name, b.provider_id, b.provider_name,
       b.rating, NULLIF(trim(b.review), ''), COALESCE(b.job_completed_at, b.updated_at, now()), COALESCE(b.updated_at, now())
FROM bookings b
WHERE b.status = 'completed' AND b.rating IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM reviews r WHERE r.booking_id = b.id);

DELETE FROM reviews a USING reviews b
WHERE a.booking_id = b.booking_id AND a.created_at > b.created_at;

CREATE UNIQUE INDEX IF NOT EXISTS reviews_booking_id_uidx ON reviews (booking_id);
ALTER TABLE reviews DROP CONSTRAINT IF EXISTS reviews_rating_check;
ALTER TABLE reviews ADD CONSTRAINT reviews_rating_check CHECK (rating BETWEEN 1 AND 5);
CREATE INDEX IF NOT EXISTS reviews_reviewed_visible_idx ON reviews (reviewed_id, created_at DESC) WHERE is_disputed = false;
