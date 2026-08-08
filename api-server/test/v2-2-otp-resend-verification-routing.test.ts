import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");

function source(rel: string): string {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

test("authenticated user can open email verification from profile", () => {
  const layout = source("athoo-app/app/_layout.tsx");
  const preferences = source("athoo-app/app/email-preferences.tsx");

  assert.ok(layout.includes('pathname === "/auth/email-verification"'));
  assert.ok(preferences.includes("Verify Email Now"));
});

test("email verification has send and resend cooldown UX", () => {
  const text = source("athoo-app/app/auth/email-verification.tsx");

  assert.ok(text.includes("Send verification code"));
  assert.ok(text.includes("Resend verification email"));
  assert.ok(text.includes("resendIn"));
});

test("forgot password has expiry and resend UX", () => {
  const mobile = source("athoo-app/app/auth/forgot-password.tsx");
  const backend = source("api-server/src/routes/auth.ts");

  assert.ok(mobile.includes("otpExpiresIn"));
  assert.ok(mobile.includes("otpResendIn"));
  assert.ok(mobile.includes("Resend OTP"));
  assert.ok(backend.includes("let shouldIssueOtp = Boolean(user);"));
  assert.ok(backend.includes("resendAfterSeconds: OTP_RESEND_COOLDOWN_SECONDS"));
});

test("account action OTP has expiry and resend cooldown", () => {
  const text = source("athoo-app/components/screens/AccountActionVerificationModal.tsx");

  assert.ok(text.includes("const [expiresIn, setExpiresIn]"));
  assert.ok(text.includes("const [resendIn, setResendIn]"));
  assert.ok(text.includes('tr("Resend in {{seconds}}s"'));
  assert.ok(text.includes("code.length !== 6 || expiresIn === 0"));
  assert.ok(text.includes('setError(tr("Code expired. Request a new OTP."))'));
});

test("all active OTP interfaces expose resend behavior", () => {
  assert.ok(source("athoo-app/app/auth/login.tsx").includes("Resend OTP"));
  assert.ok(source("athoo-app/app/auth/register.tsx").includes("Resend OTP"));
  assert.ok(source("athoo-app/app/auth/provider-register.tsx").includes("onResend="));
  assert.ok(source("athoo-app/components/ui/OtpModal.tsx").includes("Resend OTP"));
  assert.ok(source("athoo-app/app/auth/email-verification.tsx").includes("Resend verification email"));
  assert.ok(source("athoo-app/app/auth/forgot-password.tsx").includes("Resend OTP"));
  assert.ok(source("athoo-app/components/screens/AccountActionVerificationModal.tsx").includes("resendIn"));
});

test("email OTP login rejects unknown and unverified email accounts", () => {
  const backend = source("api-server/src/routes/auth.ts");

  assert.ok(backend.includes("ACCOUNT_NOT_FOUND"));
  assert.ok(backend.includes("EMAIL_NOT_VERIFIED"));
  assert.ok(backend.includes('purpose: "login"'));
});

test("password recovery preserves account enumeration protection", () => {
  const backend = source("api-server/src/routes/auth.ts");

  assert.ok(backend.includes("eq(usersTable.emailVerified, true)"));
  assert.ok(backend.includes("If an account matches those details, a reset OTP has been sent."));
});


test("public email verification proves mailbox ownership without creating a session", () => {
  const backend = source("api-server/src/routes/auth.ts");

  const sendStart = backend.indexOf('router.post("/email/verification/send"');
  const verifyStart = backend.indexOf('router.post("/email/verification/verify"');
  const loginVerifyStart = backend.indexOf('router.post("/email/verify-otp"', verifyStart);

  assert.ok(sendStart >= 0);
  assert.ok(verifyStart > sendStart);
  assert.ok(loginVerifyStart > verifyStart);

  const verifySegment = backend.slice(verifyStart, loginVerifyStart);

  assert.ok(verifySegment.includes('purpose: "verify_email"'));
  assert.ok(verifySegment.includes("emailVerified: true"));
  assert.equal(verifySegment.includes("issueSession("), false);
});

test("public email verification send and verify endpoints are rate limited", () => {
  const app = source("api-server/src/app.ts");

  assert.ok(app.includes('/api/auth/email/verification/send'));
  assert.ok(app.includes('/api/auth/email/verification/verify'));
  assert.ok(app.includes("public-email-verification-send"));
  assert.ok(app.includes("public-email-verification-verify"));
});

test("unverified email OTP login offers Verify Email Now", () => {
  const login = source("athoo-app/app/auth/login.tsx");
  const authContext = source("athoo-app/context/AuthContext.tsx");

  assert.ok(login.includes("EMAIL_NOT_VERIFIED"));
  assert.ok(login.includes("Verify Email Now"));
  assert.ok(login.includes('mode: "login"'));
  assert.ok(authContext.includes("errorCode"));
});

test("email verification screen supports unauthenticated login verification", () => {
  const screen = source("athoo-app/app/auth/email-verification.tsx");
  const client = source("athoo-app/services/api.ts");

  assert.ok(screen.includes("publicLoginVerification"));
  assert.ok(screen.includes("sendPublicEmailVerification"));
  assert.ok(screen.includes("verifyPublicEmailVerification"));
  assert.ok(client.includes("/api/auth/email/verification/send"));
  assert.ok(client.includes("/api/auth/email/verification/verify"));
});
