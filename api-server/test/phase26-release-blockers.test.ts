import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const source = async (relativePath: string) => readFile(path.join(root, relativePath), "utf8");

test("booking completion calculates and persists one timed invoice transactionally", async () => {
  const bookings = await source("api-server/src/routes/bookings.ts");
  assert.match(bookings, /SELECT id FROM bookings WHERE id = \$\{args\.bookingId\} FOR UPDATE/);
  assert.match(bookings, /calculateTimedInvoice\(/);
  assert.match(bookings, /ratePerHour: booking\.ratePerHour/);
  assert.match(bookings, /jobStartedAt: booking\.jobStartedAt/);
  assert.match(bookings, /price: calculation\.serviceAmount/);
  assert.match(bookings, /bookingPublicId: booking\.publicId/);
  assert.match(bookings, /durationMinutes: calculation\.durationMinutes/);
  assert.match(bookings, /commissionAmount: calculation\.commissionAmount/);
});

test("invoice screens use A4 output and the completed-job action opens the exact invoice", async () => {
  const customerInvoice = await source("athoo-app/app/(customer)/invoices.tsx");
  const adminInvoice = await source("admin-panel/src/pages/InvoicesPage.tsx");
  const bookingDetail = await source("athoo-app/app/(customer)/booking-detail.tsx");
  assert.match(customerInvoice, /@page\{size:A4/);
  assert.match(customerInvoice, /bookingPublicId/);
  assert.match(customerInvoice, /durationMinutes/);
  assert.match(adminInvoice, /@page\{size:A4/);
  assert.match(adminInvoice, /logo\.png/);
  assert.match(adminInvoice, /Print \/ Download PDF/);
  assert.match(bookingDetail, /pathname: "\/\(customer\)\/invoices"/);
  assert.match(bookingDetail, /bookingId: booking\.id/);
});

test("commission, complaint and rate-request notifications have exact admin routes and uncached counters", async () => {
  const payments = await source("api-server/src/routes/payments.ts");
  const support = await source("api-server/src/routes/support.ts");
  const rateRequests = await source("api-server/src/routes/rate-requests.ts");
  const admin = await source("api-server/src/routes/admin.ts");
  const api = await source("admin-panel/src/lib/api.ts");
  assert.match(payments, /type: "commission_payment"/);
  assert.match(payments, /\/admin\/payments\/\$\{result\.payment\.id\}/);
  assert.match(support, /\/admin\/support\/\$\{ticket\.id\}/);
  assert.match(rateRequests, /\/admin\/rate-requests\/\$\{rateRequest\.id\}/);
  assert.match(admin, /jsonb_build_array\(\$\{adminId\}::text\)/);
  assert.match(admin, /SELECT count\(\*\)::int AS unread_count/);
  assert.match(api, /admin\\\/\(notifications\|sidebar-counts\)\/\.test\(path\)\) return 0/);
});

test("payment accounts support verified shared QR uploads and app display", async () => {
  const payments = await source("api-server/src/routes/payments.ts");
  const adminPage = await source("admin-panel/src/pages/PaymentAccountsPage.tsx");
  const providerPage = await source("athoo-app/app/(provider)/pay-commission.tsx");
  const migration = await source("deploy/migrations/20260720_phase26_release_blockers.sql");
  assert.match(migration, /qr_code_url TEXT/);
  assert.match(payments, /isOwnedUploadObjectPath\(normalizedQrCodeUrl, req\.user!\.userId, \["shared"\]\)/);
  assert.match(adminPage, /Upload QR image/);
  assert.match(adminPage, /uploadFile\(file, "shared"\)/);
  assert.match(providerPage, /PrivateImage objectPath=\{acct\.qrCodeUrl\}/);
  assert.match(providerPage, /qrWrap:\s*\{/);
  assert.match(providerPage, /qrImage:\s*\{/);
  assert.match(providerPage, /qrCaption:\s*\{/);
});

test("commission push opens provider commission payment and biometric uses native enrolled methods", async () => {
  const routing = await source("athoo-app/services/notificationRouting.ts");
  const biometric = await source("athoo-app/services/biometric.ts");
  const setting = await source("athoo-app/components/security/BiometricLoginSetting.tsx");
  assert.match(routing, /commission_payment/);
  assert.match(routing, /\/\(provider\)\/pay-commission/);
  assert.match(biometric, /FACIAL_RECOGNITION/);
  assert.match(biometric, /FINGERPRINT/);
  assert.match(biometric, /IRIS/);
  assert.match(biometric, /disableDeviceFallback: false/);
  assert.match(biometric, /biometricsSecurityLevel: "weak"/);
  assert.match(biometric, /"error" in result/);
  assert.match(setting, /android\.settings\.BIOMETRIC_ENROLL/);
  assert.doesNotMatch(setting, /Linking\.openSettings\(\)/);
});

test("voice fallback drops stale backlog and ends all recording and playback resources", async () => {
  const calls = await source("athoo-app/context/CallContext.tsx");
  const callApi = await source("api-server/src/routes/calls.ts");
  assert.match(calls, /serverTime - capturedAt\) <= 2_000/);
  assert.match(calls, /freshChunks\[freshChunks\.length - 1\]/);
  assert.match(calls, /recording\.stopAndUnloadAsync/);
  assert.match(calls, /sound\.stopAsync/);
  assert.match(calls, /sound\.unloadAsync/);
  assert.match(calls, /setRecordingMode\(false\)/);
  assert.match(callApi, /clearCallAudio\(call\.id\)/);
  assert.match(callApi, /fallbackChunkMs: boundedInteger\(process\.env\.CALL_FALLBACK_CHUNK_MS, 400/);
});

test("location flow rejects poor fixes and map tile failures no longer render as an unexplained white screen", async () => {
  const location = await source("athoo-app/services/location.ts");
  const providerRoute = await source("api-server/src/routes/providers.ts");
  const map = await source("athoo-app/components/maps/OpenStreetMapPreview.tsx");
  const migration = await source("deploy/migrations/20260720_phase26_release_blockers.sql");
  assert.match(location, /maximumAcceptedAccuracy/);
  assert.match(location, /return \{ permission, location: null, stale: true \}/);
  assert.match(providerRoute, /LOCATION_ACCURACY_TOO_LOW/);
  assert.match(providerRoute, /locationUpdatedAt/);
  assert.match(migration, /location_accuracy REAL/);
  assert.match(map, /Map preview unavailable/);
  assert.match(map, /Retry Map/);
});

test("password change verifies the current password and revokes every session", async () => {
  const auth = await source("api-server/src/routes/auth.ts");
  const screen = await source("athoo-app/components/screens/ChangePasswordScreen.tsx");
  assert.match(auth, /bcrypt\.compare\(currentPassword, user\.password\)/);
  assert.match(auth, /revokeAllUserSessions\(req\.user!\.userId, "password_changed"\)/);
  assert.match(auth, /biometricEnabled: false/);
  assert.match(screen, /api\.setPassword/);
  assert.match(screen, /logout/);
});
