import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../..");
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

test("language context persists selection and exposes RTL-aware formatting", () => {
  const source = read("athoo-app/context/LanguageContext.tsx");
  assert.match(source, /ready: boolean/);
  assert.match(source, /direction: "ltr" \| "rtl"/);
  assert.match(source, /writingDirection: isUrdu \? "rtl" : "ltr"/);
  assert.match(source, /formatCurrency/);
  assert.match(source, /AsyncStorage\.setItem\("athoo_lang"/);
  assert.match(source, /chooseTheme: "اپنی تھیم منتخب کریں"/);
});

test("shared text and input controls follow language direction and font scaling", () => {
  const text = read("athoo-app/components/design/AppText.tsx");
  const input = read("athoo-app/components/design/AppInput.tsx");
  const button = read("athoo-app/components/ui/Button.tsx");
  for (const source of [text, input, button]) {
    assert.match(source, /writingDirection/);
  }
  assert.match(text, /maxFontSizeMultiplier/);
  assert.match(input, /accessibilityLabel/);
  assert.match(input, /textAlignVertical/);
});

test("appearance and language are dedicated theme-aware settings screens", () => {
  const appearance = read("athoo-app/app/appearance.tsx");
  const language = read("athoo-app/app/language.tsx");
  const appearanceSelector = read("athoo-app/components/settings/AppearanceSelector.tsx");
  const languageSelector = read("athoo-app/components/settings/LanguageSelector.tsx");
  assert.match(appearance, /AppearanceSelector/);
  assert.match(language, /LanguageSelector/);
  assert.match(appearanceSelector, /accessibilityRole="radiogroup"/);
  assert.match(languageSelector, /accessibilityRole="radiogroup"/);
  assert.match(appearanceSelector, /t\.useDeviceSetting/);
  assert.match(languageSelector, /t\.urduHint/);
});

test("customer and provider profiles route to one canonical language screen", () => {
  const customer = read("athoo-app/app/(customer)/(tabs)/profile.tsx");
  const provider = read("athoo-app/app/(provider)/(tabs)/profile.tsx");
  assert.match(customer, /route: "\/language"/);
  assert.match(provider, /router\.push\("\/language" as any\)/);
  assert.doesNotMatch(customer, /visible=\{showLangModal\}/);
  assert.doesNotMatch(provider, /visible=\{showLangModal\}/);
});

test("welcome experience is localized, theme-driven and keeps acceptance markers", () => {
  const welcome = read("athoo-app/app/auth/welcome.tsx");
  assert.match(welcome, /useLang/);
  assert.match(welcome, /useTheme/);
  assert.match(welcome, /t\.welcomeTagline/);
  assert.match(welcome, /testID="welcome-screen"/);
  assert.match(welcome, /testID="welcome-customer-sign-in"/);
  assert.match(welcome, /testID="welcome-provider-sign-in"/);
  assert.doesNotMatch(welcome, /@\/constants\/colors/);
});

test("native splash and adaptive icon use configurable light and dark backgrounds", () => {
  const config = read("athoo-app/app.config.js");
  assert.match(config, /SPLASH_BACKGROUND_LIGHT/);
  assert.match(config, /SPLASH_BACKGROUND_DARK/);
  assert.match(config, /ADAPTIVE_ICON_BACKGROUND/);
  assert.match(config, /"expo-splash-screen"/);
  assert.match(config, /backgroundColor: splashBackgroundLight/);
  assert.match(config, /backgroundColor: splashBackgroundDark/);
  assert.match(config, /backgroundColor: adaptiveIconBackground/);
  assert.match(config, /const splashBackgroundLight = process\.env\.SPLASH_BACKGROUND_LIGHT \|\| "#FFFFFF"/);
  assert.match(config, /const adaptiveIconBackground = process\.env\.ADAPTIVE_ICON_BACKGROUND \|\| "#FFFFFF"/);
});
