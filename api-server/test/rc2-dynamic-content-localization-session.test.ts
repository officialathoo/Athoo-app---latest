import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../..");
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

test("admin-managed mobile content uses cached API data instead of hardcoded display lists", () => {
  const home = read("athoo-app/app/(customer)/(tabs)/home.tsx");
  const categories = read("athoo-app/context/CategoriesContext.tsx");
  const customerHelp = read("athoo-app/app/(customer)/help.tsx");
  const providerHelp = read("athoo-app/app/(provider)/help.tsx");

  assert.doesNotMatch(home, /FALLBACK_BANNERS|Emergency Rescue/);
  assert.match(home, /HOME_CONTENT_CACHE_KEY/);
  assert.match(home, /getMarketingBanners\("customer"\)/);
  assert.match(home, /getEmergencyContacts\(\)/);
  assert.match(categories, /CATEGORIES_CACHE_KEY/);
  assert.match(categories, /categories: \[\]/);
  assert.doesNotMatch(customerHelp, /HARDCODED_FAQS/);
  assert.doesNotMatch(providerHelp, /FALLBACK_FAQS/);
});

test("profile menus consume runtime translations", () => {
  const customer = read("athoo-app/app/(customer)/(tabs)/profile.tsx");
  const provider = read("athoo-app/app/(provider)/(tabs)/profile.tsx");
  const language = read("athoo-app/context/LanguageContext.tsx");

  assert.match(customer, /buildMenuSections\(t, theme\)/);
  assert.match(customer, /t\.appearance/);
  assert.match(customer, /t\.contactSupport/);
  assert.match(provider, /title: t\.workEarnings/);
  assert.match(provider, /label: t\.premiumPlan/);
  assert.match(language, /premiumPlan: "پریمیم پلان"/);
  assert.match(language, /dangerZone: "خطرناک اختیارات"/);
});

test("logout performs local navigation before bounded network cleanup", () => {
  const auth = read("athoo-app/context/AuthContext.tsx");
  const localClear = auth.indexOf("setUser(null)");
  const networkCleanup = auth.indexOf("Promise.allSettled");
  assert.ok(localClear >= 0 && networkCleanup > localClear);
  assert.match(auth, /setTimeout\(\(\) => controller\.abort\(\), 4000\)/);
});
