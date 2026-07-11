-- Athoo production business-rule constraints
-- Run after taking a database backup. These indexes make the app rules enforceable
-- at database level, so race conditions cannot create duplicate active jobs.

-- One active booking/job per customer at a time.
CREATE UNIQUE INDEX IF NOT EXISTS ux_bookings_one_active_per_customer
ON bookings (customer_id)
WHERE status IN ('pending', 'accepted', 'in_progress');

-- One active booking/job per provider at a time.
CREATE UNIQUE INDEX IF NOT EXISTS ux_bookings_one_active_per_provider
ON bookings (provider_id)
WHERE status IN ('pending', 'accepted', 'in_progress');

-- One open broadcast per customer at a time.
CREATE UNIQUE INDEX IF NOT EXISTS ux_broadcast_requests_one_open_per_customer
ON broadcast_requests (customer_id)
WHERE status = 'open';

-- One active negotiation per customer at a time.
CREATE UNIQUE INDEX IF NOT EXISTS ux_negotiations_one_active_per_customer
ON negotiations (customer_id)
WHERE status IN ('customer_offer', 'provider_counter');

-- One active negotiation per provider at a time.
CREATE UNIQUE INDEX IF NOT EXISTS ux_negotiations_one_active_per_provider
ON negotiations (provider_id)
WHERE status IN ('customer_offer', 'provider_counter');

-- Faster provider matching and active work checks.
CREATE INDEX IF NOT EXISTS idx_users_provider_match_fast
ON users (role, verification_status, is_blocked, is_deactivated);

CREATE INDEX IF NOT EXISTS idx_bookings_active_customer_status
ON bookings (customer_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_bookings_active_provider_status
ON bookings (provider_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_broadcast_requests_customer_status_created
ON broadcast_requests (customer_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_negotiations_customer_status_created
ON negotiations (customer_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_negotiations_provider_status_created
ON negotiations (provider_id, status, created_at DESC);
