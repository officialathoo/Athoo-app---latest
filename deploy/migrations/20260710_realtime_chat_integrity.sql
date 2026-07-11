BEGIN;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS media_url text;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS media_type text;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS file_name text;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS delivery_status text NOT NULL DEFAULT 'sent';
CREATE INDEX IF NOT EXISTS chats_participant1_last_message_idx ON chats(participant1_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS chats_participant2_last_message_idx ON chats(participant2_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS messages_chat_created_idx ON messages(chat_id, created_at ASC);
COMMIT;
