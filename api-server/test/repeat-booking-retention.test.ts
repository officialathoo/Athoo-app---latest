import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path: string) => fs.readFileSync(path, "utf8");

test("repeat booking reuses trusted provider and prior service context", () => {
  const helper = read("../athoo-app/utils/repeatBooking.ts");
  assert.match(helper, /providerId: booking\.providerId/);
  assert.match(helper, /prefillAddress: booking\.address/);
  assert.match(helper, /prefillDescription: booking\.description/);
  assert.match(helper, /previousBookingId: booking\.id/);
});

test("customer booking history and detail use the shared repeat-booking helper", () => {
  const history = read("../athoo-app/app/(customer)/(tabs)/bookings.tsx");
  const detail = read("../athoo-app/app/(customer)/booking-detail.tsx");
  assert.match(history, /buildRepeatBookingParams\(b\)/);
  assert.match(detail, /buildRepeatBookingParams\(booking\)/);
});

test("booking wizard explains and safely prefills repeat service details", () => {
  const wizard = read("../athoo-app/app/(customer)/book-service.tsx");
  assert.match(wizard, /prefillAddress/);
  assert.match(wizard, /prefillDescription/);
  assert.match(wizard, /repeat-booking-prefill-notice/);
  assert.match(wizard, /Confirm the date, time, address, and price before submitting/);
});
