-- Release Engineering Phase 4.2: API and database integrity.

-- Refund submission idempotency.
ALTER TABLE refund_requests ADD COLUMN IF NOT EXISTS client_request_id text;
WITH duplicate_requests AS (
  SELECT id, row_number() OVER (
    PARTITION BY customer_id, client_request_id
    ORDER BY created_at ASC, id ASC
  ) AS rn
  FROM refund_requests
  WHERE client_request_id IS NOT NULL
)
UPDATE refund_requests r SET client_request_id = NULL
FROM duplicate_requests d WHERE r.id = d.id AND d.rn > 1;
CREATE UNIQUE INDEX IF NOT EXISTS refund_requests_customer_request_uidx
  ON refund_requests (customer_id, client_request_id)
  WHERE client_request_id IS NOT NULL;

-- Finance ledger must accept subscription receipts written by the certified
-- subscription approval workflow.
ALTER TABLE finance_ledger DROP CONSTRAINT IF EXISTS finance_ledger_entry_type_check;
ALTER TABLE finance_ledger ADD CONSTRAINT finance_ledger_entry_type_check
  CHECK (entry_type IN ('commission_received','provider_withdrawal','customer_refund','subscription_received'));

INSERT INTO finance_ledger (
  id, entry_type, reference_type, reference_id, provider_id, customer_id,
  amount, payment_reference, note, created_by, occurred_at
)
SELECT
  gen_random_uuid()::text,
  'subscription_received',
  'user_subscription',
  us.id,
  CASE WHEN u.role = 'provider' THEN us.user_id ELSE NULL END,
  CASE WHEN u.role = 'customer' THEN us.user_id ELSE NULL END,
  us.amount,
  us.payment_reference,
  sp.name || ' (' || us.billing_period || ')',
  us.reviewed_by,
  COALESCE(us.reviewed_at, us.started_at, us.updated_at, us.created_at, now())
FROM user_subscriptions us
JOIN users u ON u.id = us.user_id
JOIN subscription_plans sp ON sp.id = us.plan_id
WHERE us.status = 'active' AND us.amount > 0
ON CONFLICT (reference_type, reference_id) DO NOTHING;

-- Remove legacy orphan rows before enforcing core realtime relationships.
DELETE FROM messages m WHERE NOT EXISTS (SELECT 1 FROM chats c WHERE c.id = m.chat_id);
DELETE FROM messages m WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = m.sender_id);
DELETE FROM chats c
WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = c.participant1_id)
   OR NOT EXISTS (SELECT 1 FROM users u WHERE u.id = c.participant2_id);
UPDATE chats c SET booking_id = NULL
WHERE booking_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM bookings b WHERE b.id = c.booking_id);
DELETE FROM calls c
WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = c.caller_id)
   OR NOT EXISTS (SELECT 1 FROM users u WHERE u.id = c.receiver_id);
DELETE FROM negotiations n
WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = n.customer_id)
   OR NOT EXISTS (SELECT 1 FROM users u WHERE u.id = n.provider_id);
UPDATE negotiations n SET booking_id = NULL
WHERE booking_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM bookings b WHERE b.id = n.booking_id);

DO $$ BEGIN
  ALTER TABLE negotiations ADD CONSTRAINT negotiations_customer_id_fkey
    FOREIGN KEY (customer_id) REFERENCES users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE negotiations ADD CONSTRAINT negotiations_provider_id_fkey
    FOREIGN KEY (provider_id) REFERENCES users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE negotiations ADD CONSTRAINT negotiations_booking_id_fkey
    FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE chats ADD CONSTRAINT chats_participant1_id_fkey
    FOREIGN KEY (participant1_id) REFERENCES users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE chats ADD CONSTRAINT chats_participant2_id_fkey
    FOREIGN KEY (participant2_id) REFERENCES users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE chats ADD CONSTRAINT chats_booking_id_fkey
    FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE messages ADD CONSTRAINT messages_chat_id_fkey
    FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE messages ADD CONSTRAINT messages_sender_id_fkey
    FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE calls ADD CONSTRAINT calls_caller_id_fkey
    FOREIGN KEY (caller_id) REFERENCES users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE calls ADD CONSTRAINT calls_receiver_id_fkey
    FOREIGN KEY (receiver_id) REFERENCES users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE negotiations DROP CONSTRAINT IF EXISTS negotiations_status_check;
ALTER TABLE negotiations ADD CONSTRAINT negotiations_status_check
  CHECK (status IN ('customer_offer','provider_counter','accepted','rejected'));
ALTER TABLE negotiations DROP CONSTRAINT IF EXISTS negotiations_amount_check;
ALTER TABLE negotiations ADD CONSTRAINT negotiations_amount_check
  CHECK (customer_offer > 0 AND (provider_counter IS NULL OR provider_counter > 0) AND (final_price IS NULL OR final_price > 0));
ALTER TABLE chats DROP CONSTRAINT IF EXISTS chats_distinct_participants_check;
ALTER TABLE chats ADD CONSTRAINT chats_distinct_participants_check CHECK (participant1_id <> participant2_id);
ALTER TABLE calls DROP CONSTRAINT IF EXISTS calls_distinct_participants_check;
ALTER TABLE calls ADD CONSTRAINT calls_distinct_participants_check CHECK (caller_id <> receiver_id);

-- Runtime queue recovery and retention support.
CREATE INDEX IF NOT EXISTS background_jobs_processing_lock_idx
  ON background_jobs (locked_at) WHERE status = 'processing';
CREATE INDEX IF NOT EXISTS background_jobs_completed_retention_idx
  ON background_jobs (completed_at) WHERE status = 'completed';
