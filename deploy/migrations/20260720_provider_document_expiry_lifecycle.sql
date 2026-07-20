-- Provider identity-document expiry and renewal lifecycle.
-- Police certificate validity is not globally fixed across Pakistan; Athoo
-- stores the explicit validity date supplied on the certificate/application
-- and keeps reminder/grace periods configurable at runtime.

ALTER TABLE users ADD COLUMN IF NOT EXISTS cnic_lifetime boolean DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS document_compliance_status text DEFAULT 'active';
ALTER TABLE users ADD COLUMN IF NOT EXISTS document_compliance_reason text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS document_grace_ends_at timestamp;
ALTER TABLE users ADD COLUMN IF NOT EXISTS document_suspended_at timestamp;
ALTER TABLE users ADD COLUMN IF NOT EXISTS document_action_required_notified_at timestamp;

UPDATE users
SET document_compliance_status = COALESCE(NULLIF(document_compliance_status, ''), 'active'),
    cnic_lifetime = COALESCE(cnic_lifetime, false)
WHERE document_compliance_status IS NULL
   OR document_compliance_status = ''
   OR cnic_lifetime IS NULL;

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_document_compliance_status_check;
ALTER TABLE users ADD CONSTRAINT users_document_compliance_status_check
  CHECK (document_compliance_status IN ('active','action_required','warning','grace','renewal_pending','suspended'));

CREATE INDEX IF NOT EXISTS users_document_compliance_status_idx
  ON users(document_compliance_status);
CREATE INDEX IF NOT EXISTS users_document_grace_ends_at_idx
  ON users(document_grace_ends_at);
CREATE INDEX IF NOT EXISTS users_document_suspended_at_idx
  ON users(document_suspended_at)
  WHERE document_suspended_at IS NOT NULL;

ALTER TABLE provider_documents ADD COLUMN IF NOT EXISTS issued_at timestamp;
ALTER TABLE provider_documents ADD COLUMN IF NOT EXISTS expires_at timestamp;
ALTER TABLE provider_documents ADD COLUMN IF NOT EXISTS expiry_not_applicable boolean DEFAULT false;
ALTER TABLE provider_documents ADD COLUMN IF NOT EXISTS expiry_reminder_30_sent_at timestamp;
ALTER TABLE provider_documents ADD COLUMN IF NOT EXISTS expiry_reminder_7_sent_at timestamp;
ALTER TABLE provider_documents ADD COLUMN IF NOT EXISTS expiry_reminder_1_sent_at timestamp;
ALTER TABLE provider_documents ADD COLUMN IF NOT EXISTS expiry_notice_sent_at timestamp;

UPDATE provider_documents
SET expiry_not_applicable = COALESCE(expiry_not_applicable, false)
WHERE expiry_not_applicable IS NULL;

ALTER TABLE provider_documents ALTER COLUMN expiry_not_applicable SET DEFAULT false;
ALTER TABLE provider_documents ALTER COLUMN expiry_not_applicable SET NOT NULL;

-- Reuse trusted CNIC metadata already stored on provider accounts. Existing
-- police documents are deliberately not assigned an invented validity period.
UPDATE provider_documents pd
SET expiry_not_applicable = true,
    expires_at = NULL,
    updated_at = NOW()
FROM users u
WHERE pd.provider_id = u.id
  AND pd.type IN ('cnic_front','cnic_back')
  AND COALESCE(u.cnic_lifetime, false) = true
  AND pd.expires_at IS NULL;

UPDATE provider_documents pd
SET expires_at = (u.cnic_expiry || ' 12:00:00')::timestamp,
    updated_at = NOW()
FROM users u
WHERE pd.provider_id = u.id
  AND pd.type IN ('cnic_front','cnic_back')
  AND pd.expires_at IS NULL
  AND COALESCE(pd.expiry_not_applicable, false) = false
  AND u.cnic_expiry ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
  AND to_char(to_date(u.cnic_expiry, 'YYYY-MM-DD'), 'YYYY-MM-DD') = u.cnic_expiry;

ALTER TABLE provider_documents DROP CONSTRAINT IF EXISTS provider_documents_expiry_date_order_check;
ALTER TABLE provider_documents ADD CONSTRAINT provider_documents_expiry_date_order_check
  CHECK (issued_at IS NULL OR expires_at IS NULL OR issued_at <= expires_at);
ALTER TABLE provider_documents DROP CONSTRAINT IF EXISTS provider_documents_police_lifetime_check;
ALTER TABLE provider_documents ADD CONSTRAINT provider_documents_police_lifetime_check
  CHECK (type <> 'police' OR expiry_not_applicable = false);
ALTER TABLE provider_documents DROP CONSTRAINT IF EXISTS provider_documents_lifetime_expiry_check;
ALTER TABLE provider_documents ADD CONSTRAINT provider_documents_lifetime_expiry_check
  CHECK (expiry_not_applicable = false OR expires_at IS NULL);

CREATE INDEX IF NOT EXISTS provider_documents_expiry_idx
  ON provider_documents(expires_at)
  WHERE status = 'approved' AND expiry_not_applicable = false;

CREATE TABLE IF NOT EXISTS provider_document_update_requests (
  id text PRIMARY KEY,
  provider_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  document_type text NOT NULL,
  label text,
  url text NOT NULL,
  issued_at timestamp,
  expires_at timestamp,
  expiry_not_applicable boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'pending',
  rejection_note text,
  reviewed_by text REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at timestamp,
  created_at timestamp DEFAULT NOW(),
  updated_at timestamp DEFAULT NOW(),
  CONSTRAINT provider_document_updates_type_check
    CHECK (document_type IN ('cnic_front','cnic_back','police')),
  CONSTRAINT provider_document_updates_status_check
    CHECK (status IN ('pending','approved','rejected','cancelled')),
  CONSTRAINT provider_document_updates_expiry_check
    CHECK (
      (document_type IN ('cnic_front','cnic_back') AND expiry_not_applicable = true AND expires_at IS NULL)
      OR
      (expiry_not_applicable = false AND expires_at IS NOT NULL)
    ),
  CONSTRAINT provider_document_updates_date_order_check
    CHECK (issued_at IS NULL OR expires_at IS NULL OR issued_at <= expires_at),
  CONSTRAINT provider_document_updates_police_issue_check
    CHECK (document_type <> 'police' OR issued_at IS NOT NULL),
  CONSTRAINT provider_document_updates_review_check
    CHECK (
      status IN ('pending','cancelled')
      OR (reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS provider_document_updates_provider_idx
  ON provider_document_update_requests(provider_id, created_at DESC);
CREATE INDEX IF NOT EXISTS provider_document_updates_status_idx
  ON provider_document_update_requests(status, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS provider_document_updates_one_pending_uidx
  ON provider_document_update_requests(provider_id, document_type)
  WHERE status = 'pending';
