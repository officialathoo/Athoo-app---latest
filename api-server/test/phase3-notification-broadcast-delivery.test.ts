import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { resolveNotificationTarget } from "../../athoo-app/services/notificationRouting.ts";

function read(path: string): string {
  return fs.readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
}

test("notification channels use a new immutable Android generation and retain distinct sounds", () => {
  const runtime = read("athoo-app/config/notifications.ts");
  const appConfig = read("athoo-app/app.config.js");
  const server = read("api-server/src/lib/push.ts");
  for (const channel of ["jobs-v4", "messages-v4", "general-v4", "calls-v4"]) {
    assert.match(runtime, new RegExp(channel));
    assert.match(server, new RegExp(channel.split("-v4")[0]));
  }
  assert.match(appConfig, /NOTIFICATION_DEPRECATED_CHANNEL_IDS/);
  assert.match(runtime, /jobs-v3,messages-v3,general-v3,calls-v3/);
});

test("Expo push tickets are verified and invalid device tokens are retired", () => {
  const push = read("api-server/src/lib/push.ts");
  assert.match(push, /PUSH_RECEIPT_ENDPOINT/);
  assert.match(push, /expo_push_receipts/);
  assert.match(push, /fetchExpoReceipts/);
  assert.match(push, /DeviceNotRegistered/);
  assert.match(push, /queueExpoReceiptCheck/);
  assert.match(push, /where\(eq\(usersTable\.expoPushToken, token\)\)/);
});

test("realtime fallback restores tones only when native push cannot deliver", () => {
  const server = read("api-server/src/lib/notifications.ts");
  const service = read("athoo-app/services/NotificationService.ts");
  const context = read("athoo-app/context/NotificationContext.tsx");
  assert.match(server, /notification:push-failed/);
  assert.match(server, /nativePushExpected/);
  assert.match(service, /scheduleRealtimeFallback/);
  assert.match(service, /acknowledgeNativeDelivery/);
  assert.match(context, /message\.type === "notification:push-failed"/);
  assert.match(context, /payload\.nativePushExpected === false/);
});

test("push token ownership is one device to one account at API and database levels", () => {
  const auth = read("api-server/src/routes/auth.ts");
  const migration = read("deploy/migrations/20260716_push_token_delivery_integrity.sql");
  const schema = read("lib/db/src/schema/index.ts");
  assert.match(auth, /db\.transaction/);
  assert.match(auth, /ne\(usersTable\.id, req\.user!\.userId\)/);
  assert.match(migration, /row_number\(\) OVER/);
  assert.match(migration, /users_expo_push_token_uidx/);
  assert.match(schema, /users_expo_push_token_uidx/);
});

test("admin broadcasts use safe audiences and report actual delivery channels", () => {
  const admin = read("api-server/src/routes/admin.ts");
  const primaryUi = read("admin-panel/src/pages/BroadcastsPage.tsx");
  const legacyUi = read("admin-panel/src/pages/NotificationTemplatesPage.tsx");
  assert.match(admin, /customer: "customers"/);
  assert.match(admin, /provider: "providers"/);
  assert.match(admin, /allowedAudiences = new Set\(\["all", "customers", "providers"\]\)/);
  assert.match(admin, /INVALID_BROADCAST_AUDIENCE/);
  assert.match(admin, /if \(!aud\) return res\.status\(400\)/);
  assert.match(admin, /type: "system"/);
  assert.match(admin, /link: "\/notifications"/);
  assert.match(admin, /delivery\.pushAccepted/);
  assert.match(primaryUi, /push accepted/);
  assert.match(legacyUi, /inAppCount/);
});

test("provider job broadcasts share strict service, account, location, and radius rules", () => {
  const broadcast = read("api-server/src/routes/broadcast.ts");
  assert.match(broadcast, /normalizeServiceKey/);
  assert.match(broadcast, /providerMatchesService/);
  assert.match(broadcast, /requestedServiceLabel/);
  assert.match(broadcast, /exact normalized matching prevents unrelated partial-name matches/);
  assert.match(broadcast, /matchProviderToBroadcast/);
  assert.match(broadcast, /provider_location_required/);
  assert.match(broadcast, /outside_service_area/);
  assert.match(broadcast, /Math\.min\(Math\.max\(1, platformRadiusKm\), providerTravelRadiusKm\(provider\)\)/);
  assert.match(broadcast, /broadcast_expand_notifications/);
  assert.match(broadcast, /BROADCAST_DELIVERY_CONCURRENCY/);
  assert.match(broadcast, /forEachWithConcurrency/);
  assert.doesNotMatch(broadcast, /Promise\.all\(expandedOnly\.map/);
  assert.match(broadcast, /expansionQueued/);
  assert.match(broadcast, /BROADCAST_NOT_ELIGIBLE/);
});

test("notification links open the concrete chat and broadcast requested by the payload", () => {
  assert.deepEqual(
    resolveNotificationTarget({ link: "/chat/chat-7" }, "provider"),
    { pathname: "/(provider)/chat-room", params: { chatId: "chat-7" } },
  );
  assert.deepEqual(
    resolveNotificationTarget({ link: "/broadcasts/job-9" }, "provider"),
    { pathname: "/(provider)/broadcast-jobs", params: { requestId: "job-9" } },
  );
  assert.deepEqual(
    resolveNotificationTarget({ broadcastRequestId: "job-10" }, "customer"),
    { pathname: "/(customer)/broadcast-status", params: { requestId: "job-10" } },
  );
});
