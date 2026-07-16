import test from "node:test";
import assert from "node:assert/strict";
import { readRepo } from "./helpers/repo.ts";

const home = readRepo("athoo-app/app/(customer)/(tabs)/home.tsx");
const api = readRepo("api-server/src/routes/marketing.ts");
const admin = readRepo("admin-panel/src/pages/MarketingPage.tsx");
const schema = readRepo("lib/db/src/schema/index.ts");
const migration = readRepo("deploy/migrations/20260711_customer_home_configuration.sql");

test("customer home has refresh, retry, profile location and admin-controlled visibility", () => {
  assert.match(home, /RefreshControl/);
  assert.match(home, /loadFocusData\("refresh"\)/);
  assert.match(home, /user\?\.location\?\.trim\(\)/);
  assert.match(home, /homeConfig\.showBroadcastCta/);
  assert.match(home, /homeConfig\.showPlatformStats/);
  assert.match(home, /homeConfig\.showTopProviders/);
  assert.match(home, /homeConfig\.showEmergencyContacts/);
});

test("empty admin banner list does not silently restore hard-coded banners", () => {
  assert.match(home, /const displayBanners = apiBanners/);
  assert.doesNotMatch(home, /FALLBACK_BANNERS/);
});

test("home configuration is wired through database, API and admin panel", () => {
  assert.match(schema, /customerHomeSettingsTable/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS customer_home_settings/);
  assert.match(api, /publicRouter\.get\("\/home-config"/);
  assert.match(api, /adminRouter\.patch\("\/home-config"/);
  assert.match(api, /requirePermission\("marketing\.write"\)/);
  assert.match(admin, /customer-home-admin-settings/);
  assert.match(admin, /Save Home Setup/);
});
