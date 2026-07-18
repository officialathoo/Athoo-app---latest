import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const infrastructure = readFileSync(new URL("../src/lib/infrastructureConfiguration.ts", import.meta.url), "utf8");
const queue = readFileSync(new URL("../src/lib/queue.ts", import.meta.url), "utf8");
const admin = readFileSync(new URL("../src/routes/admin.ts", import.meta.url), "utf8");
const app = readFileSync(new URL("../src/app.ts", import.meta.url), "utf8");
const geo = readFileSync(new URL("../src/routes/geo.ts", import.meta.url), "utf8");
const adminLib = readFileSync(new URL("../src/lib/admin.ts", import.meta.url), "utf8");

test("queue configuration supports postgres and fails closed", () => {
  assert.match(infrastructure, /type QueueProvider = "postgres" \| "disabled"/);
  assert.match(infrastructure, /Unsupported queue provider/);
  assert.match(infrastructure, /drainRequired: true/);
});

test("cache configuration is honest and Redis fails closed until implemented", () => {
  assert.match(infrastructure, /type CacheProvider = "memory" \| "redis" \| "disabled"/);
  assert.match(infrastructure, /no shared Redis cache adapter is installed/);
  assert.match(infrastructure, /adapterImplemented/);
  assert.match(infrastructure, /sharedAcrossInstances = false/);
  assert.match(infrastructure, /horizontalScaleSafe/);
  assert.doesNotMatch(infrastructure, /sharedAcrossInstances:\s*provider === "redis"/);
});

test("memory and disabled cache selectors are connected to active cache consumers", () => {
  assert.match(infrastructure, /export function isInProcessCacheEnabled/);
  assert.match(app, /isInProcessCacheEnabled\(\)/);
  assert.match(geo, /isInProcessCacheEnabled\(\)/);
  assert.match(adminLib, /isInProcessCacheEnabled\(\)/);
});

test("queue worker uses centralized fail-closed configuration", () => {
  assert.match(queue, /getQueueProviderConfiguration/);
  assert.match(queue, /if \(!provider\.configured\)/);
  assert.match(queue, /Queue provider is not configured/);
});

test("admin status exposes restart, drain, and cache scale-safety requirements", () => {
  assert.match(admin, /getInfrastructureProviderStatus/);
  assert.match(admin, /drainRequired: true/);
  assert.match(admin, /horizontalScaleSafe/);
  assert.match(admin, /reservedCacheAdapters: \["redis"\]/);
});
