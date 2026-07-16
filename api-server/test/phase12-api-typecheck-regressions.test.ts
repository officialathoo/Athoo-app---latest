import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const read = (relative: string) => fs.readFileSync(path.join(root, relative), "utf8");

test("inactivity lifecycle realtime event and admin notification contracts stay type-safe", () => {
  const events = read("api-server/src/lib/eventBus.ts");
  const lifecycle = read("api-server/src/lib/inactivityLifecycle.ts");
  assert.match(events, /\| "account:inactivity-cleared"/);
  assert.match(lifecycle, /emitToUser\(user\.id, "account:inactivity-cleared"/);
  assert.doesNotMatch(lifecycle, /createAdminNotification\(\{[\s\S]{0,500}?\bdata:/);
});

test("direct uploads may declare a content length through UploadFileInput", () => {
  const storage = read("api-server/src/lib/storageProvider.ts");
  assert.match(storage, /export interface UploadFileInput \{[\s\S]*?size\?: number;/);
  assert.match(storage, /ContentLength: Number\.isFinite\(input\.size\)/);
});

test("auth session metadata normalizes multi-valued device headers", () => {
  const auth = read("api-server/src/routes/auth.ts");
  assert.match(auth, /function firstHeaderValue\(value: string \| string\[\] \| undefined\): string \| null/);
  assert.match(auth, /deviceId: firstHeaderValue\(req\.headers\["x-athoo-device-id"\]\)/);
});

test("broadcast matching receives both service identity and service label", () => {
  const broadcast = read("api-server/src/routes/broadcast.ts");
  assert.match(
    broadcast,
    /Pick<BroadcastRecord, "service" \| "serviceLabel" \| "latitude" \| "longitude">/,
  );
  assert.match(broadcast, /providerMatchesService\(provider\.services, request\.service, request\.serviceLabel\)/);
});

test("ICE candidate handler has consistent void returns", () => {
  const calls = read("api-server/src/routes/calls.ts");
  const start = calls.indexOf('router.post("/:callId/ice-candidate"');
  const end = calls.indexOf("// ── Audio chunk upload", start);
  const handler = calls.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.doesNotMatch(handler, /return res\./);
  assert.match(handler, /res\.json\(\{ success: true \}\);\s*return;/);
  assert.match(handler, /res\.status\(500\)\.json\(\{ error: "Failed to add ICE candidate" \}\);\s*return;/);
});

test("public marketing banners tolerate nullable database link types", () => {
  const marketing = read("api-server/src/routes/marketing.ts");
  assert.match(marketing, /linkType\?: string \| null/);
  assert.match(marketing, /const linkType = String\(value\.linkType \|\| "none"\)/);
});

test("subscription detail routes normalize Express array params", () => {
  const subscriptions = read("api-server/src/routes/subscriptions.ts");
  assert.match(subscriptions, /const subscriptionId = Array\.isArray\(req\.params\.id\) \? req\.params\.id\[0\] : req\.params\.id/);
  assert.match(subscriptions, /eq\(userSubscriptionsTable\.id, subscriptionId\)/);
});
