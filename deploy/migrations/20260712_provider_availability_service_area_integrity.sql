UPDATE users SET max_travel_distance_km = 15
WHERE role = 'provider' AND (max_travel_distance_km IS NULL OR max_travel_distance_km < 1 OR max_travel_distance_km > 100);
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_provider_radius_check;
ALTER TABLE users ADD CONSTRAINT users_provider_radius_check CHECK (max_travel_distance_km IS NULL OR max_travel_distance_km BETWEEN 1 AND 100);
CREATE INDEX IF NOT EXISTS users_provider_discovery_idx
ON users (is_available, verification_status, is_blocked, account_status)
WHERE role = 'provider' AND is_deactivated = false;
