ALTER TABLE broadcast_requests ADD COLUMN IF NOT EXISTS client_request_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS broadcast_requests_customer_request_uidx
  ON broadcast_requests (customer_id, client_request_id)
  WHERE client_request_id IS NOT NULL;
