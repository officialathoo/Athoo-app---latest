import assert from "node:assert/strict";
import fs from "node:fs";
import crypto from "node:crypto";
import { resolveNotificationTarget } from "../../athoo-app/services/notificationRouting.ts";
import test from "node:test";

function read(path: string): string {
  return fs.readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
}

test("mobile bundles distinct production notification sounds", () => {
  const config = read("athoo-app/app.config.js");
  assert.match(config, /athoo_job\.wav/);
  assert.match(config, /athoo_message\.wav/);
  assert.match(config, /athoo_general\.wav/);
  assert.match(config, /athoo_call\.wav/);
  const sounds = ["athoo_job.wav", "athoo_message.wav", "athoo_general.wav", "athoo_call.wav"];
  const hashes = new Set<string>();
  for (const sound of sounds) {
    const path = new URL(`../../athoo-app/assets/sounds/${sound}`, import.meta.url);
    assert.equal(fs.existsSync(path), true);
    hashes.add(crypto.createHash("sha256").update(fs.readFileSync(path)).digest("hex"));
  }
  assert.equal(hashes.size, sounds.length, "job, chat, general, and call sounds must be genuinely distinct");
});

test("android uses configurable versioned channels so custom sounds replace immutable legacy defaults", () => {
  const appConfig = read("athoo-app/app.config.js");
  const runtimeConfig = read("athoo-app/config/notifications.ts");
  const service = read("athoo-app/services/NotificationService.ts");
  assert.match(appConfig, /NOTIFICATION_CHANNEL_VERSION/);
  assert.match(runtimeConfig, /jobs-v4/);
  assert.match(runtimeConfig, /messages-v4/);
  assert.match(runtimeConfig, /general-v4/);
  assert.match(runtimeConfig, /calls-v4/);
  assert.match(service, /deleteNotificationChannelAsync/);
  assert.match(service, /sound: policy\.sound/);
});

test("server selects job message general and call push policies", () => {
  const push = read("api-server/src/lib/push.ts");
  assert.match(push, /categoryForType/);
  assert.match(push, /athoo_job\.wav/);
  assert.match(push, /athoo_message\.wav/);
  assert.match(push, /athoo_general\.wav/);
  assert.match(push, /athoo_call\.wav/);
  assert.match(push, /channelId: policy\.channelId/);
  assert.match(push, /ttl: policy\.ttl/);
});

test("push payloads preserve per-recipient notification ids", () => {
  const notifications = read("api-server/src/lib/notifications.ts");
  assert.match(notifications, /sendExpoPushMessages/);
  assert.match(notifications, /notificationId: notificationRow\.id/);
  assert.match(notifications, /notificationId: id/);
});

test("notification taps use one allowlisted role-aware route resolver", () => {
  const context = read("athoo-app/context/NotificationContext.tsx");
  const routing = read("athoo-app/services/notificationRouting.ts");
  assert.match(context, /resolveNotificationTarget/);
  assert.match(routing, /\/\(provider\)\/job-detail/);
  assert.match(routing, /\/\(customer\)\/booking-detail/);
  assert.match(routing, /\/\(provider\)\/broadcast-jobs/);
  assert.match(routing, /\/\(customer\)\/broadcast-status/);
  assert.doesNotMatch(context, /notif\.type === "broadcast" as any/);
});

test("foreground push and websocket delivery deduplicate by notification id", () => {
  const context = read("athoo-app/context/NotificationContext.tsx");
  assert.match(context, /knownNotificationIdsRef/);
  assert.match(context, /addNotificationReceivedListener/);
  assert.match(context, /toStringValue\(payload\.id\)/);
  assert.match(context, /notificationId/);
});

test("incoming calls have killed-app push recovery", () => {
  const calls = read("api-server/src/routes/calls.ts");
  assert.match(calls, /type: "call"/);
  assert.match(calls, /link: "\/call"/);
  assert.match(calls, /expiresAt/);
  assert.match(calls, /notifyUser/);
});


test("role-aware resolver opens the correct concrete destinations", () => {
  assert.deepEqual(
    resolveNotificationTarget({ bookingId: "book-1", type: "booking" }, "customer"),
    { pathname: "/(customer)/booking-detail", params: { bookingId: "book-1" } },
  );
  assert.deepEqual(
    resolveNotificationTarget({ link: "/bookings/book-2" }, "provider"),
    { pathname: "/(provider)/job-detail", params: { bookingId: "book-2" } },
  );
  assert.equal(
    resolveNotificationTarget({ type: "call", callId: "call-1" }, "provider"),
    "/(provider)/(tabs)/dashboard",
  );
  assert.equal(
    resolveNotificationTarget({ link: "/untrusted/arbitrary-screen" }, "customer"),
    "/(customer)/(tabs)/home",
  );
});
