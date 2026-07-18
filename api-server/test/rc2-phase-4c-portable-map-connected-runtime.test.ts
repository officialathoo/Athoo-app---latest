import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "../..");
const read = (relative: string) => fs.readFileSync(path.join(root, relative), "utf8");

test("map providers are selected through deployment configuration without mobile credentials", () => {
  const configuration = read("api-server/src/lib/mapConfiguration.ts");
  const registry = read("api-server/src/maps/providerRegistry.ts");
  const tomtom = read("api-server/src/maps/providers/tomtom.ts");
  const custom = read("api-server/src/maps/providers/custom.ts");
  const geo = read("api-server/src/routes/geo.ts");
  const mobile = read("athoo-app/services/maps.ts");
  const env = read(".env.production.example");
  const render = read("render.yaml");
  const app = read("api-server/src/app.ts");

  assert.match(configuration, /MAP_PROVIDER/);
  assert.match(configuration, /MAP_SEARCH_PROVIDER/);
  assert.match(configuration, /MAP_REVERSE_PROVIDER/);
  assert.match(configuration, /MAP_DIRECTIONS_PROVIDER/);
  assert.match(configuration, /TOMTOM_API_KEY/);
  assert.match(registry, /tomtomProvider/);
  assert.match(registry, /customProvider/);
  assert.match(tomtom, /search\/2\/search/);
  assert.match(tomtom, /reverseGeocode/);
  assert.match(tomtom, /calculateRoute/);
  assert.match(custom, /MAP_CUSTOM_SEARCH_URL_TEMPLATE/);
  assert.match(geo, /getMapOperationProvider/);
  assert.doesNotMatch(mobile, /TOMTOM_API_KEY|MAPBOX_ACCESS_TOKEN|api\.tomtom\.com|api\.mapbox\.com/);
  assert.match(env, /MAP_PROVIDER=tomtom/);
  assert.match(env, /MAP_SEARCH_PROVIDER=tomtom/);
  assert.match(env, /MAP_CUSTOM_SEARCH_URL_TEMPLATE=/);
  assert.match(render, /key: TOMTOM_API_KEY/);
  assert.match(app, /GEO_SEARCH_RATE_LIMIT_MAX/);
  assert.match(app, /GEO_DIRECTIONS_RATE_LIMIT_MAX/);
});

test("temporary or unapproved geocoding results are not persisted by API or mobile cache", () => {
  const configuration = read("api-server/src/lib/mapConfiguration.ts");
  const geo = read("api-server/src/routes/geo.ts");
  const mobile = read("athoo-app/services/maps.ts");

  assert.match(configuration, /geocodingPermanent/);
  assert.match(configuration, /customGeocodingCacheable/);
  assert.match(configuration, /operationCacheable/);
  assert.match(geo, /const cacheable = status\.searchCacheable/);
  assert.match(geo, /const cacheable = status\.reverseCacheable/);
  assert.match(mobile, /data\.cacheable !== false/);
  assert.match(mobile, /reverse-geocode-cache:v2/);
});

test("connected runtime verifier checks health, maps, authentication, and real email safely", () => {
  const tool = read("scripts/tools/connected-runtime-verify.mjs");
  const pkg = JSON.parse(read("package.json"));

  assert.match(tool, /\/api\/healthz\/deep/);
  assert.match(tool, /\/api\/geo\/tiles/);
  assert.match(tool, /\/api\/geo\/search/);
  assert.match(tool, /\/api\/geo\/reverse/);
  assert.match(tool, /\/api\/geo\/directions/);
  assert.match(tool, /\/api\/admin\/email\/verify-transport/);
  assert.match(tool, /CONNECTED_EMAIL_TEST_TO/);
  assert.match(tool, /redact/);
  assert.match(tool, /contentType\.startsWith\("image\/"\)/);
  assert.match(tool, /CONNECTED_CUSTOMER_ROLE \|\| "customer"/);
  assert.equal(pkg.scripts["runtime:verify:connected"], "node ./scripts/tools/connected-runtime-verify.mjs");
});

test("deployment validation rejects incomplete or unsafe map provider combinations", () => {
  const validation = read("scripts/tools/validate-environment.mjs");
  assert.match(validation, /MAP_TILE_PROVIDER must be custom, mapbox, tomtom, openstreetmap, or disabled/);
  assert.match(validation, /MAPBOX_ACCESS_TOKEN is required when any map service uses Mapbox/);
  assert.match(validation, /TOMTOM_API_KEY is required when any map service uses TomTom/);
  assert.match(validation, /MAP_CUSTOM_SEARCH_URL_TEMPLATE is required when custom search is selected/);
  assert.match(validation, /MAP_TILE_PROVIDER=openstreetmap is development-only/);
  assert.match(validation, /TOMTOM_TILE_SIZE must be 256 or 512/);
  assert.match(validation, /MAP_CUSTOM_TILE_SIZE must be 256 or 512/);
  assert.match(validation, /EXPO_PUBLIC_MAP_TILE_SIZE must be 256 or 512/);
});
