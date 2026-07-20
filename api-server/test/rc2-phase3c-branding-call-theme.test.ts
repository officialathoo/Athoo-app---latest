import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "../..");
const read = (relative: string) => fs.readFileSync(path.join(root, relative), "utf8");

test("Phase 3C uses the centralized approved brand asset", () => {
  const brand = read("athoo-app/config/brand.ts");
  assert.match(brand, /app-icon-approved\.png/);
  const mobileSource = [
    "athoo-app/app/auth/login.tsx",
    "athoo-app/app/auth/welcome.tsx",
    "athoo-app/components/ui/AthooLoader.tsx",
    "athoo-app/components/screens/AboutScreen.tsx",
    "athoo-app/app/(customer)/booking-detail.tsx",
    "athoo-app/app/(customer)/invoices.tsx",
    "athoo-app/app/(provider)/invoices.tsx",
    "athoo-app/app/(provider)/job-detail.tsx",
  ].map(read).join("\n");
  assert.doesNotMatch(mobileSource, /logo_transparent\.png|assets\/images\/logo\.png/);
  assert.match(mobileSource, /brandConfig\.assets\.mark/);
});

test("Phase 3C native splash and notification branding are configuration driven", () => {
  const config = read("athoo-app/app.config.js");
  assert.match(config, /"expo-splash-screen"/);
  assert.match(config, /dark:\s*\{/);
  assert.match(config, /SPLASH_BACKGROUND_DARK/);
  assert.match(config, /notificationIconPath/);
  assert.match(config, /APP_SLUG/);
  assert.match(config, /APP_SCHEME/);
  assert.match(config, /slug: appSlug/);
  assert.match(config, /scheme: appScheme/);
  assert.match(config, /BRAND_PRIMARY_DARK_COLOR/);
  assert.match(config, /BRAND_SECONDARY_DARK_COLOR/);
  assert.match(config, /color:\s*brandPrimaryColor/);
  assert.match(config, /https:\/\/u\.expo\.dev\/\$\{easProjectId\}/);
  assert.doesNotMatch(config, /url:\s*"https:\/\/u\.expo\.dev\/42a7f8fe/);
});

test("Phase 3C call ICE providers are server configured without embedded public credentials", () => {
  const server = read("api-server/src/routes/calls.ts");
  const callConfiguration = read("api-server/src/lib/callConfiguration.ts");
  const mobile = read("athoo-app/context/CallContext.tsx");
  const api = read("athoo-app/services/api.ts");
  const env = read(".env.production.example");

  assert.match(callConfiguration, /STUN_URLS/);
  assert.match(callConfiguration, /TURN_URLS/);
  assert.match(server, /getRuntimeCallConfiguration/);
  assert.doesNotMatch(callConfiguration, /stun\.l\.google\.com/);
  assert.match(api, /getCallConfig\(\)/);
  assert.match(mobile, /api\.getCallConfig\(\)/);
  assert.match(mobile, /iceConfigurationRef\.current/);
  assert.match(mobile, /fallbackChunkMsRef\.current/);
  assert.match(mobile, /configuration\.audio\?\.fallbackChunkMs/);
  assert.doesNotMatch(mobile, /stun\.l\.google\.com/);
  assert.match(env, /CALL_PROVIDER=cloudflare-turn/);
  assert.match(env, /CALL_FALLBACK_CHUNK_MS=400/);
  assert.match(env, /CALL_PREFERRED_CODEC=opus/);
  assert.doesNotMatch(env, /EXPO_PUBLIC_TURN_CREDENTIAL/);
});

test("Phase 3C notification toast and provider verification wall are theme driven", () => {
  const notifications = read("athoo-app/context/NotificationContext.tsx");
  const globalToast = read("athoo-app/context/ToastContext.tsx");
  const providerLayout = read("athoo-app/app/(provider)/_layout.tsx");
  assert.match(notifications, /createNotificationStyles\(theme\)/);
  assert.match(notifications, /notificationAccent/);
  assert.doesNotMatch(notifications, /Colors\./);
  assert.match(globalToast, /createToastStyles\(theme\)/);
  assert.doesNotMatch(globalToast, /Colors\.|#[0-9A-Fa-f]{3,8}/);
  assert.match(providerLayout, /createVerificationStyles\(theme\)/);
  assert.doesNotMatch(providerLayout, /Colors\./);
});

test("Phase 3C mobile runtime has no hosting-vendor API or tile fallback", () => {
  const api = read("athoo-app/services/api.ts");
  const config = read("athoo-app/app.config.js");
  const map = read("athoo-app/components/maps/OpenStreetMapPreview.tsx");
  assert.doesNotMatch(api + config + map, /athoo-api\.onrender\.com/);
  assert.match(api, /const DEFAULT_API_BASE_URL = ""/);
  assert.match(map, /tileTemplateConfigured/);
  assert.match(map, /Map tiles are not currently available/);
});
