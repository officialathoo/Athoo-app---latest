import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "../..");
const read = (relative: string) =>
  fs.readFileSync(path.join(root, relative), "utf8").replace(/\r\n?/g, "\n");

test("Phase 30.2P adds a dedicated bounded Search discovery route before dynamic provider lookup", () => {
  const providers = read("api-server/src/routes/providers.ts");

  const searchIndex = providers.indexOf('router.get("/search"');
  const dynamicIndex = providers.indexOf('router.get("/:id"');

  assert.ok(searchIndex >= 0, "provider Search discovery route is missing");
  assert.ok(dynamicIndex > searchIndex, "provider Search route must be registered before /:id");
  assert.match(providers, /const parsedLimit = rawLimit === undefined \? 25 : Number\(rawLimit\)/);
  assert.match(providers, /const limit = Math\.min\(50, parsedLimit\)/);
  assert.match(providers, /const fetchLimit = limit \+ 1/);
  assert.match(providers, /hasMore/);
  assert.match(providers, /nextCursor/);
});

test("Phase 30.2P preserves provider eligibility and admin-managed premium priority", () => {
  const providers = read("api-server/src/routes/providers.ts");

  const endpoint = providers.match(
    /router\.get\("\/search"[\s\S]*?\n\}\);\s*router\.get\("\/:id"/,
  )?.[0] || "";

  assert.ok(endpoint, "provider Search discovery endpoint block was not found");
  assert.match(endpoint, /eq\(usersTable\.role, "provider"\)/);
  assert.match(endpoint, /eq\(usersTable\.accountStatus, "active"\)/);
  assert.match(endpoint, /eq\(usersTable\.isDeactivated, false\)/);
  assert.match(endpoint, /eq\(usersTable\.isBlocked, false\)/);
  assert.match(endpoint, /eq\(usersTable\.verificationStatus, "approved"\)/);
  assert.match(endpoint, /await getPlatformSettings\(\)/);
  assert.match(endpoint, /\.premiumPriorityBoost/);
  assert.match(endpoint, /CASE WHEN \$\{usersTable\.isPremium\} = true THEN 4 ELSE 0 END/);
});

test("Phase 30.2P supports selected-service AND synonym-derived service matching without exposing provider coordinates", () => {
  const providers = read("api-server/src/routes/providers.ts");

  const endpoint = providers.match(
    /router\.get\("\/search"[\s\S]*?\n\}\);\s*router\.get\("\/:id"/,
  )?.[0] || "";

  assert.ok(endpoint, "provider Search discovery endpoint block was not found");
  assert.match(endpoint, /req\.query\.matchServices/);
  assert.match(endpoint, /rawMatchServices\.length > 30/);
  assert.match(endpoint, /const matchedServiceFilter = matchServices\.length/);
  assert.match(endpoint, /lower\(\$\{matchedService\}\) = ANY\(SELECT lower\(unnest\(\$\{usersTable\.services\}\)\)\)/);
  assert.match(endpoint, /serviceId[\s\S]*?lower\(\$\{serviceId\}\) = ANY/);
  assert.match(endpoint, /providers: pageProviders\.map\(\(provider\) => toPublicProvider\(provider\)\)/);
  assert.doesNotMatch(endpoint, /providers: pageProviders\.map\(\(provider\) => \(\{\s*\.\.\.provider/);
});

test("Phase 30.2P provides deterministic recommended, rating, jobs and nearby cursor ordering", () => {
  const providers = read("api-server/src/routes/providers.ts");

  assert.match(providers, /type ProviderSearchSort = "recommended" \| "rating" \| "jobs" \| "nearby"/);
  assert.match(providers, /recommendedScore\?: number/);
  assert.match(providers, /ratingCount\?: number/);
  assert.match(providers, /totalJobs\?: number/);
  assert.match(providers, /distanceKm\?: number/);
  assert.match(providers, /desc\(providerRecommendedScore\)/);
  assert.match(providers, /desc\(providerRatingOrder\)/);
  assert.match(providers, /desc\(providerTotalJobsOrder\)/);
  assert.match(providers, /asc\(providerDistanceOrder\)/);
  assert.match(providers, /encodeProviderSearchCursor/);
  assert.match(providers, /decodeProviderSearchCursor/);
});

test("Phase 30.2P mobile API exposes bounded Search discovery with category-match service ids", () => {
  const api = read("athoo-app/services/api.ts");

  assert.match(api, /getProviderSearchDiscovery\(options:/);
  assert.match(api, /"recommended" \| "rating" \| "jobs" \| "nearby"/);
  assert.match(api, /matchServices\?: string\[\]/);
  assert.match(api, /"\/api\/providers\/search"/);
  assert.match(api, /limit: options\.limit \?\? 25/);
  assert.match(api, /matchServices: options\.matchServices\?\.length/);
  assert.match(api, /options\.matchServices\.join\(","\)/);
  assert.match(api, /nextCursor: string \| null/);
});