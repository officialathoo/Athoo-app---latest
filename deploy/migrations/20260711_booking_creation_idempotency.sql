ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS client_request_id TEXT;

DELETE FROM bookings a
USING bookings b
WHERE a.ctid < b.ctid
  AND a.customer_id = b.customer_id
  AND a.client_request_id IS NOT NULL
  AND a.client_request_id = b.client_request_id;

CREATE UNIQUE INDEX IF NOT EXISTS bookings_customer_request_uidx
  ON bookings (customer_id, client_request_id)
  WHERE client_request_id IS NOT NULL;
