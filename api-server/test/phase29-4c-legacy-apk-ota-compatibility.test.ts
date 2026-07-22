import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "../..");
const read = (relative: string) =>
  fs.readFileSync(path.join(root, relative), "utf8").replace(/\r\n?/g, "\n");
const json = (relative: string) => JSON.parse(read(relative));

test("Phase 29.5 keeps the defensive map fallback without treating it as native compatibility", () => {
  const nativeMap = read("athoo-app/components/maps/AthooInteractiveMap.tsx");

  assert.match(nativeMap, /function resolveNativeMapLibre\(\): any \| null/);
  assert.match(nativeMap, /try \{\s+const candidate = require\("@maplibre\/maplibre-react-native"\)/s);
  assert.match(nativeMap, /catch \{\s+cachedNativeMapLibre = null;/s);
  assert.match(nativeMap, /class NativeMapErrorBoundary extends Component/);
  assert.match(nativeMap, /static getDerivedStateFromError/);
  assert.match(nativeMap, /this\.state\.failed \? this\.props\.fallback : this\.props\.children/);
  assert.match(nativeMap, /<NativeMapErrorBoundary fallback=\{fallbackMap\}>/);
  assert.match(nativeMap, /return fallbackMap;/);
  assert.match(nativeMap, /compatible map preview/);
});

test("Phase 29.5 isolates MapLibre native builds from legacy runtime 1.0.0", () => {
  const appConfig = read("athoo-app/app.config.js");
  const eas = json("eas.json");
  const mobilePackage = json("athoo-app/package.json");

  assert.match(
    appConfig,
    /const appVersion = readEnv\(\s*"APP_VERSION",\s*"1\.1\.0",\s*\);/s,
  );
  assert.match(
    appConfig,
    /runtimeVersion:\s*\{\s*policy:\s*"appVersion",?\s*\}/s,
  );
  assert.equal(eas.build.preview.env.APP_VERSION, "1.1.0");
  assert.equal(eas.build.preview.env.EXPO_PUBLIC_RELEASE_VERSION, "1.1.0");
  assert.equal(eas.build.preview.autoIncrement, true);
  assert.equal(
    mobilePackage.dependencies["@maplibre/maplibre-react-native"],
    "^11.3.6",
  );
  assert.match(appConfig, /"@maplibre\/maplibre-react-native"/);
  assert.doesNotMatch(
    appConfig,
    /const appVersion = readEnv\(\s*"APP_VERSION",\s*"1\.0\.0",/s,
  );
});
