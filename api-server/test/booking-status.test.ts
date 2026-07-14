import assert from "node:assert/strict";
import test from "node:test";
import {
  BOOKING_STATUSES,
  canTransitionBookingStatus,
  isBookingStatus,
} from "../src/domain/booking-status.ts";

test("recognizes every supported booking status", () => {
  for (const status of BOOKING_STATUSES) {
    assert.equal(isBookingStatus(status), true);
  }

  assert.equal(isBookingStatus("refunded"), false);
  assert.equal(isBookingStatus(undefined), false);
  assert.equal(isBookingStatus(1), false);
});

test("allows only the approved customer/provider lifecycle", () => {
  assert.equal(canTransitionBookingStatus("pending", "accepted"), true);
  assert.equal(canTransitionBookingStatus("pending", "cancelled"), true);
  assert.equal(canTransitionBookingStatus("accepted", "in_progress"), true);
  assert.equal(canTransitionBookingStatus("accepted", "cancelled"), true);
  assert.equal(canTransitionBookingStatus("in_progress", "completed"), true);
});

test("rejects terminal-state and backwards transitions", () => {
  assert.equal(canTransitionBookingStatus("completed", "in_progress"), false);
  assert.equal(canTransitionBookingStatus("completed", "cancelled"), false);
  assert.equal(canTransitionBookingStatus("cancelled", "accepted"), false);
  assert.equal(canTransitionBookingStatus("in_progress", "accepted"), false);
  assert.equal(canTransitionBookingStatus("accepted", "completed"), false);
});

test("treats a missing persisted status as pending but rejects unknown values", () => {
  assert.equal(canTransitionBookingStatus(undefined, "accepted"), true);
  assert.equal(canTransitionBookingStatus(null, "cancelled"), true);
  assert.equal(canTransitionBookingStatus("legacy_status", "accepted"), false);
});
