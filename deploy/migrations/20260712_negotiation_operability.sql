CREATE INDEX IF NOT EXISTS negotiations_status_expiry_idx ON negotiations (status, expires_at) WHERE status IN ('customer_offer','provider_counter');
CREATE INDEX IF NOT EXISTS negotiations_provider_status_idx ON negotiations (provider_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS negotiations_customer_status_idx ON negotiations (customer_id, status, updated_at DESC);
