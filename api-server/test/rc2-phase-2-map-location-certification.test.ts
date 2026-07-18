import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "../..");
const read = (relative: string) => fs.readFileSync(path.join(root, relative), "utf8");

test("mobile map tiles are served through the Athoo API instead of direct volunteer OSM tiles", () => {
  const preview = read("athoo-app/components/maps/OpenStreetMapPreview.tsx");
  const config = read("athoo-app/app.config.js");
  const runtime = read("athoo-app/config/runtime.ts");
  const backendConfig = read("api-server/src/lib/mapConfiguration.ts");
  const geo = read("api-server/src/routes/geo.ts");

  assert.match(runtime, /EXPO_PUBLIC_MAP_TILE_URL/);
  assert.match(preview, /tileTemplateConfigured/);
  assert.match(preview, /useSettings/);
  assert.doesNotMatch(preview, /DEFAULT_TILE_TEMPLATE = "https:\/\/tile\.openstreetmap\.org/);
  assert.match(config, /api\/geo\/tiles\/\{z\}\/\{x\}\/\{y\}\.png/);
  assert.match(backendConfig, /MAP_TILE_UPSTREAM_URL/);
  assert.match(backendConfig, /Direct openstreetmap\.org tiles are development-only/);
  assert.match(geo, /router\.get\("\/tiles\/:z\/:x\/:y\.png"/);
  assert.match(geo, /Cache-Control/);
  assert.match(geo, /MAP_TILE_PROVIDER_NOT_CONFIGURED/);
  assert.match(geo, /MAP_TILE_RESPONSE_TOO_LARGE/);
});

test("location search returns structured, biased Pakistan results without fake zero coordinates", () => {
  const geo = read("api-server/src/routes/geo.ts");
  const registry = read("api-server/src/maps/providerRegistry.ts");
  const types = read("api-server/src/maps/types.ts");
  const photon = read("api-server/src/maps/providers/photon.ts");
  const tomtom = read("api-server/src/maps/providers/tomtom.ts");
  const maps = read("athoo-app/services/maps.ts");

  assert.match(photon, /countrycodes/);
  assert.match(tomtom, /countrySet/);
  assert.match(geo, /biasLat/);
  assert.match(geo, /distanceKm/);
  assert.match(types, /primary: string/);
  assert.match(types, /secondary: string/);
  assert.match(geo, /getMapOperationProvider\(config\.searchProvider\)/);
  assert.match(registry, /tomtomProvider/);
  assert.match(registry, /customProvider/);
  assert.doesNotMatch(geo, /useAsTyped|lat:\s*0,\s*lng:\s*0/);
  assert.match(maps, /PlaceSuggestion/);
  assert.match(maps, /params:\s*\{[\s\S]*lat: bias\.latitude/);
});

test("InDrive-style location picker supports search, GPS, saved places, recents and map pin selection", () => {
  const picker = read("athoo-app/components/maps/LocationSearchPicker.tsx");
  const booking = read("athoo-app/app/(customer)/book-service.tsx");
  const map = read("athoo-app/app/(customer)/map.tsx");
  const addresses = read("athoo-app/app/(customer)/addresses.tsx");
  const search = read("athoo-app/app/(customer)/(tabs)/search.tsx");

  assert.match(picker, /Search street, area or landmark/);
  assert.match(picker, /Use current location/);
  assert.match(picker, /Choose on map/);
  assert.match(picker, /savedLocations/);
  assert.match(picker, /RECENTS_KEY/);
  assert.match(picker, /getFastForegroundLocation/);
  assert.match(booking, /<LocationSearchPicker/);
  assert.match(map, /<LocationSearchPicker/);
  assert.match(addresses, /<LocationSearchPicker/);
  assert.match(addresses, /<OpenStreetMapPreview/);
  assert.match(search, /<LocationSearchPicker/);
});

test("GPS acquisition uses bounded high-accuracy refinement and cached fallback", () => {
  const location = read("athoo-app/services/location.ts");
  assert.match(location, /getLastKnownPositionAsync/);
  assert.match(location, /watchPositionAsync/);
  assert.match(location, /freshAccuracy/);
  assert.match(location, /requiredAccuracy/);
  assert.match(location, /LOCATION_TIMEOUT/);
  assert.match(location, /betterLocation/);
});

test("map readiness and provider configuration are visible in health and deployment configuration", () => {
  const app = read("api-server/src/app.ts");
  const health = read("api-server/src/routes/health.ts");
  const readiness = read("api-server/src/lib/productionReadiness.ts");
  const render = read("render.yaml");
  const env = read(".env.production.example");

  assert.match(app, /maps: getMapConfigurationStatus\(runtimeMapOverrides\)/);
  assert.match(health, /maps: getMapConfigurationStatus\(runtimeMapOverrides\)/);
  assert.match(app, /getRuntimeMapOverrides/);
  assert.match(health, /getRuntimeMapOverrides/);
  assert.match(readiness, /area: "maps"/);
  assert.match(render, /MAP_TILE_UPSTREAM_URL/);
  assert.match(render, /MAP_TILE_API_KEY/);
  assert.match(env, /MAP_TILE_ALLOW_OSM_DEVELOPMENT=false/);
  assert.match(env, /MAP_CONTACT_EMAIL=support@athoo\.pk/);
});
