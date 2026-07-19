import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "../..");
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), "utf8");
const json = (relativePath: string) => JSON.parse(read(relativePath));

test("foreground activation authoritatively validates replaced sessions", () => {
  const auth = read("athoo-app/context/AuthContext.tsx");
  assert.match(auth, /AppState\.addEventListener\("change"/);
  assert.match(auth, /const sessionValid = await refreshUser\(\);[\s\S]*if \(!sessionValid\) return;[\s\S]*const token = await getToken\(\);[\s\S]*if \(!token\) return;/);
  assert.match(auth, /setUnauthorizedHandler\(\(\) => \{ void expireSession\(\); \}\)/);
  assert.match(auth, /refreshUser: \(\) => Promise<boolean>/);
  assert.match(auth, /Returning false also prevents this foreground cycle/);
});

test("available providers refresh location on activation and a bounded interval", () => {
  const auth = read("athoo-app/context/AuthContext.tsx");
  const runtime = read("athoo-app/config/runtime.ts");
  const config = read("athoo-app/app.config.js");
  const env = read(".env.production.example");
  assert.match(auth, /user\.isAvailable !== false[\s\S]*syncProviderLocation\(true\)/);
  assert.match(auth, /setInterval\(\(\) => \{[\s\S]*AppState\.currentState === "active"[\s\S]*syncProviderLocation\(false\)/);
  assert.match(auth, /runtimeConfig\.location\.providerForegroundSyncIntervalMs/);
  assert.match(runtime, /EXPO_PUBLIC_PROVIDER_LOCATION_SYNC_INTERVAL_MS/);
  assert.match(runtime, /60_000[\s\S]*10 \* 60_000/);
  assert.match(config, /PROVIDER_LOCATION_SYNC_INTERVAL_MS: providerLocationSyncIntervalMs/);
  assert.match(env, /^EXPO_PUBLIC_PROVIDER_LOCATION_SYNC_INTERVAL_MS=120000$/m);
});

test("active release metadata points to Phase 24.8 and remains NO-GO", () => {
  const status = json("docs/qa/current-release-status.json");
  const connected = read("docs/runbooks/FINAL_CONNECTED_DEPLOYMENT.md");
  const launch = read("docs/runbooks/PRODUCTION_LAUNCH_RUNBOOK.md");
  assert.equal(status.candidate, "ATHOO_PHASE24_8_DEVICE_ACCEPTANCE_INTEGRITY_READY.zip");
  assert.equal(status.status, "SOURCE-VERIFIED-STRICT-DEVICE-EVIDENCE-PENDING");
  assert.match(status.launchDecision, /^NO-GO-/);
  assert.equal(status.externalVerification.connectedRuntime, "pending");
  assert.match(connected, /ATHOO_PHASE24_8_DEVICE_ACCEPTANCE_INTEGRITY_READY\.zip/);
  assert.match(launch, /ATHOO_PHASE24_8_DEVICE_ACCEPTANCE_INTEGRITY_READY\.zip/);
});

test("phase notes do not accumulate in the repository root", () => {
  const rootEntries = fs.readdirSync(root);
  assert.equal(rootEntries.some((name) => /^PHASE\d+.*\.md$/i.test(name)), false);
  assert.equal(fs.existsSync(path.join(root, "docs/archive/development-history/phase24-2-communication-reliability.md")), true);
});
