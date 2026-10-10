import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateUploadPolicy } from "../src/lib/storageSecurity.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const read = (relative: string) => fs.readFileSync(path.join(root, relative), "utf8");

test("compound executable extensions cannot bypass an allowed final extension", () => {
  for (const name of [
    "profile.php.jpg",
    "invoice.html.pdf",
    "video.exe.mp4",
    "evidence.svg.png",
    "document.js.pdf",
    "payload.apk.jpg",
  ]) {
    const extension = path.extname(name).toLowerCase();
    const contentType = extension === ".pdf"
      ? "application/pdf"
      : extension === ".mp4"
        ? "video/mp4"
        : "image/jpeg";
    assert.match(
      validateUploadPolicy({ name, contentType, size: 1024 }) || "",
      /Executable or active-content file names are not allowed/,
      name,
    );
  }
  assert.equal(validateUploadPolicy({ name: "profile-photo.jpg", contentType: "image/jpeg", size: 1024 }), null);
});

test("legacy account endpoints cannot bypass password or OTP step-up", () => {
  const auth = read("api-server/src/routes/auth.ts");
  const account = read("api-server/src/routes/account.ts");
  const index = read("api-server/src/routes/index.ts");
  assert.match(auth, /router\.delete\("\/me"[\s\S]*STEP_UP_REQUIRED/);
  assert.match(auth, /router\.post\("\/deactivate"[\s\S]*STEP_UP_REQUIRED/);
  assert.match(index, /router\.use\("\/me\/account", accountRouter\)/);
  assert.match(account, /router\.post\("\/step-up\/request"/);
  assert.match(account, /router\.post\("\/step-up\/verify"/);
  assert.match(account, /router\.post\("\/deactivate"/);
  assert.match(account, /router\.post\("\/delete-request"/);
  assert.match(account, /password|verificationToken|mobile|email/);
});

test("production request firewall enforces HTTPS and IP plus bearer-token quotas", () => {
  const app = read("api-server/src/app.ts");
  assert.match(app, /HTTPS_REQUIRED/);
  assert.match(app, /x-forwarded-proto/);
  assert.match(app, /GLOBAL_RATE_LIMIT_MAX/);
  assert.match(app, /AUTH_TOKEN_RATE_LIMIT_WINDOW_MS/);
  assert.match(app, /AUTH_TOKEN_RATE_LIMIT_MAX/);
  assert.match(app, /auth-token:/);
  assert.match(app, /authenticated token rate limit exceeded/);
  assert.match(app, /status\(429\)/);
  assert.match(app, /Invalid request payload/);
  assert.match(app, /Internal server error/);
});

test("shared upload reads require entity membership and broadcast eligibility", () => {
  const source = read("api-server/src/lib/storageObjectAuthorization.ts");
  assert.match(source, /securityRecord\.scanStatus !== "clean"/);
  assert.match(source, /securityRecord\.scope !== "shared"/);
  assert.match(source, /bookingsTable\.customerId/);
  assert.match(source, /chatsTable\.participant1Id/);
  assert.match(source, /negotiationMessagesContainPath/);
  assert.match(source, /providerCanReadOpenBroadcastMedia/);
  assert.match(source, /provider\.verificationStatus !== "approved"/);
  assert.match(source, /provider\.isBlocked/);
  assert.match(source, /provider\.maxTravelDistanceKm/);
  assert.match(source, /distanceKm/);
  assert.match(source, /activeWork/);
});

test("scheduled jobs use schedule-aware expiry, reminders, and geofenced arrival", () => {
  const sweeper = read("api-server/src/lib/bookingSweeper.ts");
  const bookingRoute = read("api-server/src/routes/bookings.ts");
  assert.match(sweeper, /scheduledAt \? scheduledAt\.getTime\(\) \+ PENDING_GRACE_MS/);
  assert.match(sweeper, /scheduled_day/);
  assert.match(sweeper, /five_hours/);
  assert.match(sweeper, /BOOKING_NO_SHOW_AUTO_CANCEL_ENABLED/);
  assert.match(bookingRoute, /BOOKING_ARRIVAL_RADIUS_KM/);
  assert.match(bookingRoute, /BOOKING_ARRIVAL_MAX_ACCURACY_METERS/);
  assert.match(bookingRoute, /ARRIVAL_LOCATION_REQUIRED|ARRIVAL_OUTSIDE_RADIUS/);
  assert.match(bookingRoute, /providerLat|providerLng/);
});

test("booking cache hydrates silently without persisting OTPs or phones", () => {
  const context = read("athoo-app/context/BookingContext.tsx");
  assert.match(context, /athoo:bookings:/);
  assert.match(context, /startPin: undefined/);
  assert.match(context, /completePin: undefined/);
  assert.match(context, /customerPhone: ""/);
  assert.match(context, /providerPhone: ""/);
  assert.match(context, /silent: cached\.length > 0/);
  assert.match(context, /bookingsRef\.current/);
  assert.match(context, /AsyncStorage\.setItem/);
});

test("single-accept and negotiation enrichment remove redundant provider acceptance", () => {
  const broadcast = read("api-server/src/routes/broadcast.ts");
  const negotiations = read("api-server/src/routes/negotiations.ts");
  const customerOffers = read("athoo-app/app/(customer)/(tabs)/bookings.tsx");
  assert.match(broadcast, /status:\s*"accepted"/);
  assert.match(broadcast, /acceptedResponseId/);
  assert.match(negotiations, /finalTravellingCharge/);
  assert.match(negotiations, /mediaUrls/);
  assert.match(negotiations, /latitude/);
  assert.match(negotiations, /status:\s*"accepted"/);
  assert.doesNotMatch(customerOffers, /Complete Booking/);
});

test("invoice verification is signed, rate-limited, non-PII and rendered as a real QR", () => {
  const helper = read("api-server/src/lib/invoiceVerification.ts");
  const route = read("api-server/src/routes/invoices.ts");
  const app = read("api-server/src/app.ts");
  const pdf = read("athoo-app/utils/bookingInvoicePdf.ts");
  assert.match(helper, /createHmac\("sha256"/);
  assert.match(helper, /timingSafeEqual/);
  assert.match(helper, /PUBLIC_API_BASE_URL must use HTTPS/);
  assert.match(helper, /createQrSvg/);
  assert.match(route, /signed, unguessable HMAC token/);
  assert.match(route, /Names, phone numbers, addresses and private booking details are intentionally hidden/);
  assert.match(route, /frame-ancestors 'none'/);
  assert.match(app, /INVOICE_VERIFY_RATE_LIMIT_MAX/);
  assert.match(pdf, /qrCodeDataUri/);
  assert.match(pdf, /official Athoo system|official Athoo verification/i);
  assert.doesNotMatch(route, /customerName:\s*invoice\.customerName/);
  assert.doesNotMatch(route, /address:\s*invoice\.address/);
});

test("Render fails closed on scanner readiness and process-environment validation", () => {
  const render = read("render.yaml");
  const validator = read("scripts/tools/validate-environment.mjs");
  assert.match(render, /startCommand: pnpm env:validate -- --process && pnpm db:migrate/);
  assert.match(render, /healthCheckPath: \/api\/healthz\/deep/);
  for (const key of [
    "UPLOAD_SCAN_MODE",
    "UPLOAD_SCANNER_URL",
    "UPLOAD_SCANNER_TOKEN",
    "UPLOAD_LEGACY_READ_POLICY",
    "INVOICE_VERIFICATION_SECRET",
    "AUTH_TOKEN_RATE_LIMIT_MAX",
    "INVOICE_VERIFY_RATE_LIMIT_MAX",
  ]) assert.match(render, new RegExp(`key: ${key}`));
  assert.match(validator, /--process/);
  assert.match(validator, /INVOICE_VERIFICATION_SECRET/);
});
