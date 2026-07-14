import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "../..");
const read = (relative: string) => fs.readFileSync(path.join(root, relative), "utf8");

test("mobile map preview is OpenStreetMap-based and requires no commercial map key", () => {
  const fallback = read("athoo-app/components/maps/AthooMapFallback.tsx");
  const openMap = read("athoo-app/components/maps/OpenStreetMapPreview.tsx");
  const mobilePackage = read("athoo-app/package.json");
  assert.match(fallback, /OpenStreetMapPreview/);
  assert.match(openMap, /tile\.openstreetmap\.org/);
  assert.match(openMap, /© OpenStreetMap contributors/);
  assert.doesNotMatch(mobilePackage, /react-native-maps/);
});

test("mobile storage stages non-file URIs and cleans temporary upload files", () => {
  const source = read("athoo-app/services/storage.ts");
  assert.match(source, /prepareLocalUploadUri/);
  assert.match(source, /FileSystem\.copyAsync/);
  assert.match(source, /FileSystem\.deleteAsync\(prepared\.uri/);
  assert.match(source, /application\/octet-stream/);
});

test("unsupported HEIC profile photos fail with an actionable message", () => {
  const source = read("athoo-app/services/storage.ts");
  assert.match(source, /HEIC\/HEIF photo cannot be uploaded directly/);
});
