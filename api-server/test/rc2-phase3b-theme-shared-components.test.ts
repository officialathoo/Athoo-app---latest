import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "../..");
const read = (relative: string) => fs.readFileSync(path.join(root, relative), "utf8");

const THEME_COMPONENTS = [
  "athoo-app/components/ui/CityPicker.tsx",
  "athoo-app/components/ui/TimePicker.tsx",
  "athoo-app/components/ui/LegalAcceptanceCheckbox.tsx",
  "athoo-app/components/ui/LegalConsentGate.tsx",
  "athoo-app/components/ui/PermissionGate.tsx",
  "athoo-app/components/ui/VideoPlayer.tsx",
  "athoo-app/components/ui/AthooLoader.tsx",
  "athoo-app/components/maps/OpenStreetMapPreview.tsx",
  "athoo-app/app/call.tsx",
  "athoo-app/components/screens/ChatbotScreen.tsx",
];

test("secondary shared components resolve styles from the active theme", () => {
  for (const file of THEME_COMPONENTS) {
    const source = read(file);
    assert.match(source, /useTheme/);
    assert.match(source, /createStyles\(theme/);
    assert.doesNotMatch(source, /@\/constants\/colors/);
  }
});

test("loader uses the centralized approved brand asset and stops all animations on unmount", () => {
  const source = read("athoo-app/components/ui/AthooLoader.tsx");
  const brand = read("athoo-app/config/brand.ts");
  assert.match(source, /brandConfig\.assets\.mark/);
  assert.match(brand, /app-icon-approved\.png/);
  assert.doesNotMatch(source + brand, /logo_transparent\.png/);
  assert.match(source, /animations\.forEach\(\(animation\) => animation\.stop\(\)\)/);
  assert.match(source, /timers\.forEach\(clearTimeout\)/);
});

test("support and legal destinations are deployment-configurable rather than embedded in screens", () => {
  const config = read("athoo-app/app.config.js");
  const runtime = read("athoo-app/config/runtime.ts");
  const chatbot = read("athoo-app/components/screens/ChatbotScreen.tsx");
  const legal = read("athoo-app/components/ui/LegalAcceptanceCheckbox.tsx");
  const about = read("athoo-app/components/screens/AboutScreen.tsx");
  const customerProfile = read("athoo-app/app/(customer)/(tabs)/profile.tsx");
  const providerProfile = read("athoo-app/app/(provider)/(tabs)/profile.tsx");

  assert.match(config, /EXPO_PUBLIC_SUPPORT_WHATSAPP_URL/);
  assert.match(config, /EXPO_PUBLIC_SUPPORT_INSTAGRAM_URL/);
  assert.match(config, /EXPO_PUBLIC_SUPPORT_FACEBOOK_URL/);
  assert.match(config, /EXPO_PUBLIC_TERMS_URL/);
  assert.match(config, /EXPO_PUBLIC_PRIVACY_URL/);
  assert.match(runtime, /runtimeConfig/);
  assert.match(chatbot, /runtimeConfig\.support/);
  assert.match(legal, /runtimeConfig\.legal/);
  assert.doesNotMatch(chatbot, /wa\.me\/|instagram\.com\/athoo|facebook\.com\/athoo/);
  assert.doesNotMatch(about, /wa\.me\/|instagram\.com\/athoo|facebook\.com\/athoo/);
  assert.doesNotMatch(customerProfile, /wa\.me\/|instagram\.com\/athoo|facebook\.com\/athoo/);
  assert.doesNotMatch(providerProfile, /wa\.me\/|instagram\.com\/athoo|facebook\.com\/athoo/);
  assert.match(about, /runtimeConfig\.support/);
  assert.match(customerProfile, /runtimeConfig\.support/);
  assert.match(providerProfile, /runtimeConfig\.support/);
  assert.doesNotMatch(legal, /athoo\.example/);
});

test("customer and provider chatbot routes share one theme-safe implementation", () => {
  const customer = read("athoo-app/app/(customer)/chatbot.tsx");
  const provider = read("athoo-app/app/(provider)/chatbot.tsx");
  assert.match(customer, /<ChatbotScreen role="customer"/);
  assert.match(provider, /<ChatbotScreen role="provider"/);
});

test("call and map overlays keep semantic contrast in both themes", () => {
  const call = read("athoo-app/app/call.tsx");
  const map = read("athoo-app/components/maps/OpenStreetMapPreview.tsx");
  assert.match(call, /theme\.colors\.white/);
  assert.match(call, /theme\.colors\.danger/);
  assert.match(call, /theme\.colors\.success/);
  assert.match(map, /backgroundColor: theme\.colors\.elevated/);
  assert.match(map, /color: theme\.colors\.textSecondary/);
  assert.match(map, /stroke=\{theme\.colors\.primary\}/);
});


test("shared icons and state components use semantic theme defaults", () => {
  const icon = read("athoo-app/components/ui/Icon.tsx");
  const uiState = read("athoo-app/components/ui/UiState.tsx");
  const bookingCard = read("athoo-app/components/ui/BookingCard.tsx");
  assert.match(icon, /resolvedColor = color \|\| theme\.colors\.text/);
  assert.doesNotMatch(icon, /color = "#000000"/);
  assert.match(uiState, /theme\.colors\.white/);
  assert.match(uiState, /shadowColor: theme\.colors\.overlay/);
  assert.doesNotMatch(bookingCard, /#33245A|#F5F3FF/);
});
