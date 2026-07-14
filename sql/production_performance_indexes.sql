-- ATHOO production performance indexes
-- Safe to run multiple times. Designed for high-traffic booking/broadcast/admin screens.

CREATE INDEX IF NOT EXISTS users_provider_discovery_idx
  ON users (role, verification_status, is_blocked, is_deactivated, account_status);

CREATE INDEX IF NOT EXISTS users_provider_geo_idx
  ON users (role, latitude, longitude)
  WHERE role = 'provider';

CREATE INDEX IF NOT EXISTS bookings_customer_status_created_idx
  ON bookings (customer_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS bookings_provider_status_created_idx
  ON bookings (provider_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS bookings_payment_status_idx
  ON bookings (payment_status, created_at DESC);

CREATE INDEX IF NOT EXISTS negotiations_customer_status_created_idx
  ON negotiations (customer_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS negotiations_provider_status_created_idx
  ON negotiations (provider_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS chats_participant1_updated_idx
  ON chats (participant1_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS chats_participant2_updated_idx
  ON chats (participant2_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS messages_chat_created_idx
  ON messages (chat_id, created_at DESC);

CREATE INDEX IF NOT EXISTS notifications_user_read_created_idx
  ON notifications (user_id, is_read, created_at DESC);

CREATE INDEX IF NOT EXISTS broadcast_requests_open_service_expiry_idx
  ON broadcast_requests (status, service, expires_at, created_at DESC);

CREATE INDEX IF NOT EXISTS broadcast_requests_customer_created_idx
  ON broadcast_requests (customer_id, created_at DESC);

CREATE INDEX IF NOT EXISTS broadcast_responses_request_provider_unique_idx
  ON broadcast_responses (request_id, provider_id);

CREATE INDEX IF NOT EXISTS broadcast_responses_provider_created_idx
  ON broadcast_responses (provider_id, created_at DESC);

CREATE INDEX IF NOT EXISTS provider_documents_user_status_idx
  ON provider_documents (user_id, status, uploaded_at DESC);

CREATE INDEX IF NOT EXISTS audit_log_admin_created_idx
  ON audit_log (admin_id, created_at DESC);

CREATE INDEX IF NOT EXISTS support_tickets_user_status_created_idx
  ON support_tickets (user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS invoices_customer_created_idx
  ON invoices (customer_id, created_at DESC);

CREATE INDEX IF NOT EXISTS invoices_provider_created_idx
  ON invoices (provider_id, created_at DESC);
