import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const rootPackage = readFileSync(new URL("../../package.json", import.meta.url), "utf8");
const scriptsPackage = readFileSync(new URL("../../scripts/package.json", import.meta.url), "utf8");
const bootstrap = readFileSync(new URL("../../scripts/src/bootstrap-admin.ts", import.meta.url), "utf8");
const envValidator = readFileSync(new URL("../../scripts/tools/validate-environment.mjs", import.meta.url), "utf8");
const smoke = readFileSync(new URL("../../scripts/tools/smoke-test.mjs", import.meta.url), "utf8");

test("first administrator bootstrap is explicit, locked, and one-time", () => {
  assert.match(scriptsPackage, /bootstrap:admin/);
  assert.match(bootstrap, /CREATE_FIRST_ADMIN/);
  assert.match(bootstrap, /pg_advisory_lock/);
  assert.match(bootstrap, /COUNT\(\*\).*role = 'admin'/s);
  assert.match(bootstrap, /bcrypt\.hash/);
});

test("staging environment validation rejects unsafe production values", () => {
  assert.match(rootPackage, /env:validate/);
  assert.match(envValidator, /CORS_ORIGINS must not contain wildcard/);
  assert.match(envValidator, /STORAGE_PROVIDER=local is not allowed/);
  assert.match(envValidator, /non-placeholder secret of at least 32 characters/);
});

test("post-deployment smoke test covers liveness, readiness, and public data", () => {
  assert.match(rootPackage, /smoke:test/);
  assert.match(smoke, /\/api\/healthz/);
  assert.match(smoke, /\/api\/healthz\/deep/);
  assert.match(smoke, /\/api\/categories/);
});
