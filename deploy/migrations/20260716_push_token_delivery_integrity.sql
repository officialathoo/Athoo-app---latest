BEGIN;

-- A native Expo token identifies one installed app instance. Historical rows
-- could retain the same token after account switching, allowing one device to
-- receive notifications for multiple accounts. Keep only the most recently
-- updated owner before enforcing uniqueness.
WITH ranked_tokens AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY expo_push_token
      ORDER BY updated_at DESC NULLS LAST, id DESC
    ) AS token_rank
  FROM users
  WHERE expo_push_token IS NOT NULL AND trim(expo_push_token) <> ''
)
UPDATE users AS u
SET expo_push_token = NULL, updated_at = now()
FROM ranked_tokens AS ranked
WHERE u.id = ranked.id AND ranked.token_rank > 1;

UPDATE users
SET expo_push_token = NULL, updated_at = now()
WHERE expo_push_token IS NOT NULL AND trim(expo_push_token) = '';

CREATE UNIQUE INDEX IF NOT EXISTS users_expo_push_token_uidx
  ON users (expo_push_token)
  WHERE expo_push_token IS NOT NULL;

COMMIT;
