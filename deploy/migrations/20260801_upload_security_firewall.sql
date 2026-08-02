BEGIN;

CREATE TABLE IF NOT EXISTS upload_security_records (
  object_path text PRIMARY KEY,
  quarantine_path text NOT NULL,
  scan_path text NOT NULL,
  owner_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scope text NOT NULL,
  original_name text NOT NULL,
  declared_content_type text NOT NULL,
  detected_content_type text,
  declared_size integer NOT NULL,
  actual_size integer,
  sha256 text,
  scan_status text NOT NULL DEFAULT 'pending',
  scanner text,
  rejection_reason text,
  scan_started_at timestamp,
  scanned_at timestamp,
  expires_at timestamp NOT NULL,
  quarantine_deleted_at timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT upload_security_scope_check CHECK (scope IN ('private', 'shared')),
  CONSTRAINT upload_security_status_check CHECK (scan_status IN ('pending', 'scanning', 'clean', 'rejected', 'error', 'expired')),
  CONSTRAINT upload_security_distinct_paths_check CHECK (object_path <> quarantine_path AND object_path <> scan_path AND quarantine_path <> scan_path),
  CONSTRAINT upload_security_path_boundaries_check CHECK (
    object_path LIKE ('/objects/uploads/' || scope || '/' || owner_id || '/%')
    AND quarantine_path LIKE ('/objects/uploads/quarantine/incoming/' || owner_id || '/%')
    AND scan_path LIKE ('/objects/uploads/quarantine/locked/' || owner_id || '/%')
  ),
  CONSTRAINT upload_security_declared_size_check CHECK (declared_size > 0 AND declared_size <= 209715200),
  CONSTRAINT upload_security_actual_size_check CHECK (actual_size IS NULL OR (actual_size > 0 AND actual_size <= 209715200)),
  CONSTRAINT upload_security_sha256_check CHECK (sha256 IS NULL OR sha256 ~ '^[a-f0-9]{64}$')
);

-- Keep this migration retry-safe for pre-release environments that may have
-- run an earlier draft of the Phase 18C migration.
ALTER TABLE upload_security_records ADD COLUMN IF NOT EXISTS quarantine_path text;
ALTER TABLE upload_security_records ADD COLUMN IF NOT EXISTS scan_path text;
ALTER TABLE upload_security_records ADD COLUMN IF NOT EXISTS quarantine_deleted_at timestamp;
UPDATE upload_security_records
SET quarantine_path = object_path
WHERE quarantine_path IS NULL;
UPDATE upload_security_records
SET scan_path = object_path
WHERE scan_path IS NULL;
ALTER TABLE upload_security_records ALTER COLUMN quarantine_path SET NOT NULL;
ALTER TABLE upload_security_records ALTER COLUMN scan_path SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'upload_security_distinct_paths_check') THEN
    ALTER TABLE upload_security_records ADD CONSTRAINT upload_security_distinct_paths_check
      CHECK (object_path <> quarantine_path AND object_path <> scan_path AND quarantine_path <> scan_path) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'upload_security_path_boundaries_check') THEN
    ALTER TABLE upload_security_records ADD CONSTRAINT upload_security_path_boundaries_check
      CHECK (
        object_path LIKE ('/objects/uploads/' || scope || '/' || owner_id || '/%')
        AND quarantine_path LIKE ('/objects/uploads/quarantine/incoming/' || owner_id || '/%')
        AND scan_path LIKE ('/objects/uploads/quarantine/locked/' || owner_id || '/%')
      ) NOT VALID;
  END IF;
END $$;

-- Fail deployment instead of preserving an unsafe draft record layout.
ALTER TABLE upload_security_records VALIDATE CONSTRAINT upload_security_distinct_paths_check;
ALTER TABLE upload_security_records VALIDATE CONSTRAINT upload_security_path_boundaries_check;

CREATE INDEX IF NOT EXISTS upload_security_owner_status_idx
  ON upload_security_records (owner_id, scan_status);
CREATE INDEX IF NOT EXISTS upload_security_status_expiry_idx
  ON upload_security_records (scan_status, expires_at);
CREATE INDEX IF NOT EXISTS upload_security_sha256_idx
  ON upload_security_records (sha256);
CREATE UNIQUE INDEX IF NOT EXISTS upload_security_quarantine_path_uidx
  ON upload_security_records (quarantine_path);
CREATE UNIQUE INDEX IF NOT EXISTS upload_security_scan_path_uidx
  ON upload_security_records (scan_path);

COMMIT;
