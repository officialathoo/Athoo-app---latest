import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "../..");
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), "utf8");
const json = (relativePath: string) => JSON.parse(read(relativePath));

test("admin build emits a safe non-cacheable release manifest", () => {
  const vite = read("admin-panel/vite.config.ts");
  const vercel = read("vercel.json");
  assert.match(vite, /athoo-admin-release-manifest/);
  assert.match(vite, /fileName:\s*"release\.json"/);
  assert.match(vite, /VERCEL_GIT_COMMIT_SHA/);
  assert.match(vite, /VITE_RELEASE_VERSION/);
  assert.doesNotMatch(vite, /password|apiKey|credential/i);
  assert.match(vercel, /"source": "\/release\.json"/);
  assert.match(vercel, /no-store, max-age=0/);
});

test("API deep health reports queue and cache provider truth", () => {
  const health = read("api-server/src/routes/health.ts");
  assert.match(health, /cache: infrastructure\.cache/);
  assert.match(health, /queue: queueStats\(\)/);
  assert.match(health, /calls: infrastructure\.calls/);
});

test("mobile release provenance is configuration-first and contains no fixed commit", () => {
  const config = read("athoo-app/app.config.js");
  assert.match(config, /EXPO_PUBLIC_RELEASE_VERSION/);
  assert.match(config, /EAS_BUILD_GIT_COMMIT_HASH/);
  assert.match(config, /EAS_BUILD_ID/);
  assert.match(config, /RELEASE_IDENTITY/);
  assert.doesNotMatch(config, /commitSha:\s*["'][a-f0-9]{7,64}["']/i);
});

test("strict connected verifier checks API, admin, Neon-backed infrastructure and providers", () => {
  const verifier = read("scripts/tools/connected-runtime-verify.mjs");
  for (const required of [
    "admin release manifest",
    "API/admin Git commit mismatch",
    "storage provider connectivity",
    "map provider connectivity",
    "email transport verification",
    "authentication OTP delivery",
    "provider broadcast eligibility",
    "Configured cache is not safe",
    "Durable queue worker is not running",
  ]) assert.match(verifier, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(verifier, /schemaVersion: 3/);
  assert.match(verifier, /release-evidence/);
});

test("connected GitHub workflow verifies source, Neon and deployed services from one commit", () => {
  const workflow = read(".github/workflows/connected-runtime.yml");
  assert.match(workflow, /pnpm release:verify:code/);
  assert.match(workflow, /CONNECTED_DATABASE_URL/);
  assert.match(workflow, /pnpm db:status/);
  assert.match(workflow, /pnpm db:verify/);
  assert.match(workflow, /pnpm db:integrity/);
  assert.match(workflow, /CONNECTED_EXPECTED_COMMIT_SHA/);
  assert.match(workflow, /CONNECTED_ADMIN_ORIGIN/);
  assert.match(workflow, /CONNECTED_VERIFY_STORAGE: "true"/);
});

test("current status remains NO-GO until real external evidence exists", () => {
  const status = json("docs/qa/current-release-status.json");
  assert.match(status.candidate, /^ATHOO_PHASE(?:23|24)_/);
  assert.match(status.status, /(?:CONNECTED-VERIFICATION-READY|SOURCE-VERIFIED-CONNECTED-DEVICE-VALIDATION-PENDING|SOURCE-VERIFIED-STRICT-DEVICE-EVIDENCE-PENDING)/);
  assert.equal(status.externalVerification.connectedRuntime, "pending");
  assert.equal(status.externalVerification.androidDevice, "pending");
  assert.equal(status.externalVerification.iosDevice, "pending");
  assert.match(status.launchDecision, /^NO-GO-/);
});


test("runtime map switching updates mobile tile size and attribution without rebuilding", () => {
  const configuration = read("api-server/src/lib/mapConfiguration.ts");
  const publicRoute = read("api-server/src/routes/index.ts");
  const adminRoute = read("api-server/src/routes/admin.ts");
  const settings = read("athoo-app/context/SettingsContext.tsx");
  const mapPreview = read("athoo-app/components/maps/OpenStreetMapPreview.tsx");
  const runtime = read("athoo-app/config/runtime.ts");
  const env = read(".env.production.example");

  assert.match(configuration, /tileSize: 256 \| 512/);
  assert.match(configuration, /MAP_CUSTOM_TILE_SIZE/);
  assert.match(publicRoute, /tileSize: mapStatus\.tileSize/);
  assert.match(publicRoute, /attribution: mapStatus\.attribution/);
  assert.match(publicRoute, /no-cache, max-age=0, must-revalidate/);
  assert.match(adminRoute, /emitToRole\("customer", "admin:event"/);
  assert.match(adminRoute, /emitToRole\("provider", "admin:event"/);
  assert.match(settings, /map: PublicMapSettings/);
  assert.match(settings, /tileSize: runtimeConfig\.maps\.tileSize/);
  assert.match(mapPreview, /const \{ settings \} = useSettings\(\)/);
  assert.match(mapPreview, /createStyles\(theme, tileSize\)/);
  assert.match(mapPreview, /project\(coordinate, resolvedZoom, tileSize\)/);
  assert.match(runtime, /EXPO_PUBLIC_MAP_TILE_URL/);
  assert.match(env, /EXPO_PUBLIC_MAP_ATTRIBUTION=© TomTom \| © OpenStreetMap contributors/);
  assert.match(env, /EXPO_PUBLIC_MAP_TILE_SIZE=256/);
});
