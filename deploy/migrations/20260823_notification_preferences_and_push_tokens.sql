-- Server-enforced push notification preferences and multi-device push tokens.
--
-- notification_preferences: per-user push category switches (jobs / messages /
--   calls / general). Rows default to fully enabled; absence of a row means all
--   categories enabled, so the gate is backward compatible.
-- push_tokens: registry of Expo push tokens per installed app instance so a
--   user can be signed in on more than one device without devices overwriting
--   each other's token. users.expo_push_token keeps mirroring the most recent
--   registration for backward compatibility with existing readers.

CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id text PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  jobs_enabled boolean NOT NULL DEFAULT true,
  messages_enabled boolean NOT NULL DEFAULT true,
  calls_enabled boolean NOT NULL DEFAULT true,
  general_enabled boolean NOT NULL DEFAULT true,
  updated_at timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS push_tokens (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token text NOT NULL,
  device_id text,
  platform text,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS push_tokens_token_key ON push_tokens(token);
CREATE INDEX IF NOT EXISTS push_tokens_user_idx ON push_tokens(user_id);
