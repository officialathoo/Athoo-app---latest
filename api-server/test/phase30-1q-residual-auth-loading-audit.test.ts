import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "../..");

const read = (relative: string) =>
  fs.readFileSync(path.join(root, relative), "utf8").replace(/\r\n?/g, "\n");

test("Phase 30.1Q prevents duplicate provider-registration OTP sends", () => {
  const screen = read("athoo-app/app/auth/provider-register.tsx");

  assert.match(screen, /const \[sendingOtp, setSendingOtp\] = useState\(false\)/);
  assert.match(screen, /if \(sendingOtp\) return/);
  assert.match(screen, /setSendingOtp\(true\)/);
  assert.match(screen, /setSendingOtp\(false\)/);
  assert.match(screen, /disabled=\{sendingOtp\}/);
  assert.match(screen, /provider-registration-send-otp/);
  assert.match(screen, /sendingOtp \? tr\("Sending\.\.\."\)/);
  assert.match(screen, /sendOtp\(/);
});

test("Phase 30.1Q confirms email-verification loading is already mutation-scoped", () => {
  const screen = read("athoo-app/app/auth/email-verification.tsx");

  assert.match(screen, /const \[loading, setLoading\] = useState\(false\)/);
  assert.match(screen, /const sendCode = async \(\) =>/);
  assert.match(screen, /const verify = async \(\) =>/);
  assert.match(screen, /loading=\{loading\}/);
  assert.match(screen, /disabled=\{expiresIn === 0 \|\| !user\?\.email\}/);
  assert.match(screen, /disabled=\{loading \|\| resendIn > 0 \|\| !user\?\.email\}/);
});

test("Phase 30.1Q confirms forgot-password loading is already mutation-scoped", () => {
  const screen = read("athoo-app/app/auth/forgot-password.tsx");

  assert.match(screen, /const \[loading, setLoading\] = useState\(false\)/);
  assert.match(screen, /const handleSendOtp = async \(\) =>/);
  assert.match(screen, /const handleVerifyOtp = async \(\) =>/);
  assert.match(screen, /const handleResetPassword = async \(\) =>/);
  assert.match(screen, /disabled=\{loading\}/);
  assert.match(screen, /loading \? tr\("Sending\.\.\."\)/);
  assert.match(screen, /loading \? tr\("Verifying\.\.\."\)/);
});

test("Phase 30.1Q confirms root layout boot loading is intentional and bounded", () => {
  const screen = read("athoo-app/app/_layout.tsx");

  assert.match(screen, /if \(!languageReady\) \{\s*return <AthooLoader \/>/);
  assert.match(screen, /if \(!ready\) \{\s*return <AthooLoader \/>/);
  assert.match(screen, /if \(!fontsLoaded && !fontError\) \{\s*return <AthooLoader \/>/);
  assert.match(screen, /SplashScreen\.hideAsync\(\)/);
  assert.match(screen, /ApiConfigurationScreen/);
  assert.match(screen, /SessionRouteGuard/);
});