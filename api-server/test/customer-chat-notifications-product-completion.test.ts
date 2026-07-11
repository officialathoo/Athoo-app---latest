import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const chatRoute = fs.readFileSync(new URL("../src/routes/chat.ts", import.meta.url), "utf8");
const schema = fs.readFileSync(new URL("../../lib/db/src/schema/index.ts", import.meta.url), "utf8");
const chatContext = fs.readFileSync(new URL("../../athoo-app/context/ChatContext.tsx", import.meta.url), "utf8");
const api = fs.readFileSync(new URL("../../athoo-app/services/api.ts", import.meta.url), "utf8");
const adminRoute = fs.readFileSync(new URL("../src/routes/admin.ts", import.meta.url), "utf8");
const adminPage = fs.readFileSync(new URL("../../admin-panel/src/pages/ChatModerationPage.tsx", import.meta.url), "utf8");
const migration = fs.readFileSync(new URL("../../deploy/migrations/20260711_chat_notification_integrity.sql", import.meta.url), "utf8");

test("chat messages are idempotent across retries", () => {
  assert.match(schema, /clientMessageId: text\("client_message_id"\)/);
  assert.match(schema, /messages_sender_client_uidx/);
  assert.match(chatRoute, /clientMessageId is required/);
  assert.match(chatRoute, /onConflictDoNothing\(\)/);
  assert.match(chatRoute, /duplicate: true/);
  assert.match(api, /Retry once with the same idempotency key/);
  assert.match(chatContext, /clientMessageId/);
});

test("deleting a chat hides it per participant and retains shared evidence", () => {
  assert.match(schema, /participant1HiddenAt/);
  assert.match(schema, /participant2HiddenAt/);
  assert.match(chatRoute, /Conversation hidden from your chat list/);
  assert.doesNotMatch(chatRoute, /db\.delete\(messagesTable\)/);
  assert.doesNotMatch(chatRoute, /db\.delete\(chatsTable\)/);
});

test("admin moderation can review and lock conversations with audit controls", () => {
  assert.match(adminRoute, /router\.get\("\/chats"/);
  assert.match(adminRoute, /requirePermission\("complaints\.read"\)/);
  assert.match(adminRoute, /router\.patch\("\/chats\/:id\/lock"/);
  assert.match(adminRoute, /requirePermission\("complaints\.write"\)/);
  assert.match(adminRoute, /chat_locked/);
  assert.match(adminPage, /Conversation Moderation/);
  assert.match(adminPage, /data-testid="chat-moderation-page"/);
  assert.match(migration, /messages_sender_client_uidx/);
});

test("read receipts update the sender in realtime", () => {
  assert.match(chatRoute, /deliveryStatus: "read"/);
  assert.match(chatContext, /msg\.type === "chat:read"/);
  assert.match(chatContext, /deliveryStatus: "read"/);
});
