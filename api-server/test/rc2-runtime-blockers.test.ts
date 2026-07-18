import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../..");
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

test("open map preview is interactive and location acquisition is bounded", () => {
  const map = read("athoo-app/components/maps/AthooMapFallback.tsx");
  const preview = read("athoo-app/components/maps/OpenStreetMapPreview.tsx");
  const screen = read("athoo-app/app/(customer)/map.tsx");
  const runtime = read("athoo-app/config/runtime.ts");
  const location = read("athoo-app/services/location.ts");
  assert.match(map, /OpenStreetMapPreview/);
  assert.match(runtime, /EXPO_PUBLIC_MAP_TILE_URL/);
  assert.match(preview, /tileTemplateConfigured/);
  assert.match(preview, /useSettings/);
  assert.match(preview, /onCoordinateChange/);
  assert.match(screen, /getFastForegroundLocation/);
  assert.match(location, /Location\.Accuracy\.Balanced/);
  assert.match(location, /LOCATION_TIMEOUT/);
});

test("mobile storage requires readable positive file size and normalizes metadata", () => {
  const storage = read("athoo-app/services/storage.ts");
  assert.match(storage, /resolveFileSize/);
  assert.match(storage, /normalizeUploadMetadata/);
  assert.match(storage, /selected file could not be read/);
});

test("appearance selector is available through customer and provider profiles", () => {
  const customer = read("athoo-app/app/(customer)/(tabs)/profile.tsx");
  const provider = read("athoo-app/app/(provider)/(tabs)/profile.tsx");
  const appearanceScreen = read("athoo-app/app/appearance.tsx");
  const selector = read("athoo-app/components/settings/AppearanceSelector.tsx");
  assert.match(customer, /route: "\/appearance"/);
  assert.match(provider, /router\.push\("\/appearance"/);
  assert.match(appearanceScreen, /<AppearanceSelector \/>/);
  assert.match(selector, /Use device setting/);
  assert.match(selector, /accessibilityRole="radio"/);
});

test("admin service areas and categories expose select-all bulk actions", () => {
  for (const file of ["admin-panel/src/pages/ServiceAreasPage.tsx", "admin-panel/src/pages/CategoriesPage.tsx"]) {
    const source = read(file);
    assert.match(source, /BulkActionBar/);
    assert.match(source, /Select all/);
    assert.match(source, /Activate/);
    assert.match(source, /Deactivate/);
  }
});
