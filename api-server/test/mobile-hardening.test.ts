import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const api = readFileSync(new URL("../../athoo-app/services/api.ts", import.meta.url), "utf8");
const secureStorage = readFileSync(new URL("../../athoo-app/services/secureSessionStorage.ts", import.meta.url), "utf8");
const authContext = readFileSync(new URL("../../athoo-app/context/AuthContext.tsx", import.meta.url), "utf8");
const layout = readFileSync(new URL("../../athoo-app/app/_layout.tsx", import.meta.url), "utf8");
const notificationService = readFileSync(new URL("../../athoo-app/services/NotificationService.ts", import.meta.url), "utf8");
const notificationContext = readFileSync(new URL("../../athoo-app/context/NotificationContext.tsx", import.meta.url), "utf8");
const authRoutes = readFileSync(new URL("../src/routes/auth.ts", import.meta.url), "utf8");
const push = readFileSync(new URL("../src/lib/push.ts", import.meta.url), "utf8");
const notifications = readFileSync(new URL("../src/lib/notifications.ts", import.meta.url), "utf8");

test("native session tokens use secure storage with legacy migration", () => {
  assert.match(api, /getSecureItem\(key\)/);
  assert.match(api, /setSecureItem\(TOKEN_KEY, token\)/);
  assert.match(secureStorage, /expo-secure-store/);
  assert.match(secureStorage, /One-time migration from older AsyncStorage releases/);
});

test("mobile fails visibly when the API URL is missing", () => {
  assert.match(api, /ATHOO_API_NOT_CONFIGURED/);
  assert.match(api, /isConfigured: Boolean\(API_BASE_URL\)/);
  assert.match(layout, /ApiConfigurationScreen/);
});

test("logout clears push registration before revoking the session", () => {
  const clearIndex = authContext.indexOf('api.savePushToken("")');
  const logoutIndex = authContext.indexOf("api.logoutSession()");
  assert.ok(clearIndex >= 0 && logoutIndex >= 0 && clearIndex < logoutIndex);
  assert.match(authContext, /notificationService\.resetSyncedToken\(\)/);
});

test("notification navigation has one owner and supports cold starts", () => {
  assert.doesNotMatch(notificationService, /addNotificationResponseReceivedListener/);
  assert.doesNotMatch(layout, /addNotificationResponseReceivedListener/);
  assert.match(notificationContext, /getLastNotificationResponseAsync/);
  assert.match(notificationContext, /addNotificationResponseReceivedListener\(openResponse\)/);
});

test("push tokens are validated and stale devices are removed", () => {
  assert.match(authRoutes, /INVALID_PUSH_TOKEN/);
  assert.match(push, /DeviceNotRegistered/);
  assert.match(push, /invalidTokens/);
  assert.match(notifications, /set\(\{ expoPushToken: null \}\)/);
});
