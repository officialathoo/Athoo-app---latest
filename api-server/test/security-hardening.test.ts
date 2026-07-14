import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { canReadStorageKey, isPublicStorageKey, safeUploadName, uploadScopeForName, userUploadKey, validateUploadPolicy } from "../src/lib/storageSecurity.ts";

test("sensitive uploads are placed in private owner namespaces", () => {
  assert.equal(uploadScopeForName("cnic-front.jpg"), "private");
  assert.equal(uploadScopeForName("chat-photo.jpg"), "shared");
  const key = userUploadKey("user-1", "CNIC Front.jpg", "id-1", new Date("2026-07-10T00:00:00Z"));
  assert.match(key, /^uploads\/private\/user-1\/2026-07-10\/id-1-/);
  assert.equal(canReadStorageKey(key, { userId: "user-1", role: "provider" }), true);
  assert.equal(canReadStorageKey(key, { userId: "user-2", role: "provider" }), false);
  assert.equal(canReadStorageKey(key, { userId: "admin-1", role: "admin" }), true);
});

test("upload policy requires MIME, size, and matching safe extension", () => {
  assert.equal(validateUploadPolicy({ name: "photo.jpg", size: 1024, contentType: "image/jpeg" }), null);
  assert.match(validateUploadPolicy({ name: "photo.exe", size: 1024, contentType: "image/jpeg" }) || "", /extension/i);
  assert.match(validateUploadPolicy({ name: "photo.jpg", size: 0, contentType: "image/jpeg" }) || "", /positive/i);
  assert.match(validateUploadPolicy({ name: "photo.jpg", size: 1024 }) || "", /contentType/i);
  assert.equal(safeUploadName("../../CNIC front?.jpg"), "CNIC-front-.jpg");
});

test("public storage route cannot expose private object prefixes", () => {
  assert.equal(isPublicStorageKey("public/logo.png"), true);
  assert.equal(isPublicStorageKey("uploads/private/user-1/cnic.jpg"), false);
  const source = readFileSync(new URL("../src/routes/storage.ts", import.meta.url), "utf8");
  assert.match(source, /isPublicStorageKey/);
});

test("storage routes verify active sessions and enforce private ownership", () => {
  const source = readFileSync(new URL("../src/routes/storage.ts", import.meta.url), "utf8");
  assert.match(source, /verifyActiveAccessToken/);
  assert.match(source, /canReadStorageKey/);
  assert.match(source, /Invalid upload destination/);
});

test("production CORS is allowlist-based and upload URL requests are rate limited", () => {
  const source = readFileSync(new URL("../src/app.ts", import.meta.url), "utf8");
  assert.match(source, /CORS origin denied/);
  assert.match(source, /UPLOAD_URL_RATE_LIMIT_MAX/);
  assert.match(source, /X-Request-Id/);
  assert.match(source, /no-referrer/);
});
