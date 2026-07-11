import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const bookingRoutes = fs.readFileSync(new URL("../src/routes/bookings.ts", import.meta.url), "utf8");
const customerDetail = fs.readFileSync(new URL("../../athoo-app/app/(customer)/booking-detail.tsx", import.meta.url), "utf8");
const providerDetail = fs.readFileSync(new URL("../../athoo-app/app/(provider)/job-detail.tsx", import.meta.url), "utf8");

test("provider arrival is atomic and duplicate notifications are prevented", () => {
  assert.match(bookingRoutes, /isNull\(bookingsTable\.providerArrivedAt\)/);
  assert.match(bookingRoutes, /duplicate: true/);
  assert.match(bookingRoutes, /duplicate: false/);
  assert.match(bookingRoutes, /broadcastBookingUpdate\(updated, "booking:arrived"\)/);
});

test("provider location freshness uses the server timestamp", () => {
  assert.match(bookingRoutes, /providerUpdatedAt: new Date\(\)/);
  assert.doesNotMatch(bookingRoutes, /new Date\(providerUpdatedAt\)/);
  assert.doesNotMatch(providerDetail, /providerUpdatedAt: coords\.updatedAt/);
});

test("customer tracking prioritizes realtime with a conservative fallback poll", () => {
  assert.match(customerDetail, /setInterval\(tick, 30_000\)/);
  assert.match(customerDetail, /AppState\.addEventListener\("change"/);
  assert.doesNotMatch(customerDetail, /setInterval\(tick, 3000\)/);
  assert.match(customerDetail, /booking:location/);
});
