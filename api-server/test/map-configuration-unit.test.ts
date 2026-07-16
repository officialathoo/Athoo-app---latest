import assert from "node:assert/strict";
import test from "node:test";
import { buildMapTileUpstreamUrl, getMapConfigurationStatus, getMapProviderConfiguration } from "../src/lib/mapConfiguration.ts";

const KEYS = [
  "NODE_ENV",
  "MAP_TILE_UPSTREAM_URL",
  "MAP_TILE_API_KEY",
  "MAP_TILE_PROVIDER_NAME",
  "MAP_TILE_ALLOW_OSM_DEVELOPMENT",
  "MAP_PROVIDER",
  "MAP_TILE_PROVIDER",
  "MAP_SEARCH_PROVIDER",
  "MAP_REVERSE_PROVIDER",
  "MAP_DIRECTIONS_PROVIDER",
  "MAP_PROVIDER_FALLBACK_ENABLED",
  "MAPBOX_ACCESS_TOKEN",
  "MAPBOX_STYLE_OWNER",
  "MAPBOX_STYLE_ID",
  "MAPBOX_TILE_SIZE",
  "MAPBOX_TILE_SCALE",
  "MAPBOX_GEOCODING_PERMANENT",
] as const;

function withEnvironment(values: Partial<Record<(typeof KEYS)[number], string | undefined>>, run: () => void): void {
  const before = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));
  try {
    for (const key of KEYS) {
      const value = values[key];
      if (value == null) delete process.env[key];
      else process.env[key] = value;
    }
    run();
  } finally {
    for (const key of KEYS) {
      const value = before[key];
      if (value == null) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("production refuses missing and direct volunteer OSM tile configuration", () => {
  withEnvironment({ NODE_ENV: "production" }, () => {
    const status = getMapConfigurationStatus();
    assert.equal(status.configured, false);
    assert.match(status.error || "", /required in production/);
  });

  withEnvironment({
    NODE_ENV: "production",
    MAP_TILE_UPSTREAM_URL: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
  }, () => {
    const status = getMapConfigurationStatus();
    assert.equal(status.configured, false);
    assert.equal(status.productionSafe, false);
    assert.match(status.error || "", /development-only/);
  });
});

test("configured provider URL is validated and provider key remains server-side", () => {
  withEnvironment({
    NODE_ENV: "production",
    MAP_TILE_UPSTREAM_URL: "https://maps.example.test/tiles/{z}/{x}/{y}.png?key={apiKey}",
    MAP_TILE_API_KEY: "secret key/value",
    MAP_TILE_PROVIDER_NAME: "Example Maps",
  }, () => {
    const status = getMapConfigurationStatus();
    assert.equal(status.configured, true);
    assert.equal(status.provider, "Example Maps");
    assert.equal(status.productionSafe, true);
    assert.equal(
      buildMapTileUpstreamUrl(12, 2781, 1683),
      "https://maps.example.test/tiles/12/2781/1683.png?key=secret%20key%2Fvalue",
    );
  });
});

test("development fallback remains available without becoming production configuration", () => {
  withEnvironment({ NODE_ENV: "development" }, () => {
    const status = getMapConfigurationStatus();
    assert.equal(status.configured, true);
    assert.equal(status.source, "development-fallback");
  });
});


test("Mapbox can be selected entirely through deployment configuration", () => {
  withEnvironment({
    NODE_ENV: "production",
    MAP_PROVIDER: "mapbox",
    MAPBOX_ACCESS_TOKEN: "pk.test-token",
    MAPBOX_STYLE_OWNER: "mapbox",
    MAPBOX_STYLE_ID: "streets-v12",
    MAPBOX_TILE_SIZE: "512",
    MAPBOX_GEOCODING_PERMANENT: "false",
  }, () => {
    const provider = getMapProviderConfiguration();
    const status = getMapConfigurationStatus();
    assert.equal(provider.tileProvider, "mapbox");
    assert.equal(provider.searchProvider, "mapbox");
    assert.equal(provider.reverseProvider, "mapbox");
    assert.equal(provider.directionsProvider, "mapbox");
    assert.equal(status.configured, true);
    assert.equal(status.provider, "Mapbox");
    assert.equal(status.geocodingCacheable, false);
    assert.equal(
      buildMapTileUpstreamUrl(6, 44, 26),
      "https://api.mapbox.com/styles/v1/mapbox/streets-v12/tiles/512/6/44/26?access_token=pk.test-token",
    );
  });
});

test("Mapbox services fail closed when the token is missing", () => {
  withEnvironment({ NODE_ENV: "production", MAP_PROVIDER: "mapbox" }, () => {
    const status = getMapConfigurationStatus();
    assert.equal(status.configured, false);
    assert.match(status.error || "", /MAPBOX_ACCESS_TOKEN/);
  });
});
