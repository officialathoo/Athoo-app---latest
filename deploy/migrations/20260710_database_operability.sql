-- Database operational indexes used by authentication, unread notifications,
-- support queues, and financial/admin review screens.
CREATE INDEX IF NOT EXISTS auth_sessions_active_user_expiry_idx
  ON auth_sessions (user_id, expires_at DESC)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS notifications_user_unread_created_idx
  ON notifications (user_id, created_at DESC)
  WHERE is_read = false;

CREATE INDEX IF NOT EXISTS support_tickets_status_created_idx
  ON support_tickets (status, created_at DESC);

CREATE INDEX IF NOT EXISTS audit_log_target_created_idx
  ON audit_log (target, target_id, created_at DESC);

CREATE INDEX IF NOT EXISTS bookings_active_provider_updated_idx
  ON bookings (provider_id, updated_at DESC)
  WHERE status IN ('accepted', 'in_progress');

CREATE INDEX IF NOT EXISTS bookings_active_customer_updated_idx
  ON bookings (customer_id, updated_at DESC)
  WHERE status IN ('pending', 'accepted', 'in_progress');
