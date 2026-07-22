import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "../..");
const read = (relative: string) =>
  fs.readFileSync(path.join(root, relative), "utf8").replace(/\r\n?/g, "\n");

test("Phase 29.0B provides bounded authenticated road-route metrics without presenting straight-line distance as road distance", () => {
  const geo = read("api-server/src/routes/geo.ts");
  const maps = read("athoo-app/services/maps.ts");
  const search = read("athoo-app/app/(customer)/(tabs)/search.tsx");

  assert.match(geo, /router\.post\("\/route-metrics", requireAuth/);
  assert.match(geo, /GEO_ROUTE_METRICS_MAX_DESTINATIONS/);
  assert.match(geo, /GEO_ROUTE_METRICS_CONCURRENCY/);
  assert.match(geo, /mapWithConcurrency/);
  assert.match(geo, /result\.source !== "straight_line"/);
  assert.match(geo, /ROUTE_METRICS_LIMIT_EXCEEDED/);
  assert.match(geo, /setCached\(cacheKey, metric, 5 \* 60 \* 1000\)/);

  assert.match(maps, /export async function getRouteMetricsBatch/);
  assert.match(maps, /"\/api\/geo\/route-metrics"/);
  assert.match(maps, /destinations: normalized/);
  assert.match(maps, /\.slice\(0, 12\)/);

  assert.match(search, /straightLineDistanceKm/);
  assert.match(search, /getRouteMetricsBatch\(userLat, userLng, candidates\)/);
  assert.match(search, /routeStatus: "routed"/);
  assert.match(search, /km by road/);
  assert.match(search, /Calculating road route/);
  assert.match(search, /Road route unavailable/);
  assert.match(search, /Number\.POSITIVE_INFINITY/);

  const visibleDistanceBlocks = [
    search.match(/selectedProvider\.routeStatus[\s\S]{0,700}Road route unavailable/)?.[0] || "",
    search.match(/p\.routeStatus === "pending"[\s\S]{0,500}km road/)?.[0] || "",
  ].join("\n");
  assert.doesNotMatch(visibleDistanceBlocks, /straightLineDistanceKm/);
  assert.doesNotMatch(search, /Ã‚Â±/);
});