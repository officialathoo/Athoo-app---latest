import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "../..");
const read = (relative: string) => fs.readFileSync(path.join(root, relative), "utf8");
const json = (relative: string) => JSON.parse(read(relative));

test("V2 uses one canonical verified location snapshot across all job creation paths", () => {
  const integrity = read("api-server/src/lib/locationIntegrity.ts");
  const bookings = read("api-server/src/routes/bookings.ts");
  const broadcast = read("api-server/src/routes/broadcast.ts");
  const negotiations = read("api-server/src/routes/negotiations.ts");
  const addresses = read("api-server/src/routes/addresses.ts");
  for (const source of [bookings, broadcast, negotiations, addresses]) {
    assert.match(source, /parseCanonicalLocation/);
    assert.match(source, /assertLocationInActiveServiceArea/);
  }
  assert.match(integrity, /LOCATION_CITY_REQUIRED/);
  assert.match(integrity, /LOCATION_AREA_REQUIRED/);
  assert.match(integrity, /LOCATION_OUTSIDE_ACTIVE_SERVICE_AREA/);
  assert.match(integrity, /LOCATION_COUNTRY_INVALID/);
  assert.match(integrity, /LOCATION_CONFIRMATION_EXPIRED/);
});

test("V2 persists canonical locations and cursor indexes through one ordered migration", () => {
  const schema = read("lib/db/src/schema/index.ts");
  const migration = read("deploy/migrations/20260802_athoo_v2_location_pagination_integrity.sql");
  const latest = read("lib/db/src/migrations.ts");
  for (const column of ["locationCity", "locationArea", "locationProvince", "locationCountryCode", "locationSource", "locationConfirmedAt"]) {
    assert.match(schema, new RegExp(column));
  }
  assert.match(migration, /bookings_customer_updated_cursor_idx/);
  assert.match(migration, /bookings_provider_updated_cursor_idx/);
  assert.match(migration, /location_accuracy/);
  assert.match(latest, /20260802_athoo_v2_location_pagination_integrity\.sql/);
});

test("V2 booking history is cursor paginated, delta refreshed, cached, and bounded", () => {
  const route = read("api-server/src/routes/bookings.ts");
  const context = read("athoo-app/context/BookingContext.tsx");
  const api = read("athoo-app/services/api.ts");
  assert.match(route, /encodeBookingCursor/);
  assert.match(route, /decodeBookingCursor/);
  assert.match(route, /updatedSince/);
  assert.match(route, /limit \+ 1/);
  assert.match(context, /BOOKING_CACHE_MAX_ROWS = 250/);
  assert.match(context, /loadMoreBookings/);
  assert.match(context, /deltaPages < 10/);
  assert.match(context, /startPin: undefined/);
  assert.match(context, /completePin: undefined/);
  assert.match(api, /cursor\?: string \| null; updatedSince\?: string \| null/);
});

test("V2 mobile creation screens transmit city, area, source, accuracy and confirmation time", () => {
  for (const file of [
    "athoo-app/app/(customer)/book-service.tsx",
    "athoo-app/app/(customer)/negotiate.tsx",
    "athoo-app/app/(customer)/addresses.tsx",
  ]) {
    const source = read(file);
    assert.match(source, /locationCity/);
    assert.match(source, /locationArea/);
    assert.match(source, /locationCountryCode/);
    assert.match(source, /locationSource/);
    assert.match(source, /locationConfirmedAt/);
  }
});

test("V2 deployed readiness fails when active service geography is not configured", () => {
  const health = read("api-server/src/routes/health.ts");
  const env = read(".env.production.example");
  const render = read("render.yaml");
  assert.match(health, /activeServiceAreas/);
  assert.match(health, /activeServiceAreas > 0/);
  for (const key of ["SERVICE_COUNTRY_CODE", "SERVICE_COUNTRY_MIN_LAT", "SERVICE_COUNTRY_MAX_LAT", "LOCATION_MAX_ACCURACY_METERS", "LOCATION_CONFIRMATION_MAX_AGE_MS"]) {
    assert.match(env, new RegExp(`^${key}=`, "m"));
    assert.match(render, new RegExp(`- key: ${key}`));
  }
});

test("V2 default service-area seed supports nationwide Pakistan coverage", () => {
  const seed = read("scripts/src/seed.ts");
  for (const region of ["Punjab", "Sindh", "Khyber Pakhtunkhwa", "Balochistan", "Islamabad Capital Territory", "Gilgit-Baltistan", "Azad Jammu and Kashmir"]) {
    assert.match(seed, new RegExp(region.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("V2 release metadata is source-complete but remains honest about external certification", () => {
  const status = json("docs/qa/current-release-status.json");
  assert.equal(status.candidate, "ATHOO_APP_V2_1_CONNECTED_CERTIFICATION_HARDENED.zip");
  assert.equal(status.releaseVersion, "2.1.0");
  assert.equal(status.completion.sourceImplementationPercent, 100);
  assert.equal(status.externalVerification.connectedRuntime, "pending");
  assert.equal(status.externalVerification.androidDevice, "pending");
  assert.equal(status.externalVerification.iosDevice, "pending");
  assert.match(status.launchDecision, /^NO-GO-/);
});
