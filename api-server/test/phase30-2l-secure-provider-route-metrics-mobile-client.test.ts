import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "../..");
const read = (relative: string) =>
  fs.readFileSync(path.join(root, relative), "utf8").replace(/\r\n?/g, "\n");

test("Phase 30.2L adds a bounded provider-id route metrics mobile client", () => {
  const maps = read("athoo-app/services/maps.ts");

  assert.match(maps, /export async function getProviderRouteMetricsBatch\(/);
  assert.match(maps, /"\/api\/geo\/provider-route-metrics"/);
  assert.match(maps, /providerIds: normalizedProviderIds/);
  assert.match(maps, /\.slice\(0, 12\)/);
  assert.match(maps, /new Set\(/);
  assert.match(maps, /timeoutMs: 15_000/);
});

test("Phase 30.2L sends provider ids instead of precise provider destination coordinates", () => {
  const maps = read("athoo-app/services/maps.ts");

  const helper = maps.match(
    /export async function getProviderRouteMetricsBatch\([\s\S]*?\}\s*export interface DirectionsResult/,
  )?.[0] || "";

  assert.ok(helper, "getProviderRouteMetricsBatch helper block was not found");
  assert.match(helper, /body: \{\s*originLat,\s*originLng,\s*providerIds: normalizedProviderIds,/);
  assert.doesNotMatch(helper, /\bdestinations\b/);
  assert.doesNotMatch(helper, /\.lat\b/);
  assert.doesNotMatch(helper, /\.lng\b/);
});

test("Phase 30.2L preserves truthful route response parsing and graceful failure", () => {
  const maps = read("athoo-app/services/maps.ts");

  const helper = maps.match(
    /export async function getProviderRouteMetricsBatch\([\s\S]*?\}\s*export interface DirectionsResult/,
  )?.[0] || "";

  assert.ok(helper, "getProviderRouteMetricsBatch helper block was not found");
  assert.match(helper, /route\.distanceKm == null \|\| !Number\.isFinite\(Number\(route\.distanceKm\)\)/);
  assert.match(helper, /route\.durationMin == null \|\| !Number\.isFinite\(Number\(route\.durationMin\)\)/);
  assert.match(helper, /route\.source\.replace\(\/-cache\$\/, ""\)/);
  assert.match(helper, /routed: route\.routed === true/);
  assert.match(helper, /catch \{\s*return \[\];\s*\}/);
});