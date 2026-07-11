-- Operational dashboard indexes for filtered counts and backlog detection.
CREATE INDEX IF NOT EXISTS users_provider_verification_active_idx
  ON users (verification_status, is_deactivated)
  WHERE role = 'provider';
CREATE INDEX IF NOT EXISTS users_provider_online_idx
  ON users (is_available, is_blocked, is_deactivated)
  WHERE role = 'provider';
CREATE INDEX IF NOT EXISTS bookings_status_updated_idx
  ON bookings (status, updated_at DESC);
CREATE INDEX IF NOT EXISTS negotiations_active_expiry_idx
  ON negotiations (status, expires_at)
  WHERE status IN ('customer_offer', 'provider_counter');
CREATE INDEX IF NOT EXISTS support_tickets_status_created_idx
  ON support_tickets (status, created_at DESC);
