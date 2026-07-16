BEGIN;

ALTER TABLE auth_sessions
  ADD COLUMN IF NOT EXISTS device_id text;

CREATE INDEX IF NOT EXISTS auth_sessions_user_device_idx
  ON auth_sessions (user_id, device_id);

ALTER TABLE login_history
  ADD COLUMN IF NOT EXISTS device_id text;

CREATE INDEX IF NOT EXISTS login_history_user_device_idx
  ON login_history (user_id, device_id);

-- Keep only the newest active session for every account before enabling the
-- single-device policy in application code. Historical revoked rows remain for
-- security investigation and login-history correlation.
WITH ranked_active_sessions AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY user_id
      ORDER BY created_at DESC NULLS LAST, last_used_at DESC NULLS LAST, id DESC
    ) AS active_rank
  FROM auth_sessions
  WHERE revoked_at IS NULL
    AND expires_at > now()
)
UPDATE auth_sessions AS sessions
SET
  revoked_at = now(),
  revoke_reason = 'single_device_migration'
FROM ranked_active_sessions AS ranked
WHERE sessions.id = ranked.id
  AND ranked.active_rank > 1;

CREATE UNIQUE INDEX IF NOT EXISTS auth_sessions_one_active_per_user_idx
  ON auth_sessions (user_id)
  WHERE revoked_at IS NULL;

COMMIT;
