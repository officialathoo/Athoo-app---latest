import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const adminRoutes = fs.readFileSync(new URL("../src/routes/admin.ts", import.meta.url), "utf8");
const usersPage = fs.readFileSync(new URL("../../admin-panel/src/pages/UsersPage.tsx", import.meta.url), "utf8");
const activityPage = fs.readFileSync(new URL("../../admin-panel/src/pages/UserActivityPage.tsx", import.meta.url), "utf8");

test("customer management uses dedicated role-scoped server pagination", () => {
  assert.match(adminRoutes, /router\.get\("\/customers"/);
  assert.match(adminRoutes, /eq\(usersTable\.role, "customer"\)/);
  assert.match(adminRoutes, /count\(\*\)::int/);
  assert.match(usersPage, /\/api\/admin\/customers\?/);
  assert.doesNotMatch(usersPage, /roleFilter/);
  assert.doesNotMatch(usersPage, /bulk-email/);
});

test("customer account actions are reasoned, session-safe and audited", () => {
  assert.match(adminRoutes, /\/customers\/:id\/deactivate/);
  assert.match(adminRoutes, /revokeAllUserSessions\(customer\.id/);
  assert.match(adminRoutes, /customer_deactivated/);
  assert.match(adminRoutes, /\/customers\/:id\/revoke-sessions/);
  assert.match(usersPage, /Mandatory operational reason/);
  assert.match(usersPage, /Force logout/);
});

test("customer profile corrections cannot bypass verified identity changes", () => {
  assert.match(adminRoutes, /\/customers\/:id\/profile/);
  assert.match(adminRoutes, /name, location, bio/);
  assert.doesNotMatch(usersPage, /editForm\.email/);
  assert.doesNotMatch(usersPage, /editForm\.phone/);
  assert.match(usersPage, /Phone and email changes must use customer verification flows/);
});

test("customer activity is permission-aware", () => {
  assert.match(adminRoutes, /hasAdminPermission\(req\.user!, "finance\.read"\)/);
  assert.match(adminRoutes, /hasAdminPermission\(req\.user!, "audit\.read"\)/);
  assert.match(adminRoutes, /capabilities:/);
  assert.match(activityPage, /data\.capabilities/);
  assert.match(activityPage, /show: caps\.finance/);
  assert.match(activityPage, /show: caps\.audit/);
});

test("obsolete generic status mutation is disabled", () => {
  assert.match(adminRoutes, /Generic account status updates are disabled/);
  assert.match(adminRoutes, /status\(410\)/);
});
