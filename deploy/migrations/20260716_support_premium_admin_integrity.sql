-- Phase 6: admin operations, support evidence, and premium review integrity.
ALTER TABLE support_tickets
  ADD COLUMN IF NOT EXISTS media_urls JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS support_tickets_status_priority_created_idx
  ON support_tickets (status, priority, created_at DESC);

CREATE INDEX IF NOT EXISTS support_tickets_assigned_to_status_idx
  ON support_tickets (assigned_to, status)
  WHERE assigned_to IS NOT NULL;

CREATE INDEX IF NOT EXISTS user_subscriptions_status_created_idx
  ON user_subscriptions (status, created_at DESC);

CREATE INDEX IF NOT EXISTS service_add_requests_status_created_idx
  ON service_add_requests (status, created_at DESC);

CREATE INDEX IF NOT EXISTS account_deletion_requests_status_created_idx
  ON account_deletion_requests (status, created_at DESC);
