-- Athoo v13 production hardening migration (idempotent)
-- Adds public support IDs, chat/call/admin audit speed indexes, and safer lookup paths.

ALTER TABLE users ADD COLUMN IF NOT EXISTS public_id TEXT;
ALTER TABLE broadcast_requests ADD COLUMN IF NOT EXISTS public_id TEXT;
ALTER TABLE broadcast_responses ADD COLUMN IF NOT EXISTS public_id TEXT;
ALTER TABLE negotiations ADD COLUMN IF NOT EXISTS public_id TEXT;
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS public_id TEXT;
ALTER TABLE refund_requests ADD COLUMN IF NOT EXISTS public_id TEXT;
ALTER TABLE withdrawal_requests ADD COLUMN IF NOT EXISTS public_id TEXT;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS public_id TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS public_id TEXT;

UPDATE users SET public_id = 'USR-' || upper(substr(id, 1, 8)) WHERE public_id IS NULL;
UPDATE bookings SET public_id = 'ATH-BKG-' || upper(substr(id, 1, 8)) WHERE public_id IS NULL;
UPDATE invoices SET public_id = 'ATH-INV-' || upper(substr(id, 1, 8)) WHERE public_id IS NULL;
UPDATE negotiations SET public_id = 'ATH-OFR-' || upper(substr(id, 1, 8)) WHERE public_id IS NULL;
UPDATE broadcast_requests SET public_id = 'ATH-BRD-' || upper(substr(id, 1, 8)) WHERE public_id IS NULL;
UPDATE calls SET public_id = 'ATH-CAL-' || upper(substr(id, 1, 8)) WHERE public_id IS NULL;
UPDATE support_tickets SET public_id = 'ATH-CMP-' || upper(substr(id, 1, 8)) WHERE public_id IS NULL;

CREATE INDEX IF NOT EXISTS users_public_id_idx ON users(public_id);
CREATE INDEX IF NOT EXISTS users_role_available_verified_idx ON users(role, is_available, verification_status, is_blocked, is_deactivated);
CREATE INDEX IF NOT EXISTS users_lat_lng_idx ON users(latitude, longitude);
CREATE INDEX IF NOT EXISTS bookings_customer_status_created_idx ON bookings(customer_id, status, created_at);
CREATE INDEX IF NOT EXISTS bookings_provider_status_created_idx ON bookings(provider_id, status, created_at);
CREATE INDEX IF NOT EXISTS bookings_public_id_idx ON bookings(public_id);
CREATE INDEX IF NOT EXISTS broadcast_requests_public_id_idx ON broadcast_requests(public_id);
CREATE INDEX IF NOT EXISTS broadcast_requests_customer_status_created_idx ON broadcast_requests(customer_id, status, created_at);
CREATE INDEX IF NOT EXISTS broadcast_responses_request_provider_idx ON broadcast_responses(request_id, provider_id);
CREATE INDEX IF NOT EXISTS negotiations_public_id_idx ON negotiations(public_id);
CREATE INDEX IF NOT EXISTS negotiations_customer_provider_status_idx ON negotiations(customer_id, provider_id, status);
CREATE INDEX IF NOT EXISTS messages_chat_created_id_idx ON messages(chat_id, created_at, id);
CREATE INDEX IF NOT EXISTS chats_participant_last_idx ON chats(participant1_id, participant2_id, last_message_at);
CREATE INDEX IF NOT EXISTS calls_receiver_status_created_idx ON calls(receiver_id, status, created_at);
CREATE INDEX IF NOT EXISTS calls_caller_status_created_idx ON calls(caller_id, status, created_at);
CREATE INDEX IF NOT EXISTS notifications_user_read_created_idx ON notifications(user_id, is_read, created_at);
CREATE INDEX IF NOT EXISTS login_history_user_created_idx ON login_history(user_id, created_at);
CREATE INDEX IF NOT EXISTS provider_documents_provider_status_idx ON provider_documents(provider_id, status);
CREATE INDEX IF NOT EXISTS invoices_booking_id_idx ON invoices(booking_id);
CREATE INDEX IF NOT EXISTS invoices_customer_provider_idx ON invoices(customer_id, provider_id);
