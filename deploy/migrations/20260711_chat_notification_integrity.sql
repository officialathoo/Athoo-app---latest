ALTER TABLE chats ADD COLUMN IF NOT EXISTS participant1_hidden_at TIMESTAMP;
ALTER TABLE chats ADD COLUMN IF NOT EXISTS participant2_hidden_at TIMESTAMP;
ALTER TABLE chats ADD COLUMN IF NOT EXISTS is_locked BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE chats ADD COLUMN IF NOT EXISTS locked_reason TEXT;
ALTER TABLE chats ADD COLUMN IF NOT EXISTS locked_by TEXT;
ALTER TABLE chats ADD COLUMN IF NOT EXISTS locked_at TIMESTAMP;

ALTER TABLE messages ADD COLUMN IF NOT EXISTS client_message_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS messages_sender_client_uidx
  ON messages(chat_id, sender_id, client_message_id)
  WHERE client_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS chats_locked_last_message_idx
  ON chats(is_locked, last_message_at DESC);
