import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const seed = fs.readFileSync(new URL("../../scripts/src/seed.ts", import.meta.url), "utf8");
const env = fs.readFileSync(new URL("../../.env.production.example", import.meta.url), "utf8");
const rootPackage = JSON.parse(fs.readFileSync(new URL("../../package.json", import.meta.url), "utf8"));

test("production seed is blocked and requires an explicit strong admin password", () => {
  assert.match(seed, /NODE_ENV === "production"/);
  assert.match(seed, /SEED_ADMIN_PASSWORD/);
  assert.doesNotMatch(seed, /Admin@123/);
});

test("production environment uses durable PostgreSQL jobs without duplicate keys", () => {
  assert.match(env, /^QUEUE_PROVIDER=postgres$/m);
  assert.doesNotMatch(env, /^QUEUE_PROVIDER=memory$/m);
  const keys = env.split(/\r?\n/).map((line) => line.match(/^([A-Z][A-Z0-9_]*)=/)?.[1]).filter(Boolean) as string[];
  assert.equal(new Set(keys).size, keys.length);
});

test("release verification command includes release gate and database verification", () => {
  assert.match(rootPackage.scripts["release:verify"], /release:check/);
  assert.match(rootPackage.scripts["release:verify"], /db:verify/);
});
