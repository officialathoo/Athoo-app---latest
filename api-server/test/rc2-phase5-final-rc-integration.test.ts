import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "../..");
const read = (relative: string) => fs.readFileSync(path.join(root, relative), "utf8").replace(/\r\n?/g, "\n");

test("authentication OTP delivery is provider-neutral, configurable, and production observable", () => {
  const delivery = read("api-server/src/lib/otpDelivery.ts");
  const auth = read("api-server/src/routes/auth.ts");
  const validator = read("scripts/tools/validate-environment.mjs");
  const health = read("api-server/src/routes/health.ts");

  assert.match(delivery, /export type OtpDeliveryChannel = "whatsapp_cloud" \| "email" \| "http_sms"/);
  assert.match(delivery, /OTP_DELIVERY_CHANNELS/);
  assert.match(delivery, /OTP_DELIVERY_MODE/);
  assert.match(delivery, /WHATSAPP_GRAPH_BASE_URL/);
  assert.match(delivery, /SMS_HTTP_ENDPOINT/);
  assert.match(delivery, /deliverEmailNow/);
  assert.match(delivery, /registration_otp/);
  assert.doesNotMatch(delivery, /args\.purpose === "registration"[\s\S]{0,80}"email_verification"/);
  assert.match(delivery, /args\.purpose === "registration" \? channel !== "email"/);
  assert.match(delivery, /first_success/);
  assert.match(auth, /existingUser\?\.emailVerified \? existingUser\.email : null/);
  assert.match(auth, /deliverAuthenticationOtp/);
  assert.doesNotMatch(auth, /graph\.facebook\.com/);
  assert.match(validator, /No configured production OTP delivery channel is available/);
  assert.match(validator, /No phone-bound OTP channel is configured/);
  assert.match(delivery, /phoneRegistrationConfigured/);
  assert.match(health, /getOtpDeliveryConfigurationStatus/);
});

test("health responses expose a safe release identity and deployment readiness", () => {
  const identity = read("api-server/src/lib/releaseIdentity.ts");
  const health = read("api-server/src/routes/health.ts");
  const app = read("api-server/src/app.ts");
  const storage = read("api-server/src/lib/storageProvider.ts");

  assert.match(identity, /RELEASE_COMMIT_SHA/);
  assert.match(identity, /RENDER_GIT_COMMIT/);
  assert.match(identity, /RELEASE_VERSION/);
  assert.match(identity, /commitSha/);
  assert.doesNotMatch(identity, /SECRET|PASSWORD|TOKEN/);
  assert.match(health, /release: getReleaseIdentity\(\)/);
  assert.match(health, /storage: getStorageConfigurationStatus\(\)/);
  assert.match(app, /release: getReleaseIdentity\(\)/);
  assert.match(storage, /getStorageConfigurationStatus/);
});

test("connected verification proves release identity, storage, OTP, maps, email, and CORS", () => {
  const verifier = read("scripts/tools/connected-runtime-verify.mjs");
  assert.match(verifier, /CONNECTED_EXPECTED_RELEASE_VERSION/);
  assert.match(verifier, /CONNECTED_EXPECTED_COMMIT_SHA/);
  assert.match(verifier, /CONNECTED_ADMIN_ORIGIN/);
  assert.match(verifier, /deepChecks\.storage\?\.configured/);
  assert.match(verifier, /deepChecks\.otpDelivery\?\.configured/);
  assert.match(verifier, /phoneRegistrationConfigured/);
  assert.match(verifier, /CONNECTED_OTP_TEST_PHONE/);
  assert.match(verifier, /Production OTP response exposed the verification code/);
  assert.match(verifier, /api: redact\(apiRelease\)/);
  assert.match(verifier, /admin: redact\(adminRelease\)/);
});

test("release governance requires real Android, iOS, cross-role, theme, and sound evidence", () => {
  const packageJson = JSON.parse(read("package.json"));
  const checklist = JSON.parse(read("docs/qa/device-acceptance-checklist.json"));
  const deviceValidator = read("scripts/tools/validate-device-evidence.mjs");
  const decision = read("scripts/tools/rc2-decision.mjs");
  const ci = read(".github/workflows/ci.yml");
  const connectedWorkflow = read(".github/workflows/connected-runtime.yml");

  assert.ok(checklist.platforms.android.includes("dark-theme-all-primary-flows"));
  assert.ok(checklist.platforms.ios.includes("push-notification-tap-from-killed-state"));
  assert.ok(checklist.crossRole.includes("email-verification-and-welcome"));
  assert.match(deviceValidator, /artifactSha256/);
  assert.match(deviceValidator, /releaseCommitSha/);
  assert.match(deviceValidator, /sourceCommitSha must match releaseCommitSha/);
  assert.match(deviceValidator, /buildId must match/);
  assert.match(decision, /notificationSoundMatrix/);
  assert.match(decision, /waivableChecks = new Set\(\["databaseRecoveryRehearsal"\]\)/);
  assert.match(decision, /this release check cannot be waived/);
  assert.match(decision, /openP0Defects/);
  assert.equal(packageJson.scripts["device:evidence:validate"], "node ./scripts/tools/validate-device-evidence.mjs");
  assert.equal(packageJson.scripts["rc2:decision"], "node ./scripts/tools/rc2-decision.mjs");
  assert.match(ci, /release:verify:code/);
  assert.match(ci, /pnpm\/action-setup@v6/);
  assert.ok(ci.indexOf("pnpm/action-setup@v6") < ci.indexOf("cache: pnpm"), "pnpm must be installed before setup-node resolves the pnpm cache");
  assert.match(connectedWorkflow, /runtime:verify:connected/);
  assert.match(connectedWorkflow, /pnpm\/action-setup@v6/);
  assert.match(connectedWorkflow, /package-manager-cache: false/);
  assert.match(connectedWorkflow, /upload-artifact@v4/);
});

test("production configuration documents portable OTP adapters and release identity", () => {
  const env = read(".env.production.example");
  const render = read("render.yaml");
  assert.match(env, /RELEASE_VERSION=REPLACE_WITH_RELEASE_VERSION/);
  assert.match(render, /- key: RELEASE_VERSION\n\s+sync: false/);
  assert.match(env, /OTP_DELIVERY_CHANNELS=whatsapp_cloud,email/);
  assert.match(env, /OTP_DELIVERY_MODE=first_success/);
  assert.match(env, /WHATSAPP_GRAPH_BASE_URL=https:\/\/graph\.facebook\.com/);
  assert.match(env, /SMS_PROVIDER=disabled/);
  assert.match(render, /RELEASE_SERVICE_NAME/);
  assert.match(render, /OTP_DELIVERY_CHANNELS/);
  assert.match(render, /SMS_HTTP_ENDPOINT/);
});
