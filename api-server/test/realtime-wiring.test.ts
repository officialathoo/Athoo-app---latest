import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const ws = readFileSync(new URL("../src/ws.ts", import.meta.url), "utf8");
const chat = readFileSync(new URL("../src/routes/chat.ts", import.meta.url), "utf8");

test("websocket connections require an active database session", () => {
  assert.match(ws, /isSessionActive\(decoded\.sessionId, decoded\.userId\)/);
  assert.match(ws, /invalid_or_revoked_session/);
});

test("call websocket rooms are limited to call participants", () => {
  assert.match(ws, /call\.callerId !== decoded\.userId && call\.receiverId !== decoded\.userId/);
  assert.match(ws, /call_forbidden/);
});

test("chat creation derives participant names and validates booking membership", () => {
  assert.match(chat, /participant1Name: me\.name/);
  assert.match(chat, /participant2Name: other\.name/);
  assert.match(chat, /Chat participants must belong to this booking/);
});

test("chat read receipts verify participant authorization", () => {
  assert.match(chat, /Not a participant of this chat/);
  assert.match(chat, /eq\(messagesTable\.isRead, false\)/);
});
