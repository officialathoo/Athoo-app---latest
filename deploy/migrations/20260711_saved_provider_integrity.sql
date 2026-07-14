-- Saved-provider integrity and retention query performance.
-- Deduplicate legacy rows before enforcing the unique relationship.
DELETE FROM saved_providers a
USING saved_providers b
WHERE a.user_id = b.user_id
  AND a.provider_id = b.provider_id
  AND a.created_at < b.created_at;

CREATE UNIQUE INDEX IF NOT EXISTS saved_providers_user_provider_uq
  ON saved_providers(user_id, provider_id);

CREATE INDEX IF NOT EXISTS saved_providers_user_created_idx
  ON saved_providers(user_id, created_at DESC);
