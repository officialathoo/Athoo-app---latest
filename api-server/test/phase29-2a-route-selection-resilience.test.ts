import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "../..");
const read = (relative: string) =>
  fs.readFileSync(path.join(root, relative), "utf8").replace(/\r\n?/g, "\n");

test("Phase 29.2A keeps route limits finite and route labels honest", () => {
  const geo = read("api-server/src/routes/geo.ts");
  const search = read("athoo-app/app/(customer)/(tabs)/search.tsx");

  assert.match(geo, /function readBoundedIntegerEnvironment\(/);
  assert.match(
    geo,
    /readBoundedIntegerEnvironment\(\s*"GEO_ROUTE_METRICS_MAX_DESTINATIONS",\s*12,\s*1,\s*20,\s*\)/s,
  );
  assert.match(
    geo,
    /readBoundedIntegerEnvironment\(\s*"GEO_ROUTE_METRICS_CONCURRENCY",\s*3,\s*1,\s*6,\s*\)/s,
  );
  assert.doesNotMatch(
    geo,
    /Math\.trunc\(Number\(process\.env\.GEO_ROUTE_METRICS_(?:MAX_DESTINATIONS|CONCURRENCY)/,
  );

  assert.match(search, /routeStatus: hasRealCoords \? "unavailable" : undefined/);
  assert.match(search, /return filtered\s*\.filter\(\(provider\) => isValidMapCoord/s);
  assert.match(search, /\}, \[filtered, userLat, userLng\]\);/);
  assert.match(search, /routeStatus: "pending"/);
  assert.match(search, /routeSource: "unavailable",\s*routeStatus: "unavailable"/s);

  const filteredIndex = search.indexOf("const filtered = useMemo");
  const candidatesIndex = search.indexOf("const routeCandidateKey = useMemo");
  assert.ok(filteredIndex >= 0);
  assert.ok(candidatesIndex >= 0);
  assert.ok(filteredIndex < candidatesIndex);
});