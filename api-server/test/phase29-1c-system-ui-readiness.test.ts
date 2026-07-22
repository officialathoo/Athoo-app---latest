import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "../..");
const read = (relative: string) =>
  fs.readFileSync(path.join(root, relative), "utf8").replace(/\r\n?/g, "\n");

test("Phase 29.1C keeps automatic system appearance enabled in native builds", () => {
  const packageJson = read("athoo-app/package.json");
  const appConfig = read("athoo-app/app.config.js");

  assert.match(packageJson, /"expo-system-ui": "~6\./);
  assert.match(appConfig, /userInterfaceStyle: "automatic"/);
  assert.match(appConfig, /"expo-system-ui"/);
  assert.match(appConfig, /"@maplibre\/maplibre-react-native"/);

  const systemUiIndex = appConfig.indexOf('"expo-system-ui"');
  const mapLibreIndex = appConfig.indexOf('"@maplibre/maplibre-react-native"');
  assert.ok(systemUiIndex >= 0);
  assert.ok(mapLibreIndex >= 0);
  assert.ok(systemUiIndex < mapLibreIndex);
});