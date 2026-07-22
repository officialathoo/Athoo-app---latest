import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const read = (relative: string) => fs.readFileSync(path.join(root, relative), "utf8").replace(/\r\n?/g, "\n");
const json = (relative: string) => JSON.parse(read(relative));

test("production call readiness requires valid TURN URLs and credentials", () => {
  const config = read("api-server/src/lib/callConfiguration.ts");
  const health = read("api-server/src/routes/health.ts");
  const envValidator = read("scripts/tools/validate-environment.mjs");
  assert.match(config, /cloudflareReady \|\| staticConfiguration\.productionReady/);
  assert.match(config, /TURN_USERNAME/);
  assert.match(config, /TURN_CREDENTIAL/);
  assert.match(health, /calls: infrastructure\.calls/);
  assert.match(envValidator, /Production voice calling requires Cloudflare TURN credentials or static TURN_URLS/);
  assert.match(envValidator, /CLOUDFLARE_TURN_KEY_ID/);
  assert.match(envValidator, /CLOUDFLARE_TURN_API_TOKEN/);
});

test("Render production blueprint carries session, TURN, lifecycle, and escalation configuration", () => {
  const render = read("render.yaml");
  for (const key of [
    "JWT_ISSUER", "JWT_AUDIENCE", "TRUST_PROXY", "CLOUDFLARE_TURN_KEY_ID", "CLOUDFLARE_TURN_API_TOKEN",
    "TURN_URLS", "TURN_USERNAME", "TURN_CREDENTIAL",
    "USER_ACTIVITY_WRITE_INTERVAL_MS", "INACTIVITY_SWEEP_MIN_INTERVAL_MS", "INCIDENT_COMMANDER_CONTACT",
    "SUPPORT_ESCALATION_EMAIL",
  ]) assert.match(render, new RegExp(`- key: ${key}`));
  assert.match(render, /RELEASE_VERSION\n\s+sync: false/);
});

test("connected runtime verifies provider broadcast eligibility, policies, admin operations, and calls", () => {
  const connected = read("scripts/tools/connected-runtime-verify.mjs");
  assert.match(connected, /CONNECTED_PROVIDER_IDENTIFIER/);
  assert.match(connected, /provider broadcast eligibility/);
  assert.match(connected, /production call configuration/);
  assert.match(connected, /admin inactive account queue/);
  assert.match(connected, /public policy center/);
  assert.match(connected, /deepChecks\.calls\?\.productionReady === true/);
});

test("device evidence explicitly covers every originally reported critical workflow", () => {
  const checklist = json("docs/qa/device-acceptance-checklist.json");
  for (const platform of ["android", "ios"]) {
    const cases = new Set(checklist.platforms[platform]);
    for (const required of [
      "biometric-session-lock-and-restart", "chat-keyboard-input-visible",
      "chat-unread-badge-and-background-delivery", "provider-rate-and-multiple-services-profile",
      "policy-center-offline-and-accessibility",
    ]) assert.ok(cases.has(required), `${platform} missing ${required}`);
  }
  const cross = new Set(checklist.crossRole);
  for (const required of [
    "customer-job-broadcast-provider-receipt", "two-way-voice-call-cross-network",
    "admin-notification-exact-record-destination", "inactivity-warning-return-and-no-auto-delete",
  ]) assert.ok(cross.has(required), `crossRole missing ${required}`);
});

test("final GO decision has explicit business-critical and operational gates", () => {
  const decision = read("scripts/tools/rc2-decision.mjs");
  const template = json("docs/qa/rc2-evidence-template.json");
  for (const key of [
    "customerJobBroadcast", "chatRealtimeAndUnread", "voiceCallTwoWay", "singleDeviceBiometric",
    "adminDeepLinks", "policyGovernance", "inactivityLifecycleSafety", "legalReview",
    "productionSecretsRotation", "monitoringAndAlerts", "hostingCapacity",
  ]) {
    assert.match(decision, new RegExp(`"${key}"`));
    assert.ok(template.checks[key], `template missing ${key}`);
  }
});

test("release blueprints and runbooks use the authoritative candidate and latest migration", () => {
  const final = read("docs/runbooks/FINAL_CONNECTED_DEPLOYMENT.md");
  const launch = read("docs/runbooks/PRODUCTION_LAUNCH_RUNBOOK.md");
  const packageJson = json("package.json");
  const candidate = String(json("docs/qa/current-release-status.json").candidate);
  const candidatePattern = new RegExp(candidate.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  assert.match(final, candidatePattern);
  assert.match(final, /20260720_release_phase28_professional_workflow_integrity\.sql/);
  assert.match(launch, /Phase 28\.5 strict device-acceptance-integrity candidate/);
  assert.ok(packageJson.scripts["release:blueprints:validate"]);
  assert.match(packageJson.scripts["release:verify:code"], /release:blueprints:validate/);
});
