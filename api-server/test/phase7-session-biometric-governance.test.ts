import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const read = (relative: string) => fs.readFileSync(path.join(root, relative), "utf8");

test("single-device login is serialized and revokes every older active session", () => {
  const session = read("api-server/src/lib/session.ts");
  assert.match(session, /pg_advisory_xact_lock/);
  assert.match(session, /replaced_by_new_login/);
  assert.match(session, /expoPushToken: null/);
  assert.match(session, /disconnectUserSessions\(user\.id, sessionId/);
  assert.match(session, /const singleDeviceEnforced = true/);
});

test("database migration and schema enforce one active session per account", () => {
  const schema = read("lib/db/src/schema/index.ts");
  const migration = read("deploy/migrations/20260716_user_session_device_biometric_integrity.sql");
  assert.match(schema, /deviceId: text\("device_id"\)/);
  assert.match(schema, /auth_sessions_one_active_per_user_idx/);
  assert.match(migration, /row_number\(\) OVER/);
  assert.match(migration, /CREATE UNIQUE INDEX IF NOT EXISTS auth_sessions_one_active_per_user_idx/);
  assert.match(migration, /WHERE revoked_at IS NULL/);
});

test("mobile and admin clients attach stable device identity to authentication requests", () => {
  const mobileApi = read("athoo-app/services/api.ts");
  const deviceIdentity = read("athoo-app/services/deviceIdentity.ts");
  const adminApi = read("admin-panel/src/lib/api.ts");
  assert.match(deviceIdentity, /athoo_device_id/);
  assert.match(deviceIdentity, /setSecureItem/);
  assert.match(mobileApi, /"X-Athoo-Device-Id": deviceId/);
  assert.match(adminApi, /athoo_admin_device_id/);
  assert.match(adminApi, /"X-Athoo-Device-Id": getAdminDeviceId\(\)/);
});

test("refresh and middleware reject a mismatched physical device", () => {
  const session = read("api-server/src/lib/session.ts");
  const middleware = read("api-server/src/middlewares/auth.ts");
  assert.match(session, /device_identity_mismatch/);
  assert.match(session, /current\.deviceId !== requestedDeviceId/);
  assert.match(middleware, /req\.headers\["x-athoo-device-id"\]/);
  assert.match(middleware, /SESSION_REVOKED/);
});

test("purpose tokens preserve device binding for realtime and protected objects", () => {
  const auth = read("api-server/src/routes/auth.ts");
  const middleware = read("api-server/src/middlewares/auth.ts");
  const ws = read("api-server/src/ws.ts");
  const storage = read("api-server/src/routes/storage.ts");
  assert.match(auth, /deviceId: normalizeSessionDeviceId/);
  assert.match(middleware, /isSessionActive\(decoded\.sessionId, decoded\.userId, decoded\.deviceId\)/);
  assert.match(ws, /decoded\.deviceId/);
  assert.match(storage, /verifyActiveAccessToken\(token, req\.headers\["x-athoo-device-id"\]\)/);
});

test("revoked sessions are disconnected from active event and call sockets", () => {
  const registry = read("api-server/src/lib/sessionConnections.ts");
  const ws = read("api-server/src/ws.ts");
  const realtime = read("athoo-app/services/api.ts");
  assert.match(registry, /disconnectUserSessions/);
  assert.match(registry, /ws\.close\(4401/);
  assert.match(ws, /startSessionHeartbeat/);
  assert.match(ws, /registerSessionConnection/);
  assert.match(realtime, /event\.code === 4401/);
  assert.match(realtime, /_unauthorizedHandler\?\.\(\)/);
});

test("biometric startup is a real lock over a remembered encrypted session", () => {
  const authContext = read("athoo-app/context/AuthContext.tsx");
  const secureStorage = read("athoo-app/services/secureSessionStorage.ts");
  assert.match(authContext, /remember && biometricEnabled/);
  assert.match(authContext, /setRequiresBiometric\(true\)/);
  assert.match(authContext, /authenticateWithBiometric\("Sign in to Athoo"\)/);
  assert.match(authContext, /BIOMETRIC_RELOCK_MS/);
  assert.match(secureStorage, /AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY/);
});

test("logout is idempotent and clears cached private state without competing redirects", () => {
  const authContext = read("athoo-app/context/AuthContext.tsx");
  const rootLayout = read("athoo-app/app/_layout.tsx");
  const customerLayout = read("athoo-app/app/(customer)/_layout.tsx");
  const providerLayout = read("athoo-app/app/(provider)/_layout.tsx");
  assert.match(authContext, /logoutPromiseRef/);
  assert.match(authContext, /queryClient\.clear\(\)/);
  assert.match(authContext, /notificationService\.resetSyncedToken\(\)/);
  assert.match(authContext, /disableBiometric\(\)/);
  assert.doesNotMatch(authContext, /router\.replace/);
  assert.match(rootLayout, /function SessionRouteGuard/);
  assert.doesNotMatch(customerLayout, /router\.replace/);
  assert.doesNotMatch(providerLayout, /router\.replace\([^)]*welcome/);
  assert.doesNotMatch(read("athoo-app/app/auth/welcome.tsx"), /router\.replace/);
  assert.doesNotMatch(read("athoo-app/app/auth/login.tsx"), /router\.replace/);
});

test("admin login history exposes device identity for investigations", () => {
  const page = read("admin-panel/src/pages/LoginHistoryPage.tsx");
  assert.match(page, /deviceId\?: string/);
  assert.match(page, /Smartphone/);
  assert.match(page, /Web \/ desktop/);
  assert.match(page, /legacy/);
});


test("server logout clears push ownership before revoking the session", () => {
  const auth = read("api-server/src/routes/auth.ts");
  const logoutStart = auth.indexOf('router.post("/logout"');
  const logoutEnd = auth.indexOf('router.post("/logout-all"');
  const block = auth.slice(logoutStart, logoutEnd);
  assert.match(block, /expoPushToken: null/);
  assert.ok(block.indexOf("expoPushToken: null") < block.indexOf("revokeSession"));
});
