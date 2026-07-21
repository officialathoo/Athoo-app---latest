import assert from "node:assert/strict";
import test from "node:test";
import { buildMapTileUpstreamCandidates, buildMapTileUpstreamUrl, getMapConfigurationStatus, getMapProviderConfiguration } from "../src/lib/mapConfiguration.ts";

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
  "TOMTOM_API_KEY",
  "TOMTOM_BASE_URL",
  "TOMTOM_COUNTRY_SET",
  "TOMTOM_MAP_LANGUAGE",
  "TOMTOM_MAP_LAYER",
  "TOMTOM_MAP_STYLE",
  "TOMTOM_MAP_VIEW",
  "TOMTOM_TILE_SIZE",
  "TOMTOM_RASTER_API",
  "TOMTOM_ORBIS_STYLE",
  "MAP_CUSTOM_PROVIDER_ID",
  "MAP_CUSTOM_TILE_SIZE",
  "MAP_CUSTOM_API_KEY",
  "MAP_CUSTOM_TILE_URL_TEMPLATE",
  "MAP_CUSTOM_SEARCH_URL_TEMPLATE",
  "MAP_CUSTOM_REVERSE_URL_TEMPLATE",
  "MAP_CUSTOM_DIRECTIONS_URL_TEMPLATE",
  "MAP_CUSTOM_GEOCODING_CACHEABLE",
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
    assert.equal(status.tileSize, 512);
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


test("TomTom can provide tiles, search, reverse geocoding, and directions through configuration", () => {
  withEnvironment({
    NODE_ENV: "production",
    MAP_PROVIDER: "tomtom",
    TOMTOM_API_KEY: "tomtom-test-key",
    TOMTOM_BASE_URL: "https://api.tomtom.com",
    TOMTOM_MAP_LAYER: "basic",
    TOMTOM_MAP_STYLE: "main",
    TOMTOM_MAP_VIEW: "Unified",
    TOMTOM_TILE_SIZE: "256",
  }, () => {
    const provider = getMapProviderConfiguration();
    const status = getMapConfigurationStatus();
    assert.equal(provider.tileProvider, "tomtom");
    assert.equal(provider.searchProvider, "tomtom");
    assert.equal(provider.reverseProvider, "tomtom");
    assert.equal(provider.directionsProvider, "tomtom");
    assert.equal(status.configured, true);
    assert.equal(status.provider, "TomTom");
    assert.equal(status.tileSize, 256);
    assert.equal(status.tomtomConfigured, true);
    assert.equal(
      buildMapTileUpstreamUrl(10, 720, 410),
      "https://api.tomtom.com/maps/orbis/display/raster/tile/10/720/410?apiVersion=2&style=street-light&tileSize=256&geopoliticalView=Unified&key=tomtom-test-key",
    );
  });
});

test("TomTom exposes an ordered alternate raster endpoint for blank-tile recovery", () => {
  withEnvironment({
    NODE_ENV: "production",
    MAP_PROVIDER: "tomtom",
    TOMTOM_API_KEY: "tomtom-test-key",
    TOMTOM_RASTER_API: "legacy-v1",
  }, () => {
    const candidates = buildMapTileUpstreamCandidates(15, 23032, 13124);
    assert.equal(candidates.length, 2);
    assert.equal(candidates[0]?.id, "tomtom-legacy-v1");
    assert.match(candidates[0]?.url || "", /\/map\/1\/tile\/basic\/main\/15\/23032\/13124\.png/);
    assert.equal(candidates[1]?.id, "tomtom-orbis-v2");
    assert.match(candidates[1]?.url || "", /\/maps\/orbis\/display\/raster\/tile\/15\/23032\/13124/);
  });
});

test("explicit tile upstream remains first while retaining TomTom recovery candidates", () => {
  withEnvironment({
    NODE_ENV: "production",
    MAP_PROVIDER: "tomtom",
    TOMTOM_API_KEY: "tomtom-test-key",
    MAP_TILE_UPSTREAM_URL: "https://tiles.example.test/{z}/{x}/{y}.png?key={apiKey}",
  }, () => {
    const candidates = buildMapTileUpstreamCandidates(9, 365, 211);
    assert.equal(candidates[0]?.id, "configured-upstream");
    assert.equal(candidates[0]?.url, "https://tiles.example.test/9/365/211.png?key=tomtom-test-key");
    assert.ok(candidates.some((candidate) => candidate.id === "tomtom-orbis-v2"));
  });
});

test("TomTom fails closed when its server-side key is missing", () => {
  withEnvironment({ NODE_ENV: "production", MAP_PROVIDER: "tomtom" }, () => {
    const status = getMapConfigurationStatus();
    assert.equal(status.configured, false);
    assert.match(status.error || "", /TOMTOM_API_KEY/);
  });
});

test("an unfamiliar provider name selects the declarative custom adapter", () => {
  withEnvironment({
    NODE_ENV: "production",
    MAP_PROVIDER: "futuremaps",
    MAP_CUSTOM_PROVIDER_ID: "futuremaps",
    MAP_CUSTOM_TILE_SIZE: "512",
    MAP_CUSTOM_API_KEY: "custom-key",
    MAP_CUSTOM_TILE_URL_TEMPLATE: "https://tiles.futuremaps.test/{z}/{x}/{y}.png?key={apiKey}",
    MAP_CUSTOM_SEARCH_URL_TEMPLATE: "https://api.futuremaps.test/search?q={query}",
    MAP_CUSTOM_REVERSE_URL_TEMPLATE: "https://api.futuremaps.test/reverse?lat={lat}&lng={lng}",
    MAP_CUSTOM_DIRECTIONS_URL_TEMPLATE: "https://api.futuremaps.test/route?from={originLat},{originLng}&to={destLat},{destLng}",
    MAP_CUSTOM_GEOCODING_CACHEABLE: "true",
  }, () => {
    const provider = getMapProviderConfiguration();
    const status = getMapConfigurationStatus();
    assert.equal(provider.tileProvider, "custom");
    assert.equal(provider.searchProvider, "custom");
    assert.equal(provider.reverseProvider, "custom");
    assert.equal(provider.directionsProvider, "custom");
    assert.equal(status.configured, true);
    assert.equal(status.provider, "futuremaps");
    assert.equal(status.tileSize, 512);
    assert.equal(status.geocodingCacheable, true);
    assert.equal(
      buildMapTileUpstreamUrl(4, 9, 7),
      "https://tiles.futuremaps.test/4/9/7.png?key=custom-key",
    );
  });
});

test("runtime admin overrides switch providers without changing deployment variables", () => {
  withEnvironment({
    NODE_ENV: "production",
    MAP_PROVIDER: "mapbox",
    MAPBOX_ACCESS_TOKEN: "pk.environment-token",
    TOMTOM_API_KEY: "tomtom-runtime-key",
  }, () => {
    const overrides = {
      enabled: true,
      primaryProvider: "tomtom",
      tileProvider: "tomtom",
      searchProvider: "tomtom",
      reverseProvider: "tomtom",
      directionsProvider: "tomtom",
      fallbackEnabled: true,
      searchFallbackProvider: "photon",
      reverseFallbackProvider: "nominatim",
      directionsFallbackProvider: "osrm",
    };
    const provider = getMapProviderConfiguration(overrides);
    const status = getMapConfigurationStatus(overrides);
    assert.equal(provider.primaryProvider, "tomtom");
    assert.equal(provider.tileProvider, "tomtom");
    assert.equal(provider.searchFallbackProvider, "photon");
    assert.equal(provider.reverseFallbackProvider, "nominatim");
    assert.equal(provider.directionsFallbackProvider, "osrm");
    assert.equal(status.configured, true);
    assert.equal(status.provider, "TomTom");
    assert.match(buildMapTileUpstreamUrl(10, 720, 410, overrides), /key=tomtom-runtime-key$/);
  });
});

test("disabled runtime overrides preserve deployment configuration", () => {
  withEnvironment({
    NODE_ENV: "production",
    MAP_PROVIDER: "tomtom",
    TOMTOM_API_KEY: "tomtom-environment-key",
  }, () => {
    const provider = getMapProviderConfiguration({
      enabled: false,
      primaryProvider: "mapbox",
      tileProvider: "mapbox",
    });
    assert.equal(provider.primaryProvider, "tomtom");
    assert.equal(provider.tileProvider, "tomtom");
  });
});
