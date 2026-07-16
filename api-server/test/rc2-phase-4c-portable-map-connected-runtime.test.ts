import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "../..");
const read = (relative: string) => fs.readFileSync(path.join(root, relative), "utf8");

test("map providers are selected through deployment configuration without mobile credentials", () => {
  const configuration = read("api-server/src/lib/mapConfiguration.ts");
  const geo = read("api-server/src/routes/geo.ts");
  const mobile = read("athoo-app/services/maps.ts");
  const env = read(".env.production.example");
  const render = read("render.yaml");
  const app = read("api-server/src/app.ts");

  assert.match(configuration, /MAP_PROVIDER/);
  assert.match(configuration, /MAP_SEARCH_PROVIDER/);
  assert.match(configuration, /MAP_REVERSE_PROVIDER/);
  assert.match(configuration, /MAP_DIRECTIONS_PROVIDER/);
  assert.match(configuration, /MAPBOX_ACCESS_TOKEN/);
  assert.match(configuration, /styles\/v1/);
  assert.match(geo, /mapboxSearch/);
  assert.match(geo, /mapboxReverse/);
  const reverseBlock = geo.slice(geo.indexOf("async function mapboxReverse"), geo.indexOf("async function mapboxDirections"));
  assert.doesNotMatch(reverseBlock, /limit:\s*"1"/);
  assert.match(geo, /mapboxDirections/);
  assert.match(configuration, /search\/geocode\/v6/);
  assert.match(configuration, /directions\/v5/);
  assert.doesNotMatch(mobile, /MAPBOX_ACCESS_TOKEN|api\.mapbox\.com/);
  assert.match(env, /MAP_PROVIDER=mapbox/);
  assert.match(env, /MAP_SEARCH_PROVIDER=photon/);
  assert.match(env, /EXPO_PUBLIC_MAP_TILE_SIZE=512/);
  assert.match(env, /MAPBOX_GEOCODING_PERMANENT=false/);
  assert.match(render, /key: MAPBOX_ACCESS_TOKEN/);
  assert.match(app, /GEO_SEARCH_RATE_LIMIT_MAX/);
  assert.match(app, /GEO_DIRECTIONS_RATE_LIMIT_MAX/);
});

test("temporary Mapbox geocoding is not persisted by API or mobile cache", () => {
  const configuration = read("api-server/src/lib/mapConfiguration.ts");
  const geo = read("api-server/src/routes/geo.ts");
  const mobile = read("athoo-app/services/maps.ts");

  assert.match(configuration, /geocodingPermanent/);
  assert.match(configuration, /geocodingCacheable/);
  assert.match(geo, /cacheable = config\.searchProvider !== "mapbox" \|\| config\.mapbox\.geocodingPermanent/);
  assert.match(geo, /cacheable = config\.reverseProvider !== "mapbox" \|\| config\.mapbox\.geocodingPermanent/);
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
  assert.match(validation, /MAP_TILE_PROVIDER must be custom, mapbox, openstreetmap, or disabled/);
  assert.match(validation, /MAPBOX_ACCESS_TOKEN is required when any map service uses Mapbox/);
  assert.match(validation, /MAP_TILE_PROVIDER=openstreetmap is development-only/);
  assert.match(validation, /MAPBOX_TILE_SIZE must be 256 or 512/);
  assert.match(validation, /EXPO_PUBLIC_MAP_TILE_SIZE must match MAPBOX_TILE_SIZE/);
});
