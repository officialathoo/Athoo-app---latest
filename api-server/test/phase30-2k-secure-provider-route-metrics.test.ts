import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "../..");
const read = (relative: string) =>
  fs.readFileSync(path.join(root, relative), "utf8").replace(/\r\n?/g, "\n");

test("Phase 30.2K adds authenticated provider-id route metrics without exposing provider coordinates", () => {
  const geo = read("api-server/src/routes/geo.ts");

  assert.match(
    geo,
    /router\.post\("\/provider-route-metrics", requireAuth, async \(req: AuthRequest, res: Response\) => \{/,
  );
  assert.match(geo, /const rawProviderIds = Array\.isArray\(req\.body\?\.providerIds\)/);
  assert.match(geo, /PROVIDER_ROUTE_METRICS_LIMIT_EXCEEDED/);
  assert.match(geo, /inArray\(usersTable\.id, providerIds\)/);
  assert.match(geo, /eq\(usersTable\.role, "provider"\)/);
  assert.match(geo, /eq\(usersTable\.accountStatus, "active"\)/);
  assert.match(geo, /eq\(usersTable\.isDeactivated, false\)/);
  assert.match(geo, /eq\(usersTable\.isBlocked, false\)/);
  assert.match(geo, /eq\(usersTable\.verificationStatus, "approved"\)/);
  assert.match(geo, /PROVIDER_LOCATION_MAX_ACCURACY_METERS/);
  assert.match(geo, /PROVIDER_LOCATION_MAX_AGE_MS/);
});

test("Phase 30.2K resolves precise provider coordinates only inside the API", () => {
  const geo = read("api-server/src/routes/geo.ts");

  const endpoint = geo.match(
    /router\.post\("\/provider-route-metrics"[\s\S]*?\}\);\s*router\.post\("\/route-metrics"/,
  )?.[0] || "";

  assert.ok(endpoint, "provider-route-metrics endpoint block was not found");

  assert.match(endpoint, /latitude: usersTable\.latitude/);
  assert.match(endpoint, /longitude: usersTable\.longitude/);
  assert.match(endpoint, /const lat = Number\(provider\.latitude\)/);
  assert.match(endpoint, /const lng = Number\(provider\.longitude\)/);
  assert.match(endpoint, /destLat: destination\.lat/);
  assert.match(endpoint, /destLng: destination\.lng/);

  assert.doesNotMatch(endpoint, /res\.json\(\{[\s\S]{0,250}\blatitude\b/);
  assert.doesNotMatch(endpoint, /res\.json\(\{[\s\S]{0,250}\blongitude\b/);
});

test("Phase 30.2K preserves bounded provider-neutral routing and truthful unavailable results", () => {
  const geo = read("api-server/src/routes/geo.ts");

  const endpoint = geo.match(
    /router\.post\("\/provider-route-metrics"[\s\S]*?\}\);\s*router\.post\("\/route-metrics"/,
  )?.[0] || "";

  assert.ok(endpoint, "provider-route-metrics endpoint block was not found");

  assert.match(endpoint, /GEO_ROUTE_METRICS_MAX_DESTINATIONS/);
  assert.match(endpoint, /GEO_ROUTE_METRICS_CONCURRENCY/);
  assert.match(endpoint, /mapWithConcurrency\(destinations, concurrency/);
  assert.match(endpoint, /getMapProviderConfiguration\(runtimeOverrides\)/);
  assert.match(endpoint, /getMapOperationProvider\(config\.directionsProvider\)/);
  assert.match(endpoint, /result\.source !== "straight_line"/);
  assert.match(endpoint, /setCached\(cacheKey, metric, 5 \* 60 \* 1000\)/);
  assert.match(endpoint, /source: "unavailable"/);
  assert.match(endpoint, /routed: false as const/);
  assert.match(endpoint, /const routes = providerIds\.map/);
});