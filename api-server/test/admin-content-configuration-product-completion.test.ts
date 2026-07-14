import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path: string) => fs.readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

test("service areas are permissioned, audited and soft-deactivated", () => {
  const source = read("api-server/src/routes/service-areas.ts");
  assert.match(source, /requirePermission\("settings\.read"\)/);
  assert.match(source, /requirePermission\("settings\.write"\)/);
  assert.match(source, /service_area\.deactivate/);
  assert.match(source, /isActive: false/);
  assert.doesNotMatch(source, /db\.delete\(serviceAreasTable\)/);
});

test("notification templates validate supported channels and preserve history", () => {
  const source = read("api-server/src/routes/notification-templates.ts");
  assert.match(source, /new Set\(\["push", "sms", "email"\]\)/);
  assert.match(source, /notification_template\.deactivate/);
  assert.match(source, /requirePermission\("settings\.read"\)/);
  assert.match(source, /requirePermission\("settings\.write"\)/);
  assert.doesNotMatch(source, /db\.delete\(notificationTemplatesTable\)/);
});

test("marketing content separates read and write permission and uses soft lifecycle", () => {
  const source = read("api-server/src/routes/marketing.ts");
  assert.match(source, /requirePermission\("marketing\.read"\)/);
  assert.match(source, /requirePermission\("marketing\.write"\)/);
  assert.match(source, /marketing\.announcement\.deactivate/);
  assert.match(source, /marketing\.faq\.deactivate/);
  assert.match(source, /Use \/api\/admin\/service-areas/);
  assert.doesNotMatch(source, /db\.delete\((marketingBannersTable|appAnnouncementsTable|faqsTable|serviceAreasTable)\)/);
});

test("subscription plans and reviews have split permissions, retry safety and conditional processing", () => {
  const source = read("api-server/src/routes/subscriptions.ts");
  assert.match(source, /clientRequestId is required/);
  assert.match(source, /requirePermission\("settings\.read"\)/);
  assert.match(source, /requirePermission\("settings\.write"\)/);
  assert.match(source, /requirePermission\("finance\.read"\)/);
  assert.match(source, /requirePermission\("finance\.write"\)/);
  assert.match(source, /eq\(userSubscriptionsTable\.status, "pending"\)/);
  assert.match(source, /status: "rejected"/);
  assert.match(source, /subscription\.approve/);
  assert.match(source, /subscription\.reject/);
});

test("platform settings have bounded validation and aligned permission vocabulary", () => {
  const settings = read("api-server/src/lib/admin.ts");
  const apiPermissions = read("api-server/src/lib/adminPermissions.ts");
  const uiPermissions = read("admin-panel/src/lib/permissions.ts");
  const adminRoutes = read("api-server/src/routes/admin.ts");
  assert.match(settings, /validatePlatformSettings\(next\)/);
  assert.match(settings, /broadcastExpansionRadiusKm cannot be smaller/);
  assert.match(settings, /supportEmail must be valid/);
  assert.match(apiPermissions, /marketing\.read/);
  assert.match(uiPermissions, /marketing\.read/);
  assert.match(uiPermissions, /technical:/);
  assert.match(adminRoutes, /router\.patch\("\/settings", requirePermission\("settings\.write"\)/);
});

test("content configuration migration enforces database integrity", () => {
  const migration = read("deploy/migrations/20260712_admin_content_configuration_integrity.sql");
  assert.match(migration, /service_areas_name_province_ci_uidx/);
  assert.match(migration, /notification_templates_channel_check/);
  assert.match(migration, /user_subscriptions_one_pending_uidx/);
  assert.match(migration, /subscription_plans_name_ci_uidx/);
  assert.match(migration, /user_subscriptions_status_check/);
});
