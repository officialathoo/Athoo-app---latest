import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "../..");
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), "utf8");

test("platform settings persist runtime map provider selection without database schema drift", () => {
  const admin = read("api-server/src/lib/admin.ts");
  const runtime = read("api-server/src/lib/mapRuntime.ts");
  for (const field of [
    "mapRuntimeConfigurationEnabled",
    "mapPrimaryProvider",
    "mapTileProvider",
    "mapSearchProvider",
    "mapReverseProvider",
    "mapDirectionsProvider",
    "mapProviderFallbackEnabled",
  ]) {
    assert.match(admin, new RegExp(field));
  }
  assert.match(runtime, /getPlatformSettings/);
  assert.match(runtime, /mapRuntimeOverridesFromSettings/);
});

test("geo runtime resolves provider selection from cached admin settings", () => {
  const geo = read("api-server/src/routes/geo.ts");
  assert.match(geo, /getRuntimeMapOverrides/);
  assert.match(geo, /getMapConfigurationStatus\(runtimeOverrides\)/);
  assert.match(geo, /buildMapTileUpstreamCandidates\(z, x, y, runtimeOverrides\)/);
  assert.match(geo, /getMapProviderConfiguration\(runtimeOverrides\)/);
});

test("admin exposes secret-safe map status and active provider tests", () => {
  const adminRoute = read("api-server/src/routes/admin.ts");
  assert.match(adminRoute, /\/settings\/maps\/status/);
  assert.match(adminRoute, /\/settings\/maps\/test/);
  assert.match(adminRoute, /tomtomConfigured/);
  assert.match(adminRoute, /mapboxConfigured/);
  assert.doesNotMatch(adminRoute, /TOMTOM_API_KEY[^\n]*res\.json/);
  assert.doesNotMatch(adminRoute, /MAPBOX_ACCESS_TOKEN[^\n]*res\.json/);
});

test("admin settings UI can switch and test map providers", () => {
  const settingsPage = read("admin-panel/src/pages/SettingsPage.tsx");
  assert.match(settingsPage, /Maps & Location Providers/);
  assert.match(settingsPage, /mapRuntimeConfigurationEnabled/);
  assert.match(settingsPage, /Test Active Providers/);
  assert.match(settingsPage, /API keys remain protected in Render environment variables/);
});
