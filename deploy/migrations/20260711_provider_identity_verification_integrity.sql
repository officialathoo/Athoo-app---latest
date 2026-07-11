-- Provider identity and document integrity.
WITH duplicates AS (
  SELECT id, row_number() OVER (PARTITION BY cnic_number ORDER BY joined_at NULLS LAST, id) AS rn
  FROM users WHERE cnic_number IS NOT NULL AND trim(cnic_number) <> ''
)
UPDATE users SET cnic_number = NULL WHERE id IN (SELECT id FROM duplicates WHERE rn > 1);

CREATE UNIQUE INDEX IF NOT EXISTS users_cnic_number_uidx
  ON users (cnic_number) WHERE cnic_number IS NOT NULL;

WITH duplicates AS (
  SELECT id, row_number() OVER (PARTITION BY provider_id, type ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST, id) AS rn
  FROM provider_documents
)
DELETE FROM provider_documents WHERE id IN (SELECT id FROM duplicates WHERE rn > 1);

CREATE UNIQUE INDEX IF NOT EXISTS provider_documents_provider_type_uidx
  ON provider_documents (provider_id, type);

ALTER TABLE provider_documents DROP CONSTRAINT IF EXISTS provider_documents_type_check;
ALTER TABLE provider_documents ADD CONSTRAINT provider_documents_type_check
  CHECK (type IN ('cnic_front','cnic_back','selfie','police','diploma','video','license','other'));
