import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const read = (relativePath: string) => readFileSync(resolve(root, relativePath), "utf8");

test("customer provider cards and details preserve multiple services", () => {
  const card = read("athoo-app/components/ui/ProviderCard.tsx");
  const detail = read("athoo-app/app/(customer)/provider-detail.tsx");

  assert.match(card, /serviceLabels/);
  assert.match(card, /remainingServiceCount/);
  assert.match(detail, /selectedServiceId/);
  assert.match(detail, /Choose the required service/);
  assert.doesNotMatch(detail, /provider\.services\?\.\[0\]/);
});

test("customer actions carry an explicit selected service", () => {
  const detail = read("athoo-app/app/(customer)/provider-detail.tsx");
  const negotiate = read("athoo-app/app/(customer)/negotiate.tsx");

  assert.match(detail, /serviceId: selectedService\?\.slug/);
  assert.match(detail, /service: serviceLabel/);
  assert.match(negotiate, /resolvedServiceLabel/);
  assert.match(negotiate, /Which service do you need/);
  assert.doesNotMatch(negotiate, /provider\?\.services\?\.\[0\]/);
  assert.match(negotiate, /apiErrorToMessage/);
});

test("provider rate changes are explicit general profile rate requests", () => {
  const profile = read("athoo-app/app/(provider)/edit-profile.tsx");
  const route = read("api-server/src/routes/rate-requests.ts");
  const admin = read("admin-panel/src/pages/RateRequestsPage.tsx");

  assert.match(profile, /service: "general"/);
  assert.match(profile, /Request General Hourly Rate/);
  assert.match(profile, /Current approved rate/);
  assert.match(profile, /Pending request/);
  assert.match(route, /isGeneralRate/);
  assert.match(admin, /General profile rate/);
});

test("approved provider changes refresh public profiles", () => {
  const rateRoute = read("api-server/src/routes/rate-requests.ts");
  const accountRoute = read("api-server/src/routes/account.ts");
  const serviceProviders = read("athoo-app/app/(customer)/service-providers.tsx");

  assert.match(rateRoute, /emitToRole\("customer", "admin:event"/);
  assert.match(rateRoute, /action: "rate_updated"/);
  assert.match(accountRoute, /action: "service_approved"/);
  assert.match(serviceProviders, /providerRefreshVersion/);
});

test("direct provider profiles expose only active approved providers", () => {
  const providersRoute = read("api-server/src/routes/providers.ts");

  assert.match(providersRoute, /eq\(usersTable\.role, "provider"\)/);
  assert.match(providersRoute, /eq\(usersTable\.verificationStatus, "approved"\)/);
  assert.match(providersRoute, /eq\(usersTable\.isBlocked, false\)/);
  assert.match(providersRoute, /eq\(usersTable\.isDeactivated, false\)/);
});
