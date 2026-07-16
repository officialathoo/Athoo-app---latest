import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "../..");
const read = (relative: string) => fs.readFileSync(path.join(root, relative), "utf8");

test("Athoo uses an interactive OpenStreetMap tile preview without Google configuration", () => {
  const preview = read("athoo-app/components/maps/OpenStreetMapPreview.tsx");
  const fallback = read("athoo-app/components/maps/AthooMapFallback.tsx");
  const config = read("athoo-app/app.config.js");
  const pkg = read("athoo-app/package.json");

  assert.match(preview, /EXPO_PUBLIC_MAP_TILE_URL/);
  assert.match(preview, /TILE_TEMPLATE_CONFIGURED/);
  assert.doesNotMatch(preview, /athoo-api\.onrender\.com/);
  assert.match(preview, /tileUrl\(resolvedZoom, normalizedX, tileY, refreshKey\)/);
  assert.match(preview, /onCoordinateChange/);
  assert.match(preview, /SvgPolyline/);
  assert.match(fallback, /OpenStreetMapPreview/);
  assert.doesNotMatch(config, /googleMapsApiKey|GOOGLE_MAPS_API_KEY|googleMaps:/);
  assert.doesNotMatch(pkg, /react-native-maps/);
});

test("geo API uses bounded OpenStreetMap services with cache and safe fallbacks", () => {
  const geo = read("api-server/src/routes/geo.ts");
  const readiness = read("api-server/src/lib/productionReadiness.ts");

  assert.match(geo, /photon\.komoot\.io/);
  assert.match(geo, /nominatim\.openstreetmap\.org/);
  assert.match(geo, /router\.project-osrm\.org/);
  assert.match(geo, /AbortController/);
  assert.match(geo, /geoCache/);
  assert.match(geo, /source: "straight_line"/);
  assert.doesNotMatch(geo, /maps\.googleapis\.com|GOOGLE_KEY/);
  assert.doesNotMatch(readiness, /GOOGLE_MAPS_API_KEY/);
});

test("foreground location is cache-first and bounded instead of waiting indefinitely", () => {
  const location = read("athoo-app/services/location.ts");
  const booking = read("athoo-app/app/(customer)/book-service.tsx");
  const providerJob = read("athoo-app/app/(provider)/job-detail.tsx");

  assert.match(location, /getLastKnownPositionAsync/);
  assert.match(location, /LOCATION_CACHE_KEY/);
  assert.match(location, /Location\.Accuracy\.Balanced/);
  assert.match(location, /watchPositionAsync/);
  assert.match(location, /LOCATION_TIMEOUT/);
  assert.match(booking, /getFastForegroundLocation/);
  assert.match(providerJob, /getFastForegroundLocation/);
  assert.match(providerJob, /OpenStreetMapPreview/);
});
