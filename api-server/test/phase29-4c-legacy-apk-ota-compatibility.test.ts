import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "../..");
const read = (relative: string) =>
  fs.readFileSync(path.join(root, relative), "utf8").replace(/\r\n?/g, "\n");

test("Phase 29.4C keeps legacy EAS binaries safe when MapLibre native code is absent", () => {
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

  assert.doesNotMatch(
    nativeMap,
    /Platform\.OS !== "web" && !isRunningInExpoGo\(\)\s+\? require\("@maplibre\/maplibre-react-native"\)/,
  );
  assert.doesNotMatch(nativeMap, /nativeApplicationVersion\s*[!=]==?\s*["']1\.1\.0/);
});