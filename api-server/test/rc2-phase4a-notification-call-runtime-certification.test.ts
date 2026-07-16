import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

function read(path: string): string {
  return fs.readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
}

test("Expo Go detection does not disable notifications in development clients", () => {
  const runtime = read("athoo-app/lib/runtimeEnvironment.ts");
  assert.match(runtime, /storeclient/);
  assert.doesNotMatch(runtime, /__DEV__/);
  assert.doesNotMatch(runtime, /owner !== "standalone"/);
});

test("notification policies are portable and shared through build-time runtime config", () => {
  const config = read("athoo-app/app.config.js");
  const mobile = read("athoo-app/config/notifications.ts");
  const server = read("api-server/src/lib/push.ts");
  assert.match(config, /NOTIFICATION_CONFIG/);
  assert.match(config, /NOTIFICATION_JOB_CHANNEL_ID/);
  assert.match(config, /NOTIFICATION_CALL_SOUND_ASSET/);
  assert.match(mobile, /notificationPolicies/);
  assert.match(server, /NOTIFICATION_JOB_CHANNEL_ID/);
  assert.match(server, /PUSH_PROVIDER_ENDPOINT/);
  assert.match(server, /getPushConfigurationStatus/);
});

test("native realtime delivery no longer schedules duplicate local notifications or sounds", () => {
  const notificationContext = read("athoo-app/context/NotificationContext.tsx");
  const broadcast = read("athoo-app/context/BroadcastContext.tsx");
  const booking = read("athoo-app/context/BookingContext.tsx");
  const negotiation = read("athoo-app/context/NegotiationContext.tsx");
  const providerTabs = read("athoo-app/app/(provider)/(tabs)/_layout.tsx");
  assert.match(notificationContext, /playRealtimeFallback/);
  assert.doesNotMatch(broadcast, /scheduleBroadcastAlert|scheduleResponseAlert|soundService/);
  assert.doesNotMatch(providerTabs, /scheduleBroadcastAlert|soundService/);
  assert.doesNotMatch(booking, /scheduleBookingAlert|scheduleStatusAlert|soundService/);
  assert.doesNotMatch(negotiation, /scheduleStatusAlert|soundService/);
});

test("app ringtone stops in background so native call channel owns background audio", () => {
  const calls = read("athoo-app/context/CallContext.tsx");
  const sound = read("athoo-app/services/SoundService.ts");
  assert.match(calls, /appStateRef\.current === "active"/);
  assert.match(calls, /Background\/killed-app recovery is owned by the native call notification/);
  assert.match(sound, /applyAlertAudioMode/);
  assert.match(sound, /stopAllOneShotSounds/);
  assert.match(sound, /playThroughEarpieceAndroid: false/);
});

test("health endpoints expose safe push diagnostics", () => {
  const app = read("api-server/src/app.ts");
  const health = read("api-server/src/routes/health.ts");
  assert.match(app, /getPushConfigurationStatus/);
  assert.match(health, /getPushConfigurationStatus/);
});
