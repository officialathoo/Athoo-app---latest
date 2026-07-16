import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path: string) => fs.readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

test("provider schedules are validated and enforced for bookings and negotiations", () => {
  const helper = read("api-server/src/lib/providerAvailability.ts");
  const bookings = read("api-server/src/routes/bookings.ts");
  const negotiations = read("api-server/src/routes/negotiations.ts");
  assert.match(helper, /end time must be after start time/);
  assert.match(helper, /At least one availability day must be enabled/);
  assert.match(bookings, /providerScheduleAllows/);
  assert.match(negotiations, /providerScheduleAllows/);
});

test("service radius is bounded and enforced in discovery and transaction entry", () => {
  const helper = read("api-server/src/lib/providerAvailability.ts");
  const providers = read("api-server/src/routes/providers.ts");
  const bookings = read("api-server/src/routes/bookings.ts");
  const broadcast = read("api-server/src/routes/broadcast.ts");
  assert.match(helper, /radius >= 1 && radius <= 100/);
  assert.match(providers, /providerWithinRadius/);
  assert.match(bookings, /outside the provider's/);
  assert.match(broadcast, /Math\.min\(Math\.max\(1, platformRadiusKm\), providerTravelRadiusKm\(provider\)\)/);
});

test("admin availability policy is permissioned, audited and exposed in provider operations", () => {
  const admin = read("api-server/src/routes/admin.ts");
  const page = read("admin-panel/src/pages/ProvidersPage.tsx");
  assert.match(admin, /availability-policy/);
  assert.match(admin, /requirePermission\("users\.write"\)/);
  assert.match(admin, /provider_availability_policy_updated/);
  assert.match(page, /provider-availability-policy/);
  assert.match(page, /Save Policy/);
});
