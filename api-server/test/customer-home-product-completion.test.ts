import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const home = fs.readFileSync("../athoo-app/app/(customer)/(tabs)/home.tsx", "utf8");
const api = fs.readFileSync("src/routes/marketing.ts", "utf8");
const admin = fs.readFileSync("../admin-panel/src/pages/MarketingPage.tsx", "utf8");
const schema = fs.readFileSync("../lib/db/src/schema/index.ts", "utf8");
const migration = fs.readFileSync("../deploy/migrations/20260711_customer_home_configuration.sql", "utf8");

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
  assert.match(home, /bannersStatus === "error" \? FALLBACK_BANNERS : apiBanners/);
  assert.doesNotMatch(home, /apiBanners\.length > 0 \? apiBanners : FALLBACK_BANNERS/);
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
