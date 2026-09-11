import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "../..");
const read = (relative: string) =>
  fs.readFileSync(path.join(root, relative), "utf8").replace(/\r\n?/g, "\n");

test("Phase 30.2M migrates customer Search road metrics to the provider-id helper", () => {
  const search = read("athoo-app/app/(customer)/(tabs)/search.tsx");

  assert.match(
    search,
    /import \{ getDirections, getProviderRouteMetricsBatch, reverseGeocode \} from "@\/services\/maps";/,
  );
  assert.match(search, /void getProviderRouteMetricsBatch\(userLat, userLng, candidates\)/);
  assert.doesNotMatch(search, /\bgetRouteMetricsBatch\(userLat, userLng, candidates\)/);
});

test("Phase 30.2M sends only provider ids from Search to secure route metrics", () => {
  const search = read("athoo-app/app/(customer)/(tabs)/search.tsx");

  assert.match(search, /\.map\(\(provider\) => provider\.id\)\s*\.join\("\|"\)/);
  assert.match(
    search,
    /const candidateIds = new Set\(routeCandidateKey\.split\("\|"\)\.filter\(Boolean\)\);/,
  );
  assert.match(search, /const candidates = Array\.from\(candidateIds\);/);

  const secureCallBlock = search.match(
    /const candidateIds = new Set\(routeCandidateKey[\s\S]*?getProviderRouteMetricsBatch\(userLat, userLng, candidates\)/,
  )?.[0] || "";

  assert.ok(secureCallBlock, "secure Search route-metrics call block was not found");
  assert.doesNotMatch(secureCallBlock, /\blat:\s*provider\.latitude/);
  assert.doesNotMatch(secureCallBlock, /\blng:\s*provider\.longitude/);
});

test("Phase 30.2M preserves the existing bounded candidate selection and road-distance UI states", () => {
  const search = read("athoo-app/app/(customer)/(tabs)/search.tsx");

  assert.match(search, /\.slice\(0, 12\)/);
  assert.match(search, /routeStatus: "pending"/);
  assert.match(search, /routeStatus: "routed"/);
  assert.match(search, /routeSource: "unavailable"/);
  assert.match(search, /km by road/);
  assert.match(search, /Calculating road route/);
  assert.match(search, /Road route unavailable/);
});