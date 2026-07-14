import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const routes = fs.readFileSync(new URL("../src/routes/storage.ts", import.meta.url), "utf8");
const provider = fs.readFileSync(new URL("../src/lib/storageProvider.ts", import.meta.url), "utf8");
const mobile = fs.readFileSync(new URL("../../athoo-app/services/storage.ts", import.meta.url), "utf8");
const lifecycle = fs.readFileSync(new URL("../src/lib/mediaLifecycle.ts", import.meta.url), "utf8");

test("direct uploads are verified in storage before persistence", () => {
  assert.match(routes, /storage\/uploads\/complete/);
  assert.match(routes, /statObject\(objectPath\)/);
  assert.match(provider, /statObject\(keyOrObjectPath/);
  assert.match(mobile, /confirmUploadedObject\(uploadInstructions\.objectPath, size, metadata\.contentType\)/);
});

test("mobile retries only transient upload failures and preserves professional errors", () => {
  assert.match(mobile, /for \(let attempt = 1; attempt <= 2; attempt\+\+\)/);
  assert.match(mobile, /network\|timeout\|timed out\|failed to fetch/);
  assert.match(mobile, /professionalUploadError/);
});

test("replaced profile media is cleaned only when owner scoped", () => {
  assert.match(lifecycle, /isOwnedUploadObjectPath/);
  assert.match(lifecycle, /deleteObject\(previous\)/);
  assert.match(lifecycle, /previous === next/);
});
