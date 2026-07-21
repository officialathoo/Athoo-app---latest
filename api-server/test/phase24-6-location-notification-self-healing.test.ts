import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "../..");
const read = (relative: string) => fs.readFileSync(path.join(root, relative), "utf8");

test("forced provider sync requests a fresh GPS fix instead of accepting a recent cached point", () => {
  const location = read("athoo-app/services/location.ts");
  const auth = read("athoo-app/context/AuthContext.tsx");

  assert.match(location, /preferFresh\?: boolean/);
  assert.match(location, /!options\.preferFresh && !options\.requireFresh && bestCached\?\.accuracy != null/);
  assert.match(location, /preferUsableFreshLocation\(fresh, bestCached, requiredAccuracy\)/);
  assert.match(location, /if \(fresh\.accuracy == null \|\| fresh\.accuracy <= usableFreshAccuracy\) return fresh/);
  assert.match(location, /requireFresh\?: boolean/);
  assert.match(auth, /preferFresh: force,\s*requireFresh: true/);
});

test("notification permission and native initialization recover after temporary failure or settings changes", () => {
  const notifications = read("athoo-app/services/NotificationService.ts");

  assert.match(notifications, /refreshPermissionState/);
  assert.match(notifications, /await N\.getPermissionsAsync\(\)/);
  assert.match(notifications, /if \(!N \|\| !\(await this\.refreshPermissionState\(N\)\)\) return null/);
  assert.match(notifications, /this\.channelsCreated = false;[\s\S]*?throw error/);
  assert.match(notifications, /try \{[\s\S]*?await this\.init\(\);[\s\S]*?\} catch \{[\s\S]*?return null/);
});

test("push token registration self-heals on foreground and on a bounded active-session interval", () => {
  const auth = read("athoo-app/context/AuthContext.tsx");
  const runtime = read("athoo-app/config/runtime.ts");
  const config = read("athoo-app/app.config.js");
  const env = read(".env.production.example");
  const notifications = read("athoo-app/services/NotificationService.ts");

  assert.match(auth, /runtimeConfig\.notifications\.pushTokenSyncIntervalMs/);
  assert.ok((auth.match(/syncPushToken\(api\.baseUrl, token, \{ force: true \}\)/g) || []).length >= 2);
  assert.match(runtime, /EXPO_PUBLIC_PUSH_TOKEN_SYNC_INTERVAL_MS/);
  assert.match(config, /PUSH_TOKEN_SYNC_INTERVAL_MS: pushTokenSyncIntervalMs/);
  assert.match(env, /^EXPO_PUBLIC_PUSH_TOKEN_SYNC_INTERVAL_MS=900000$/m);
  assert.match(notifications, /options: \{ force\?: boolean \} = \{\}/);
  assert.match(notifications, /!options\.force && this\.syncedToken === expoPushToken/);
  assert.match(notifications, /lastTokenSyncAt/);
  assert.match(notifications, /private tokenSyncPromise: Promise<void> \| null = null/);
  assert.match(notifications, /private tokenSyncSessionKey: string \| null = null/);
  assert.match(notifications, /if \(this\.tokenSyncSessionKey === syncSessionKey\) return this\.tokenSyncPromise/);
  assert.match(notifications, /return this\.syncPushToken\(apiBaseUrl, authToken, options\)/);
  assert.match(notifications, /this\.tokenSyncPromise = null/);
  assert.match(notifications, /this\.tokenSyncSessionKey = null/);
});
