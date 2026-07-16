-- Phase 4: negotiation request idempotency and chat query support.
WITH ranked AS (
  SELECT id, row_number() OVER (PARTITION BY customer_id, client_request_id ORDER BY created_at, id) AS rn
  FROM negotiations
  WHERE client_request_id IS NOT NULL
)
UPDATE negotiations n SET client_request_id = NULL
FROM ranked r WHERE n.id = r.id AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS negotiations_customer_request_uidx
  ON negotiations (customer_id, client_request_id)
  WHERE client_request_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS messages_chat_unread_idx
  ON messages (chat_id, sender_id, created_at)
  WHERE is_read = false;
