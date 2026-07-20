BEGIN;

-- Stable, human-readable account identifiers for operational support. Internal
-- UUIDs remain authoritative; public IDs are safe to display in apps/admin.
ALTER TABLE users ADD COLUMN IF NOT EXISTS public_id text;

UPDATE users
SET public_id = (
  CASE role
    WHEN 'provider' THEN 'PRO'
    WHEN 'admin' THEN 'ADM'
    ELSE 'CUS'
  END
) || '-' || upper(substr(md5(COALESCE(role, 'customer') || ':' || id), 1, 16))
WHERE public_id IS NULL OR btrim(public_id) = '';

ALTER TABLE users ALTER COLUMN public_id SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS users_public_id_uidx ON users(public_id);
CREATE INDEX IF NOT EXISTS users_joined_at_idx ON users(joined_at DESC);

-- Canonical participant pair key guarantees one durable conversation per pair,
-- regardless of whether chat was opened from a profile, booking, or notification.
ALTER TABLE chats ADD COLUMN IF NOT EXISTS pair_key text;

UPDATE chats
SET pair_key = LEAST(participant1_id, participant2_id) || ':' || GREATEST(participant1_id, participant2_id)
WHERE pair_key IS NULL OR btrim(pair_key) = '';

-- Merge historical duplicate pair chats before enforcing uniqueness. The chat
-- with the newest activity is canonical. Idempotent message IDs are deduplicated
-- across the entire future canonical conversation before messages are moved.
CREATE TEMP TABLE phase28_chat_merge_map ON COMMIT DROP AS
WITH ranked AS (
  SELECT
    id,
    pair_key,
    first_value(id) OVER (
      PARTITION BY pair_key
      ORDER BY COALESCE(last_message_at, updated_at, created_at) DESC NULLS LAST, created_at ASC, id ASC
    ) AS canonical_id,
    row_number() OVER (
      PARTITION BY pair_key
      ORDER BY COALESCE(last_message_at, updated_at, created_at) DESC NULLS LAST, created_at ASC, id ASC
    ) AS rank_number
  FROM chats
)
SELECT id AS duplicate_id, canonical_id
FROM ranked
WHERE rank_number > 1;

-- Deduplicate idempotent messages across the entire future canonical chat,
-- including duplicates that currently live in two different duplicate chats.
-- This prevents the existing chat/sender/client-message unique index from
-- failing while all messages are moved in the next statement.
WITH remapped_messages AS (
  SELECT
    message.id,
    row_number() OVER (
      PARTITION BY
        COALESCE(mapping.canonical_id, message.chat_id),
        message.sender_id,
        message.client_message_id
      ORDER BY message.created_at ASC NULLS LAST, message.id ASC
    ) AS duplicate_rank
  FROM messages AS message
  LEFT JOIN phase28_chat_merge_map AS mapping
    ON mapping.duplicate_id = message.chat_id
  WHERE message.client_message_id IS NOT NULL
)
DELETE FROM messages AS duplicate_message
USING remapped_messages AS remapped
WHERE duplicate_message.id = remapped.id
  AND remapped.duplicate_rank > 1;

UPDATE messages AS message
SET chat_id = mapping.canonical_id
FROM phase28_chat_merge_map AS mapping
WHERE message.chat_id = mapping.duplicate_id;

DELETE FROM chats AS duplicate_chat
USING phase28_chat_merge_map AS mapping
WHERE duplicate_chat.id = mapping.duplicate_id;

ALTER TABLE chats ALTER COLUMN pair_key SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS chats_pair_key_uidx ON chats(pair_key);
CREATE INDEX IF NOT EXISTS chats_last_message_at_idx ON chats(last_message_at DESC);
CREATE INDEX IF NOT EXISTS users_inactivity_review_queue_idx ON users(inactivity_state, inactivity_review_at DESC);
CREATE INDEX IF NOT EXISTS users_provider_verification_queue_idx ON users(role, verification_status, joined_at DESC);
CREATE INDEX IF NOT EXISTS admin_notifications_target_created_idx ON admin_notifications(target_admin_id, created_at DESC);
CREATE INDEX IF NOT EXISTS support_tickets_status_priority_created_idx ON support_tickets(status, priority, created_at DESC);
CREATE INDEX IF NOT EXISTS refund_requests_status_created_idx ON refund_requests(status, created_at DESC);
CREATE INDEX IF NOT EXISTS withdrawal_requests_status_created_idx ON withdrawal_requests(status, created_at DESC);
CREATE INDEX IF NOT EXISTS commission_payments_status_created_idx ON commission_payments(status, created_at DESC);
CREATE INDEX IF NOT EXISTS user_subscriptions_status_created_idx ON user_subscriptions(status, created_at DESC);
CREATE INDEX IF NOT EXISTS hourly_rate_requests_status_created_idx ON hourly_rate_requests(status, created_at DESC);
CREATE INDEX IF NOT EXISTS report_issues_status_created_idx ON report_issues(status, created_at DESC);
CREATE INDEX IF NOT EXISTS service_add_requests_status_created_idx ON service_add_requests(status, created_at DESC);
CREATE INDEX IF NOT EXISTS account_deletion_requests_status_created_idx ON account_deletion_requests(status, created_at DESC);
CREATE INDEX IF NOT EXISTS negotiations_status_expires_idx ON negotiations(status, expires_at);

CREATE TABLE IF NOT EXISTS admin_work_item_views (
  id text PRIMARY KEY,
  admin_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  resource_type text NOT NULL,
  resource_id text NOT NULL,
  seen_at timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS admin_work_item_views_admin_resource_uidx
  ON admin_work_item_views(admin_id, resource_type, resource_id);
CREATE INDEX IF NOT EXISTS admin_work_item_views_admin_seen_idx
  ON admin_work_item_views(admin_id, seen_at DESC);

COMMIT;
