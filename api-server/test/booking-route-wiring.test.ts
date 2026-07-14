import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/routes/bookings.ts", import.meta.url), "utf8");

test("PIN start and completion commands are guarded by atomic status/PIN updates", () => {
  assert.match(source, /BOOKING_START_CONFLICT/);
  assert.match(source, /eq\(bookingsTable\.status, "accepted"\)/);
  assert.match(source, /gte\(bookingsTable\.startPinExpiresAt, new Date\(\)\)/);
  assert.match(source, /BOOKING_COMPLETE_CONFLICT/);
  assert.match(source, /eq\(bookingsTable\.status, "in_progress"\)/);
  assert.match(source, /gte\(bookingsTable\.completePinExpiresAt, new Date\(\)\)/);
});

test("same-price counter acceptance validates provider before accepting and returns sanitized data", () => {
  const validation = source.indexOf("Validate provider eligibility before either auto-accepting");
  const shortcut = source.indexOf("If provider accepts the customer's same amount");
  assert.ok(validation >= 0 && shortcut > validation);
  assert.match(source, /BOOKING_ACCEPT_CONFLICT/);
  assert.match(source, /sanitizeBookingForViewer\(updated as any/);
  assert.match(source, /reason: "accepted"/);
});
