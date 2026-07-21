import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "../..");
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), "utf8");
const json = (relativePath: string) => JSON.parse(read(relativePath));
const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

test("active release documents point only to the authoritative Phase 28.5 candidate", () => {
  const readme = read("README.md");
  const connected = read("docs/runbooks/FINAL_CONNECTED_DEPLOYMENT.md");
  const launch = read("docs/runbooks/PRODUCTION_LAUNCH_RUNBOOK.md");
  const candidate = String(json("docs/qa/current-release-status.json").candidate);
  const candidatePattern = new RegExp(escapeRegex(candidate));
  for (const text of [readme, connected, launch]) {
    assert.doesNotMatch(text, /PHASE14|Phase 14/);
  }
  assert.match(connected, candidatePattern);
  assert.match(launch, candidatePattern);
});

test("EAS identity is portable and release blueprints reject committed project UUIDs", () => {
  const config = read("athoo-app/app.config.js");
  const validator = read("scripts/tools/validate-release-blueprints.mjs");
  assert.match(config, /readEnv\(\s*"EAS_PROJECT_ID"/);
  assert.doesNotMatch(config, /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i);
  assert.match(validator, /hard-coded EAS project UUID is not allowed/);
});

test("production templates explicitly carry operational limits introduced across phases", () => {
  const env = read(".env.production.example");
  const render = read("render.yaml");
  const validator = read("scripts/tools/validate-environment.mjs");
  const keys = [
    "DB_POOL_MAX",
    "QUEUE_CONCURRENCY",
    "QUEUE_STALE_LOCK_MINUTES",
    "BROADCAST_DELIVERY_CONCURRENCY",
    "MAX_UPLOAD_BYTES",
    "SIGNED_UPLOAD_TTL_SECONDS",
    "SIGNED_READ_TTL_SECONDS",
    "MICRO_CACHE_TTL_MS",
    "MAX_CALL_AUDIO_CHUNK_B64",
  ];
  for (const key of keys) {
    assert.match(env, new RegExp(`^${key}=`, "m"));
    assert.match(render, new RegExp(`- key: ${key}(?:\\n|\\r\\n)`));
    assert.match(validator, new RegExp(key));
  }
});

test("cache and queue readiness never advertise adapters that are not active", () => {
  const infrastructure = read("api-server/src/lib/infrastructureConfiguration.ts");
  const queue = read("api-server/src/lib/queue.ts");
  assert.match(infrastructure, /no shared Redis cache adapter is installed/);
  assert.match(infrastructure, /sharedAcrossInstances = false/);
  assert.match(infrastructure, /export function isInProcessCacheEnabled/);
  assert.match(queue, /provider: provider\.provider/);
  assert.match(queue, /durable: provider\.durable/);
});

test("current certification remains honest about external launch gates", () => {
  const status = JSON.parse(read("docs/qa/current-release-status.json"));
  assert.match(status.candidate, /^ATHOO_PHASE(?:23|24|28)_/);
  assert.match(status.status, /(?:CONNECTED-VERIFICATION-READY|SOURCE-VERIFIED-CONNECTED-DEVICE-VALIDATION-PENDING|SOURCE-VERIFIED-STRICT-DEVICE-EVIDENCE-PENDING|SOURCE-HARDENED-LOCAL-VERIFICATION-PENDING|SOURCE-HARDENED-LOCAL-VALIDATION-PASSED)/);
  assert.match(status.launchDecision, /^NO-GO-/);
  assert.equal(status.externalVerification.connectedRuntime, "pending");
  assert.equal(status.externalVerification.androidDevice, "pending");
  assert.equal(status.externalVerification.iosDevice, "pending");
  assert.equal(status.externalVerification.loadAndSecurity, "pending");
});
