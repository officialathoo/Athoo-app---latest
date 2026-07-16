import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../..");
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

test("production OTP success requires a real portable delivery channel", () => {
  const source = read("api-server/src/routes/auth.ts");
  const delivery = read("api-server/src/lib/otpDelivery.ts");
  assert.match(source, /deliverAuthenticationOtp/);
  assert.match(source, /const delivered = otpDelivery\.delivered \|\| isDev/);
  assert.match(source, /if \(!delivered\)/);
  assert.match(source, /OTP_DELIVERY_UNAVAILABLE/);
  assert.match(source, /function hashOtp/);
  assert.match(source, /createHmac\("sha256"/);
  assert.match(source, /code: hashOtp\(normalizedPhone, code, purpose\)/);
  assert.match(source, /invalidatedReason: "delivery_failed"/);
  assert.match(source, /otpsTable\.phone, phone[\s\S]*otpsTable\.purpose, purpose/);
  assert.match(delivery, /OTP_DELIVERY_CHANNELS/);
  assert.match(delivery, /OTP_DELIVERY_MODE/);
  assert.match(delivery, /whatsapp_cloud/);
  assert.match(delivery, /http_sms/);
  assert.doesNotMatch(source, /graph\.facebook\.com/);
  assert.doesNotMatch(source, /OTP sent to your phone number/);
});

test("password reset uses an opaque challenge instead of returning a full phone number", () => {
  const backend = read("api-server/src/routes/auth.ts");
  const mobile = read("athoo-app/app/auth/forgot-password.tsx");
  assert.match(backend, /purpose: "password_reset_challenge"/);
  assert.match(backend, /challengeToken/);
  assert.doesNotMatch(backend, /resolvedPhone:\s*normalizedPhone/);
  assert.match(mobile, /const \[challengeToken, setChallengeToken\]/);
  assert.match(mobile, /challengeToken,\s*code: otp\.trim\(\)/s);
  assert.doesNotMatch(mobile, /resolvedPhone/);
});

test("production mobile never renders an OTP returned by the server", () => {
  const login = read("athoo-app/app/auth/login.tsx");
  const register = read("athoo-app/app/auth/register.tsx");
  const provider = read("athoo-app/app/auth/provider-register.tsx");
  const forgot = read("athoo-app/app/auth/forgot-password.tsx");
  assert.match(login, /setOtpHint\(__DEV__ \?/);
  assert.match(register, /if \(__DEV__\) setOtpHint/);
  assert.match(provider, /if \(__DEV__\) setOtpHint/);
  assert.match(forgot, /if \(__DEV__ && res\?\.code\)/);
});

test("configuration and crash screens show user-facing copy only", () => {
  const rootLayout = read("athoo-app/app/_layout.tsx");
  const fallback = read("athoo-app/components/ErrorFallback.tsx");
  assert.match(rootLayout, /Service temporarily unavailable/);
  assert.doesNotMatch(rootLayout, /Set EXPO_PUBLIC_API_BASE_URL/);
  assert.match(fallback, /Please try again\. If the issue continues, contact support\./);
  assert.doesNotMatch(fallback, /error\.message|stack|componentStack/);
});

test("wide surfaces use a professional responsive viewport without constraining phones", () => {
  const viewport = read("athoo-app/components/ResponsiveViewport.tsx");
  const rootLayout = read("athoo-app/app/_layout.tsx");
  assert.match(viewport, /Platform\.OS === "web" && width > 1280/);
  assert.match(viewport, /maxWidth: 1280/);
  assert.match(viewport, /width: "100%"/);
  assert.match(rootLayout, /<ResponsiveViewport>/);
});

test("release deployment declares OTP channels and consistent EAS configuration", () => {
  const render = read("render.yaml");
  const rootEas = read("eas.json");
  const appEas = read("athoo-app/eas.json");
  assert.match(render, /WHATSAPP_ACCESS_TOKEN/);
  assert.match(render, /WHATSAPP_PHONE_NUMBER_ID/);
  assert.match(render, /WHATSAPP_GRAPH_API_VERSION[\s\S]*value: v25\.0/);
  assert.match(render, /OTP_DELIVERY_CHANNELS[\s\S]*value: whatsapp_cloud,email/);
  assert.match(read("api-server/src/lib/otpDelivery.ts"), /WHATSAPP_GRAPH_BASE_URL/);
  assert.match(render, /ALLOW_DEV_OTP_RESPONSE[\s\S]*value: "false"/);
  const rootEasConfig = JSON.parse(rootEas);
  const serializedEas = JSON.stringify(rootEasConfig);
  assert.doesNotMatch(serializedEas, /athoo-api\.onrender\.com|EXPO_PUBLIC_API_BASE_URL|EXPO_PUBLIC_MAP_PROVIDER|EAS_PROJECT_ID/);
  assert.deepEqual(rootEasConfig, JSON.parse(appEas));
  assert.match(read("athoo-app/app.config.js"), /readEnv\(\s*"EAS_PROJECT_ID"/);
});

test("runtime diagnostics are routed through the production-safe logger", () => {
  const logger = read("athoo-app/lib/logger.ts");
  assert.match(logger, /Production-safe application logger/);
  assert.match(logger, /A recoverable issue occurred/);
  assert.match(logger, /An unexpected issue occurred/);

  const runtimeFiles = [
    "athoo-app/services/SoundService.ts",
    "athoo-app/services/NotificationService.ts",
    "athoo-app/context/NegotiationContext.tsx",
    "athoo-app/context/BookingContext.tsx",
    "athoo-app/context/AuthContext.tsx",
    "athoo-app/context/CallContext.tsx",
  ];
  for (const file of runtimeFiles) {
    const source = read(file);
    assert.match(source, /appLogger/);
    assert.doesNotMatch(source, /console\.(?:log|warn|error|info)\(/);
  }
});
