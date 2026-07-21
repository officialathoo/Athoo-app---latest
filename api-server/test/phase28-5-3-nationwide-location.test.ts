import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "../..");
const mapSource = fs.readFileSync(
  path.join(root, "athoo-app/app/(customer)/map.tsx"),
  "utf8",
);

test("customer map uses fresh nationwide GPS instead of the first provider location", () => {
  assert.match(mapSource, /preferFresh:\s*true/);
  assert.match(mapSource, /maxCacheAgeMs:\s*2\s*\*\s*60\s*\*\s*1000/);

  assert.match(
    mapSource,
    /const mapCenter = pickedLocation[\s\S]*?\(providerId \? selectedProvider : userLocation\)/,
  );

  assert.match(
    mapSource,
    /const nearestProvider = currentCoords[\s\S]*?getDistanceKm/,
  );

  assert.doesNotMatch(
    mapSource,
    /setSelectedProvider\(requestedProvider \|\| mapped\[0\]/,
  );

  assert.match(mapSource, /latitude=\{mapCenter\?\.latitude\}/);
  assert.match(mapSource, /longitude=\{mapCenter\?\.longitude\}/);
});