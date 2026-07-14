import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "../..");
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

test("customer booking wizard uses shared progress and price summary", () => {
  const source = read("athoo-app/app/(customer)/book-service.tsx");
  assert.match(source, /customer-booking-progress/);
  assert.match(source, /customer-booking-price-summary/);
  assert.match(source, /BookingPriceSummary/);
});

test("provider job details expose lifecycle progress without changing actions", () => {
  const source = read("athoo-app/app/(provider)/job-detail.tsx");
  assert.match(source, /provider-job-progress/);
  assert.match(source, /handleAccept/);
  assert.match(source, /handleVerifyCompleteOtp/);
});

test("admin booking details show an operational lifecycle timeline", () => {
  const page = read("admin-panel/src/pages/BookingsPage.tsx");
  const timeline = read("admin-panel/src/components/BookingTimeline.tsx");
  assert.match(page, /BookingTimeline status=\{selected\.status\}/);
  assert.match(timeline, /admin-booking-timeline/);
  assert.match(timeline, /Requested/);
  assert.match(timeline, /Completed/);
});
