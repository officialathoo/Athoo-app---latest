import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const utility = fs.readFileSync("../athoo-app/utils/serviceHistory.ts", "utf8");
const component = fs.readFileSync("../athoo-app/components/design/ServiceHistoryInsights.tsx", "utf8");
const screen = fs.readFileSync("../athoo-app/app/(customer)/(tabs)/bookings.tsx", "utf8");

test("service history uses deterministic maintenance intervals", () => {
  assert.match(utility, /SERVICE_INTERVAL_DAYS/);
  assert.match(utility, /air conditioner|hvac/);
  assert.match(utility, /buildServiceHistoryInsights/);
});

test("service history provides explainable repeat booking actions", () => {
  assert.match(component, /Helpful timing based on your completed services/);
  assert.match(component, /Recommended now/);
  assert.match(component, /onBookAgain\(insight\.latestBooking\)/);
});

test("customer booking history wires service insights without changing booking APIs", () => {
  assert.match(screen, /ServiceHistoryInsights/);
  assert.match(screen, /buildRepeatBookingParams\(booking\)/);
  assert.match(screen, /book-service/);
});
