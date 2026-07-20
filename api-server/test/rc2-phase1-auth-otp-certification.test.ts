import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  accountUnavailableResponse,
  cleanOtpPurpose,
  otpHashMatches,
} from "../src/lib/authOtpPolicy.ts";

const read = (relativePath: string) =>
  fs.readFileSync(new URL(`../../${relativePath}`, import.meta.url), "utf8");

test("OTP purposes are explicit and reject unsupported values", () => {
  assert.equal(cleanOtpPurpose("login"), "login");
  assert.equal(cleanOtpPurpose("registration"), "registration");
  assert.equal(cleanOtpPurpose("password_reset"), "password_reset");
  assert.equal(cleanOtpPurpose("unknown"), null);
  assert.equal(cleanOtpPurpose(undefined), null);
});

test("login account policy blocks missing, mismatched, disabled, blocked, and deleted accounts", () => {
  assert.equal(accountUnavailableResponse(null, "customer")?.code, "ACCOUNT_NOT_FOUND");
  assert.equal(accountUnavailableResponse({ role: "provider" }, "customer")?.code, "ACCOUNT_ROLE_MISMATCH");
  assert.equal(accountUnavailableResponse({ role: "customer", isBlocked: true }, "customer")?.code, "ACCOUNT_BLOCKED");
  assert.equal(accountUnavailableResponse({ role: "customer", isDeactivated: true }, "customer")?.code, "ACCOUNT_DEACTIVATED");
  assert.equal(accountUnavailableResponse({ role: "customer", accountStatus: "pending_deletion" }, "customer")?.code, "ACCOUNT_PENDING_DELETION");
  assert.equal(accountUnavailableResponse({ role: "customer", accountStatus: "deleted" }, "customer")?.code, "ACCOUNT_DELETED");
  assert.equal(accountUnavailableResponse({ role: "customer", accountStatus: "restricted" }, "customer")?.code, "ACCOUNT_UNAVAILABLE");
  assert.equal(accountUnavailableResponse({ role: "customer", accountStatus: "active" }, "customer"), null);
});

test("OTP hash comparison is constant-time compatible and rejects malformed legacy values", () => {
  const hash = "a".repeat(64);
  assert.equal(otpHashMatches(hash, hash), true);
  assert.equal(otpHashMatches(hash, "b".repeat(64)), false);
  assert.equal(otpHashMatches("1234", hash), false);
  assert.equal(otpHashMatches(hash, "not-a-hash"), false);
});

test("auth route validates account before login OTP and scopes OTP by purpose and role", () => {
  const auth = read("api-server/src/routes/auth.ts");
  const accountCheck = auth.indexOf("accountUnavailableResponse(existingUser, expectedRole)");
  const insert = auth.indexOf(".insert(otpsTable)", accountCheck);
  assert.ok(accountCheck >= 0 && insert > accountCheck);
  assert.match(auth, /purpose: rawPurpose/);
  assert.match(auth, /role: rawRole/);
  assert.match(auth, /OTP_RESEND_COOLDOWN_SECONDS/);
  assert.match(auth, /OTP_MAX_ATTEMPTS/);
  assert.match(auth, /registration_verified/);
  assert.match(auth, /REGISTRATION_PHONE_NOT_VERIFIED/);
  assert.match(auth, /deliveryChannel/);
  assert.match(auth, /invalidatedReason/);
  assert.match(auth, /OTP_REQUEST_IN_PROGRESS/);
  assert.match(auth, /postgresErrorCode\(error\) === "23505"/);
  assert.ok(auth.includes("return /^03\\d{9}$/.test(normalized)"));
});

test("mobile login and registration send distinct OTP purposes", () => {
  const login = read("athoo-app/app/auth/login.tsx");
  const registration = read("athoo-app/app/auth/register.tsx");
  const providerRegistration = read("athoo-app/app/auth/provider-register.tsx");
  const client = read("athoo-app/services/api.ts");
  assert.match(login, /sendOtp\(phone\.trim\(\), "login"/);
  assert.match(login, /verifyOtpAndLogin\(phone\.trim\(\), otp\.trim\(\), rememberMe, "login"/);
  assert.match(registration, /sendOtp\(phone\.trim\(\), "registration"/);
  assert.match(registration, /registrationToken/);
  assert.match(providerRegistration, /sendOtp\(form\.phone, "registration", "provider"/);
  assert.match(providerRegistration, /registrationToken/);
  assert.match(client, /body: \{ phone, purpose, role/);
});

test("database migration adds purpose, attempts, and delivery audit fields", () => {
  const migration = read("deploy/migrations/20260715_auth_otp_purpose_delivery_integrity.sql");
  const schema = read("lib/db/src/schema/index.ts");
  const latest = read("lib/db/src/migrations.ts");
  assert.match(migration, /ADD COLUMN IF NOT EXISTS purpose/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS attempts/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS delivery_channel/);
  assert.match(migration, /otps_purpose_check/);
  assert.match(migration, /otps_one_open_purpose_role_uidx/);
  assert.match(migration, /migration_duplicate_cleanup/);
  assert.match(schema, /purpose: text\("purpose"\)/);
  assert.match(schema, /maxAttempts: integer\("max_attempts"\)/);
  assert.match(migration, /20260715|purpose|delivery/);
  assert.match(latest, /20260720_provider_document_expiry_lifecycle\.sql/);
});

test("SMTP configuration is provider-agnostic and exposes safe health status", () => {
  const email = read("api-server/src/lib/email.ts");
  const app = read("api-server/src/app.ts");
  const render = read("render.yaml");
  assert.doesNotMatch(email, /smtp\.gmail\.com/);
  assert.match(email, /EMAIL_PROVIDER/);
  assert.match(email, /SMTP_SECURE/);
  assert.match(email, /getEmailConfigurationStatus/);
  assert.match(email, /verifyEmailTransport/);
  assert.match(app, /email: emailStatus/);
  assert.match(app, /getRuntimeEmailConfigurationStatus/);
  assert.match(render, /EMAIL_PROVIDER[\s\S]*value:\s*"?smtp"?/);
  assert.doesNotMatch(render, /zoho_smtp/);
  assert.match(render, /SMTP_HOST[\s\S]*sync:\s*false/);
  assert.match(render, /OTP_RESEND_COOLDOWN_SECONDS/);
});


test("deployment validation rejects development OTP disclosure and mobile keeps permanent EAS linkage", () => {
  const validator = read("scripts/tools/validate-environment.mjs");
  const appConfig = read("athoo-app/app.config.js");
  const errorPush = validator.indexOf('errors.push("ALLOW_DEV_OTP_RESPONSE must not be true');
  const errorCheck = validator.indexOf("if (errors.length)");
  assert.ok(errorPush >= 0 && errorCheck > errorPush);
  assert.match(appConfig, /readEnv\(\s*"EAS_PROJECT_ID"/);
  assert.doesNotMatch(appConfig, /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i);
  assert.match(appConfig, /eas:\s*\{[\s\S]*projectId:\s*easProjectId/);
});
