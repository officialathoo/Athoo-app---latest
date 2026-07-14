-- Release Engineering Phase 4.5 — performance and scalability indexes/sequences.
CREATE SEQUENCE IF NOT EXISTS athoo_invoice_number_seq START WITH 1;
SELECT setval(
  'athoo_invoice_number_seq',
  GREATEST(
    1,
    COALESCE((SELECT max(nullif(regexp_replace(invoice_number, '\\D', '', 'g'), '')::bigint) FROM invoices), 0)
  ),
  true
);

CREATE INDEX IF NOT EXISTS bookings_customer_created_idx ON bookings (customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS bookings_provider_created_idx ON bookings (provider_id, created_at DESC);
CREATE INDEX IF NOT EXISTS bookings_customer_status_price_idx ON bookings (customer_id, status) INCLUDE (price);
CREATE INDEX IF NOT EXISTS bookings_provider_status_amount_idx ON bookings (provider_id, status) INCLUDE (price, provider_amount);
CREATE INDEX IF NOT EXISTS notifications_user_created_idx ON notifications (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_user_unread_created_idx ON notifications (user_id, created_at DESC) WHERE is_read = false;
CREATE INDEX IF NOT EXISTS chats_participant1_last_message_idx ON chats (participant1_id, last_message_at DESC) WHERE participant1_hidden_at IS NULL;
CREATE INDEX IF NOT EXISTS chats_participant2_last_message_idx ON chats (participant2_id, last_message_at DESC) WHERE participant2_hidden_at IS NULL;
CREATE INDEX IF NOT EXISTS messages_chat_created_idx ON messages (chat_id, created_at);
