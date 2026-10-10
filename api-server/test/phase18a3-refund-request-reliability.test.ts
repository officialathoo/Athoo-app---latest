import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../..");
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

test("refund evidence is uploaded privately instead of embedded in request JSON", () => {
  const screen = read("athoo-app/app/(customer)/refund-requests.tsx");
  const route = read("api-server/src/routes/refunds.ts");

  assert.match(screen, /uploadPickedImage/);
  assert.match(screen, /"private"/);
  assert.match(screen, /evidenceUrl: evidencePath \|\| undefined/);
  assert.match(screen, /base64: false/);
  assert.doesNotMatch(screen, /base64: true/);
  assert.doesNotMatch(screen, /data:image\//);
  assert.match(route, /isOwnedUploadObjectPath\(evidenceUrl, userId, \["private"\]\)/);
  assert.match(route, /INVALID_REFUND_EVIDENCE/);
});

test("refund eligibility is server-owned and calculates the remaining paid total", () => {
  const route = read("api-server/src/routes/refunds.ts");
  const screen = read("athoo-app/app/(customer)/refund-requests.tsx");

  assert.match(route, /router\.get\("\/eligible-bookings"/);
  assert.match(route, /inArray\(bookingsTable\.status, \["completed", "cancelled"\]\)/);
  assert.match(route, /inArray\(bookingsTable\.paymentStatus, \["paid", "received"\]\)/);
  assert.match(route, /unresolved\.status in \('pending', 'approved'\)/);
  assert.match(route, /Number\(booking\.price \|\| 0\) \+ Number\(booking\.visitCharge \|\| 0\)/);
  assert.match(route, /remainingRefundable/);
  assert.match(screen, /Maximum refundable now/);
  assert.match(screen, /amt > selectedBooking\.remainingRefundable/);
});

test("refund creation is retry-safe race-safe and bounded", () => {
  const route = read("api-server/src/routes/refunds.ts");
  const app = read("api-server/src/app.ts");
  const env = read("scripts/tools/validate-environment.mjs");

  assert.match(route, /IDEMPOTENCY_CONFLICT/);
  assert.match(route, /sameIdempotentRequest/);
  assert.match(route, /pg_advisory_xact_lock/);
  assert.match(route, /inArray\(refundRequestsTable\.status, \["pending", "approved"\]\)/);
  assert.match(route, /validateRefundAmount\(amount, remainingRefundable\)/);
  assert.match(route, /refund\.self_requested/);
  assert.match(app, /"\/api\/refunds"[\s\S]*REFUND_REQUEST_RATE_LIMIT_MAX/);
  assert.match(app, /skip: \(req\) => req\.method === "GET"/);
  assert.match(env, /validateBoundedInteger\("REFUND_REQUEST_RATE_LIMIT_MAX", 10, 1, 100\)/);
});

test("database prevents more than one pending or approved refund per booking", () => {
  const migration = read("deploy/migrations/20260801_refund_request_reliability.sql");
  const schema = read("lib/db/src/schema/index.ts");
  const integrity = read("scripts/src/db-integrity.ts");

  assert.match(migration, /ranked_unresolved/);
  assert.match(migration, /status IN \('pending', 'approved'\)/);
  assert.match(migration, /refund_requests_unresolved_booking_uidx/);
  assert.match(migration, /bookings_customer_refund_eligibility_idx/);
  assert.match(migration, /refund_requests_booking_status_idx/);
  assert.match(schema, /refund_requests_unresolved_booking_uidx/);
  assert.match(integrity, /multiple_unresolved_refunds/);
});
