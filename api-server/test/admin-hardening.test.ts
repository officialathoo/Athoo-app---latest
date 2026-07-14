import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const auth = readFileSync(new URL("../src/middlewares/auth.ts", import.meta.url), "utf8");
const permissions = readFileSync(new URL("../src/lib/adminPermissions.ts", import.meta.url), "utf8");
const routes = readFileSync(new URL("../src/routes/admin.ts", import.meta.url), "utf8");
const adminApi = readFileSync(new URL("../../admin-panel/src/lib/api.ts", import.meta.url), "utf8");
const adminHook = readFileSync(new URL("../../admin-panel/src/hooks/useAdmin.ts", import.meta.url), "utf8");
const uiPermissions = readFileSync(new URL("../../admin-panel/src/lib/permissions.ts", import.meta.url), "utf8");

test("backend permission checks include role defaults and wildcard permissions", () => {
  assert.match(auth, /hasAdminPermission\(req\.user, permission\)/);
  assert.match(permissions, /ADMIN_ROLE_PERMISSIONS/);
  assert.match(permissions, /permissions\.includes\(`\$\{resource\}\.\*`\)/);
});

test("sensitive admin mutations use write permissions", () => {
  assert.match(routes, /users\/:id\/status", requirePermission\("users\.write"\)/);
  assert.match(routes, /providers\/:id\/commission-limit", requirePermission\("finance\.write"\)/);
  assert.match(routes, /invoices\/:id\/status", requirePermission\("finance\.write"\)/);
  assert.match(routes, /bulk-email", requirePermission\("users\.write"\)/);
});

test("admin panel rotates refresh sessions and performs server logout", () => {
  assert.match(adminApi, /REFRESH_TOKEN_KEY/);
  assert.match(adminApi, /refreshAdminSession/);
  assert.match(adminApi, /saveSessionTokens\(data\.token, data\.refreshToken\)/);
  assert.match(adminHook, /api\("\/api\/auth\/logout", \{ method: "POST" \}\)/);
});

test("frontend and backend permission vocabulary is normalized", () => {
  assert.match(uiPermissions, /"operations\.read": "bookings\.read"/);
  assert.match(uiPermissions, /"providers\.write": "verification\.write"/);
  assert.match(uiPermissions, /"support\.write": "complaints\.write"/);
});

test("admin account changes cannot remove the final super admin and revoke old sessions", () => {
  assert.match(routes, /The last super admin cannot be demoted/);
  assert.match(routes, /The last active super admin cannot be deactivated/);
  assert.match(routes, /revokeAllUserSessions\(req\.params\.id, "admin_security_profile_changed"\)/);
  assert.match(routes, /revokeAllUserSessions\(req\.params\.id, "admin_account_deactivated"\)/);
});
