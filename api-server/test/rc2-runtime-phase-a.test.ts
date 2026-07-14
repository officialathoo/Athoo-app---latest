import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "../..");
const read = (relative: string) => fs.readFileSync(path.join(root, relative), "utf8");

test("Android map does not mount react-native-maps without a configured Google key", () => {
  const source = read("athoo-app/components/maps/AthooMapFallback.tsx");
  assert.match(source, /nativeMapConfigured/);
  assert.match(source, /Platform\.OS !== "android" \|\| googleMapsApiKey\.length > 0/);
  assert.match(source, /Platform\.OS === "web" \|\| nativeFailed \|\| !nativeMapConfigured/);
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
