import test from "node:test";
import assert from "node:assert/strict";
import { readRepo as read } from "./helpers/repo.ts";


test("negotiation screen resolves address coordinates before submission", () => {
  const source = read("athoo-app/app/(customer)/negotiate.tsx");
  assert.match(source, /searchAddress\(address\.trim\(\), null, 1\)/);
  assert.match(source, /latitude: latitude!/);
  assert.match(source, /longitude: longitude!/);
});

test("negotiation creation is client-idempotent across mobile API and server", () => {
  const mobile = read("athoo-app/services/api.ts");
  const context = read("athoo-app/context/NegotiationContext.tsx");
  const server = read("api-server/src/routes/negotiations.ts");
  const migration = read("deploy/migrations/20260716_chat_negotiation_reliability.sql");
  assert.match(context, /clientRequestId = `neg_/);
  assert.match(mobile, /clientRequestId: string/);
  assert.match(server, /eq\(negotiationsTable\.clientRequestId, requestId\)/);
  assert.match(server, /duplicate: true/);
  assert.match(migration, /negotiations_customer_request_uidx/);
});

test("chat delivery and active-room read state are synchronized", () => {
  const server = read("api-server/src/routes/chat.ts");
  const mobile = read("athoo-app/context/ChatContext.tsx");
  const bus = read("api-server/src/lib/eventBus.ts");
  assert.match(server, /liveRecipientConnections > 0/);
  assert.match(server, /chat:delivered/);
  assert.match(bus, /\| "chat:delivered"/);
  assert.match(mobile, /msg\.type === "chat:delivered"/);
  assert.match(mobile, /activeChatId === chatId/);
  assert.match(mobile, /api\.markChatRead\(chatId\)/);
});
