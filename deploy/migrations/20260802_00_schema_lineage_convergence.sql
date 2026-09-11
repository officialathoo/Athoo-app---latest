-- Athoo V2.2 historical schema-lineage convergence.
--
-- This migration intentionally sorts before the existing 20260802 application
-- migrations. Production already contains these historical structures through
-- three legacy migration IDs; fresh installations need the same structures
-- before later location columns are appended.
--
-- Additive, data-preserving, retry-safe, and safe on the existing production
-- schema. Do not rename this file without re-running the database rehearsal.

BEGIN;

-- Canonical audit index name. The older fresh path used an equivalent name.
DROP INDEX IF EXISTS public.audit_log_entity_created_idx;
CREATE INDEX IF NOT EXISTS audit_log_target_created_idx
  ON public.audit_log (target, target_id, created_at DESC);

-- Per-admin work-item read state used by the professional admin workflow.
CREATE TABLE IF NOT EXISTS public.admin_work_item_views (
  id text PRIMARY KEY,
  admin_id text NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  resource_type text NOT NULL,
  resource_id text NOT NULL,
  seen_at timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS admin_work_item_views_admin_resource_uidx
  ON public.admin_work_item_views (admin_id, resource_type, resource_id);
CREATE INDEX IF NOT EXISTS admin_work_item_views_admin_seen_idx
  ON public.admin_work_item_views (admin_id, seen_at DESC);
CREATE INDEX IF NOT EXISTS admin_notifications_target_created_idx
  ON public.admin_notifications (target_admin_id, created_at DESC);

-- One stable key per participant-pair and booking context. Existing production
-- values are preserved; the backfill only covers older/fresh schemas.
ALTER TABLE public.chats
  ADD COLUMN IF NOT EXISTS pair_key text;

WITH ranked_chat_pairs AS (
  SELECT
    id,
    LEAST(participant1_id, participant2_id)
      || ':' || GREATEST(participant1_id, participant2_id)
      || ':' || COALESCE(booking_id, 'direct') AS base_pair_key,
    row_number() OVER (
      PARTITION BY
        LEAST(participant1_id, participant2_id),
        GREATEST(participant1_id, participant2_id),
        COALESCE(booking_id, 'direct')
      ORDER BY created_at NULLS LAST, id
    ) AS duplicate_rank
  FROM public.chats
  WHERE pair_key IS NULL
)
UPDATE public.chats AS chats
SET pair_key = CASE
  WHEN ranked_chat_pairs.duplicate_rank = 1
    THEN ranked_chat_pairs.base_pair_key
  ELSE ranked_chat_pairs.base_pair_key || ':' || chats.id
END
FROM ranked_chat_pairs
WHERE chats.id = ranked_chat_pairs.id
  AND chats.pair_key IS NULL;

ALTER TABLE public.chats
  ALTER COLUMN pair_key SET NOT NULL;

CREATE INDEX IF NOT EXISTS chats_last_message_at_idx
  ON public.chats (last_message_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS chats_pair_key_uidx
  ON public.chats (pair_key);
CREATE INDEX IF NOT EXISTS chats_participant1_updated_idx
  ON public.chats (participant1_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS chats_participant2_updated_idx
  ON public.chats (participant2_id, updated_at DESC);

-- Invoice snapshot fields must be added before the later V2 location migration
-- so fresh-install physical column order converges with production.
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS booking_public_id text,
  ADD COLUMN IF NOT EXISTS rate_per_hour integer,
  ADD COLUMN IF NOT EXISTS duration_minutes integer,
  ADD COLUMN IF NOT EXISTS job_started_at timestamp,
  ADD COLUMN IF NOT EXISTS job_completed_at timestamp;

CREATE INDEX IF NOT EXISTS invoices_booking_public_id_idx
  ON public.invoices (booking_public_id);

ALTER TABLE public.payment_accounts
  ADD COLUMN IF NOT EXISTS qr_code_url text;

-- Provider-document expiry lifecycle.
ALTER TABLE public.provider_documents
  ADD COLUMN IF NOT EXISTS issued_at timestamp,
  ADD COLUMN IF NOT EXISTS expires_at timestamp,
  ADD COLUMN IF NOT EXISTS expiry_not_applicable boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS expiry_reminder_30_sent_at timestamp,
  ADD COLUMN IF NOT EXISTS expiry_reminder_7_sent_at timestamp,
  ADD COLUMN IF NOT EXISTS expiry_reminder_1_sent_at timestamp,
  ADD COLUMN IF NOT EXISTS expiry_notice_sent_at timestamp;

UPDATE public.provider_documents
SET expiry_not_applicable = false
WHERE expiry_not_applicable IS NULL;

ALTER TABLE public.provider_documents
  ALTER COLUMN expiry_not_applicable SET DEFAULT false,
  ALTER COLUMN expiry_not_applicable SET NOT NULL,
  DROP CONSTRAINT IF EXISTS provider_documents_expiry_date_order_check,
  DROP CONSTRAINT IF EXISTS provider_documents_lifetime_expiry_check,
  DROP CONSTRAINT IF EXISTS provider_documents_police_lifetime_check;

ALTER TABLE public.provider_documents
  ADD CONSTRAINT provider_documents_expiry_date_order_check
    CHECK (issued_at IS NULL OR expires_at IS NULL OR issued_at <= expires_at),
  ADD CONSTRAINT provider_documents_lifetime_expiry_check
    CHECK (expiry_not_applicable = false OR expires_at IS NULL),
  ADD CONSTRAINT provider_documents_police_lifetime_check
    CHECK (type <> 'police' OR expiry_not_applicable = false);

CREATE INDEX IF NOT EXISTS provider_documents_expiry_idx
  ON public.provider_documents (expires_at)
  WHERE status = 'approved' AND expiry_not_applicable = false;

CREATE TABLE IF NOT EXISTS public.provider_document_update_requests (
  id text PRIMARY KEY,
  provider_id text NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  document_type text NOT NULL,
  label text,
  url text NOT NULL,
  issued_at timestamp,
  expires_at timestamp,
  expiry_not_applicable boolean
    CONSTRAINT provider_document_update_request_expiry_not_applicable_not_null
    NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'pending',
  rejection_note text,
  reviewed_by text REFERENCES public.users(id) ON DELETE SET NULL,
  reviewed_at timestamp,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now(),
  CONSTRAINT provider_document_updates_date_order_check
    CHECK (issued_at IS NULL OR expires_at IS NULL OR issued_at <= expires_at),
  CONSTRAINT provider_document_updates_expiry_check
    CHECK (
      (
        document_type IN ('cnic_front', 'cnic_back')
        AND expiry_not_applicable = true
        AND expires_at IS NULL
      )
      OR (
        expiry_not_applicable = false
        AND expires_at IS NOT NULL
      )
    ),
  CONSTRAINT provider_document_updates_police_issue_check
    CHECK (document_type <> 'police' OR issued_at IS NOT NULL),
  CONSTRAINT provider_document_updates_review_check
    CHECK (
      status IN ('pending', 'cancelled')
      OR (reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)
    ),
  CONSTRAINT provider_document_updates_status_check
    CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  CONSTRAINT provider_document_updates_type_check
    CHECK (document_type IN ('cnic_front', 'cnic_back', 'police'))
);

CREATE UNIQUE INDEX IF NOT EXISTS provider_document_updates_one_pending_uidx
  ON public.provider_document_update_requests (provider_id, document_type)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS provider_document_updates_provider_idx
  ON public.provider_document_update_requests (provider_id, created_at DESC);
CREATE INDEX IF NOT EXISTS provider_document_updates_status_idx
  ON public.provider_document_update_requests (status, created_at DESC);

-- User public identity and document-compliance lifecycle.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS public_id text,
  ADD COLUMN IF NOT EXISTS location_accuracy real,
  ADD COLUMN IF NOT EXISTS location_updated_at timestamp,
  ADD COLUMN IF NOT EXISTS cnic_lifetime boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS document_compliance_status text DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS document_compliance_reason text,
  ADD COLUMN IF NOT EXISTS document_grace_ends_at timestamp,
  ADD COLUMN IF NOT EXISTS document_suspended_at timestamp,
  ADD COLUMN IF NOT EXISTS document_action_required_notified_at timestamp;

UPDATE public.users
SET public_id = 'USR-' || upper(replace(id, '-', ''))
WHERE public_id IS NULL;

WITH duplicate_public_ids AS (
  SELECT
    id,
    row_number() OVER (PARTITION BY public_id ORDER BY id) AS duplicate_rank
  FROM public.users
  WHERE public_id IS NOT NULL
)
UPDATE public.users AS users
SET public_id = users.public_id || '-' || upper(substr(md5(users.id), 1, 8))
FROM duplicate_public_ids
WHERE users.id = duplicate_public_ids.id
  AND duplicate_public_ids.duplicate_rank > 1;

ALTER TABLE public.users
  ALTER COLUMN public_id SET NOT NULL,
  DROP CONSTRAINT IF EXISTS users_document_compliance_status_check;

ALTER TABLE public.users
  ADD CONSTRAINT users_document_compliance_status_check
    CHECK (
      document_compliance_status IN (
        'active',
        'action_required',
        'warning',
        'grace',
        'renewal_pending',
        'suspended'
      )
    );

CREATE INDEX IF NOT EXISTS users_document_compliance_status_idx
  ON public.users (document_compliance_status);
CREATE INDEX IF NOT EXISTS users_document_grace_ends_at_idx
  ON public.users (document_grace_ends_at);
CREATE INDEX IF NOT EXISTS users_document_suspended_at_idx
  ON public.users (document_suspended_at)
  WHERE document_suspended_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS users_joined_at_idx
  ON public.users (joined_at DESC);
CREATE INDEX IF NOT EXISTS users_provider_geo_idx
  ON public.users (role, latitude, longitude)
  WHERE role = 'provider';
CREATE INDEX IF NOT EXISTS users_provider_location_freshness_idx
  ON public.users (location_updated_at)
  WHERE role = 'provider' AND is_available = true;
CREATE INDEX IF NOT EXISTS users_provider_verification_queue_idx
  ON public.users (role, verification_status, joined_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS users_public_id_uidx
  ON public.users (public_id);

-- Normalize the semantically identical subscription constraint so pg_dump
-- emits one canonical parse tree on both lineages.
ALTER TABLE public.subscription_plans
  DROP CONSTRAINT IF EXISTS subscription_plans_price_check;

ALTER TABLE public.subscription_plans
  ADD CONSTRAINT subscription_plans_price_check CHECK (
    (price_monthly >= 0)
    AND (price_monthly <= 10000000)
    AND ((price_yearly >= 0) AND (price_yearly <= 100000000))
    AND (
      (price_yearly = 0)
      OR (price_monthly = 0)
      OR (price_yearly >= price_monthly)
    )
  );

-- Historical production indexes absent from the fresh lineage.
CREATE INDEX IF NOT EXISTS bookings_payment_status_idx
  ON public.bookings (payment_status, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS bookings_public_id_uidx
  ON public.bookings (public_id)
  WHERE public_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS broadcast_requests_customer_created_idx
  ON public.broadcast_requests (customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS broadcast_requests_open_service_expiry_idx
  ON public.broadcast_requests (status, service, expires_at, created_at DESC);
CREATE INDEX IF NOT EXISTS broadcast_responses_provider_created_idx
  ON public.broadcast_responses (provider_id, created_at DESC);
CREATE INDEX IF NOT EXISTS broadcast_responses_request_provider_unique_idx
  ON public.broadcast_responses (request_id, provider_id);
CREATE INDEX IF NOT EXISTS hourly_rate_requests_status_created_idx
  ON public.hourly_rate_requests (status, created_at DESC);
CREATE INDEX IF NOT EXISTS negotiations_booking_id_idx
  ON public.negotiations (booking_id)
  WHERE booking_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS negotiations_customer_status_created_idx
  ON public.negotiations (customer_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS negotiations_expires_at_idx
  ON public.negotiations (expires_at)
  WHERE expires_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS negotiations_provider_status_created_idx
  ON public.negotiations (provider_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS negotiations_status_expires_idx
  ON public.negotiations (status, expires_at);
CREATE INDEX IF NOT EXISTS report_issues_status_created_idx
  ON public.report_issues (status, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS saved_providers_unique_idx
  ON public.saved_providers (user_id, provider_id);

COMMIT;
