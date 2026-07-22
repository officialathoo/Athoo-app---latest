import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "../..");
const read = (relative: string) =>
  fs.readFileSync(path.join(root, relative), "utf8").replace(/\r\n?/g, "\n");

test("Phase 29.1A installs a vendor-neutral native interactive map with route and pin controls", () => {
  const packageJson = read("athoo-app/package.json");
  const appConfig = read("athoo-app/app.config.js");
  const nativeMap = read("athoo-app/components/maps/AthooInteractiveMap.tsx");
  const search = read("athoo-app/app/(customer)/(tabs)/search.tsx");

  assert.match(packageJson, /"@maplibre\/maplibre-react-native": "\^11\./);
  assert.match(appConfig, /newArchEnabled: true/);
  assert.match(appConfig, /"@maplibre\/maplibre-react-native"/);

  assert.match(nativeMap, /require\("@maplibre\/maplibre-react-native"\)/);
  assert.match(nativeMap, /isRunningInExpoGo\(\)/);
  assert.match(nativeMap, /androidView="texture"/);
  assert.match(nativeMap, /dragPan/);
  assert.match(nativeMap, /touchZoom/);
  assert.match(nativeMap, /doubleTapZoom/);
  assert.match(nativeMap, /RasterSource/);
  assert.match(nativeMap, /GeoJSONSource/);
  assert.match(nativeMap, /ViewAnnotation/);
  assert.match(nativeMap, /draggable=\{editable\}/);
  assert.match(nativeMap, /onDragEnd=\{handleDragEnd\}/);
  assert.match(nativeMap, /fitBounds/);
  assert.match(nativeMap, /OpenStreetMapPreview/);
  assert.match(nativeMap, /Full pan, pinch zoom and draggable pins require the Athoo native build/);

  assert.match(search, /AthooInteractiveMap/);
  assert.match(search, /providerMarkers=\{mapProviderMarkers\}/);
  assert.match(search, /routePolyline=\{selectedRoute\}/);
  assert.match(search, /getDirections\(/);
  assert.match(search, /route\.source !== "straight_line"/);
  assert.match(search, /setPickedLocationSource\("map"\)/);
  assert.match(search, /setPickedLocationSource\(selection\.source\)/);
  assert.match(search, /liveGpsCoordinate/);

  assert.doesNotMatch(appConfig, /PROVIDER_GOOGLE|googleMapsApiKey/i);
  assert.doesNotMatch(nativeMap, /PROVIDER_GOOGLE|googleMapsApiKey/i);
  assert.doesNotMatch(search, /Ã‚Â±|Ãƒâ€šÃ‚Â±|Ã¢â‚¬Â¦|Ã¢â‚¬Â¢|ÃƒÂ¢Ã¢â€šÂ¬/);
});