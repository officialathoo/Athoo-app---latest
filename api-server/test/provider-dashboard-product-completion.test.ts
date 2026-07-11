import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const providers = fs.readFileSync(new URL("../src/routes/providers.ts", import.meta.url), "utf8");
const me = fs.readFileSync(new URL("../src/routes/me.ts", import.meta.url), "utf8");
const dashboard = fs.readFileSync(new URL("../../athoo-app/app/(provider)/(tabs)/dashboard.tsx", import.meta.url), "utf8");
const admin = fs.readFileSync(new URL("../../admin-panel/src/pages/ProvidersPage.tsx", import.meta.url), "utf8");
const adminRoutes = fs.readFileSync(new URL("../src/routes/admin.ts", import.meta.url), "utf8");

 test("provider dashboard metrics are server-owned and provider-scoped", () => {
  assert.match(providers, /router\.get\("\/dashboard", requireAuth/);
  assert.match(providers, /eq\(bookingsTable\.providerId, providerId\)/);
  assert.match(providers, /pendingNegotiations/);
  assert.match(providers, /unreadNotifications/);
  assert.match(dashboard, /api\.getProviderDashboard\(\)/);
});

test("availability cannot bypass provider eligibility rules", () => {
  assert.doesNotMatch(me, /"profileColor", "isAvailable"/);
  assert.match(providers, /Provider verification approval is required before going online/);
  assert.match(providers, /Your availability cooldown is still active/);
  assert.match(providers, /getProviderActiveWorkBlock/);
});

test("dashboard does not perform wasteful profile location polling", () => {
  assert.doesNotMatch(dashboard, /requestForegroundPermissionsAsync/);
  assert.doesNotMatch(dashboard, /setInterval\(async \(\) =>/);
  assert.match(dashboard, /RefreshControl/);
  assert.match(dashboard, /provider-dashboard-retry/);
});

test("admin availability override is permissioned, audited and visible", () => {
  assert.match(adminRoutes, /users\/:id\/availability/);
  assert.match(adminRoutes, /requirePermission\("users\.write"\)/);
  assert.match(adminRoutes, /provider_availability_overridden/);
  assert.match(admin, /provider-force-offline/);
  assert.match(admin, /provider-force-online/);
});
