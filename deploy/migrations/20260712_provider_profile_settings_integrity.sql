-- Provider profile governance: one pending service/rate request and bounded rates.

-- Keep the newest pending rate request per provider; close older duplicates.
WITH ranked AS (
  SELECT id, row_number() OVER (PARTITION BY provider_id ORDER BY created_at DESC, id DESC) AS rn
  FROM hourly_rate_requests
  WHERE status = 'pending'
)
UPDATE hourly_rate_requests
SET status = 'rejected', review_note = 'Closed during provider profile integrity migration: superseded pending request', updated_at = now()
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- Keep the newest pending request per provider/category.
WITH ranked AS (
  SELECT id, row_number() OVER (PARTITION BY provider_id, service_category_id ORDER BY created_at DESC, id DESC) AS rn
  FROM service_add_requests
  WHERE status = 'pending' AND service_category_id IS NOT NULL
)
UPDATE service_add_requests
SET status = 'rejected', rejection_note = 'Closed during provider profile integrity migration: duplicate pending request', updated_at = now()
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

CREATE UNIQUE INDEX IF NOT EXISTS hourly_rate_requests_one_pending_provider_uidx
  ON hourly_rate_requests (provider_id) WHERE status = 'pending';
CREATE UNIQUE INDEX IF NOT EXISTS service_add_requests_one_pending_category_uidx
  ON service_add_requests (provider_id, service_category_id)
  WHERE status = 'pending' AND service_category_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS service_add_requests_provider_status_idx
  ON service_add_requests (provider_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS hourly_rate_requests_provider_status_idx
  ON hourly_rate_requests (provider_id, status, created_at DESC);

ALTER TABLE hourly_rate_requests DROP CONSTRAINT IF EXISTS hourly_rate_requests_requested_rate_check;
ALTER TABLE hourly_rate_requests ADD CONSTRAINT hourly_rate_requests_requested_rate_check
  CHECK (requested_rate BETWEEN 100 AND 50000);
ALTER TABLE hourly_rate_requests DROP CONSTRAINT IF EXISTS hourly_rate_requests_status_check;
ALTER TABLE hourly_rate_requests ADD CONSTRAINT hourly_rate_requests_status_check
  CHECK (status IN ('pending', 'approved', 'rejected'));
ALTER TABLE service_add_requests DROP CONSTRAINT IF EXISTS service_add_requests_status_check;
ALTER TABLE service_add_requests ADD CONSTRAINT service_add_requests_status_check
  CHECK (status IN ('pending', 'approved', 'rejected'));
