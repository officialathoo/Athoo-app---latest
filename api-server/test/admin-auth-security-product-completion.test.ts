import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const read = (path: string) => fs.readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

test("admin login is server-side role gated and account locked", () => {
  const auth = read("api-server/src/routes/auth.ts");
  assert.match(auth, /router\.post\("\/admin-login"/);
  assert.match(auth, /user\.role !== "admin"/);
  assert.match(auth, /adminFailedLoginCount/);
  assert.match(auth, /adminLockedUntil/);
  assert.match(auth, /temporarily locked for 15 minutes/);
});

test("admin browser tokens are session scoped and use dedicated login", () => {
  const api = read("admin-panel/src/lib/api.ts");
  const hook = read("admin-panel/src/hooks/useAdmin.ts");
  assert.match(api, /sessionStorage\.setItem\(TOKEN_KEY/);
  assert.match(api, /sessionStorage\.setItem\(REFRESH_TOKEN_KEY/);
  assert.match(hook, /\/api\/auth\/admin-login/);
});

test("admin roles and permissions are validated centrally", () => {
  const permissions = read("api-server/src/lib/adminPermissions.ts");
  const routes = read("api-server/src/routes/admin.ts");
  assert.match(permissions, /"marketing", "technical"/);
  assert.match(permissions, /validateAdminPermissions/);
  assert.match(routes, /Invalid admin permissions/);
  assert.match(routes, /isStrongAdminPassword/);
});

test("admin removal preserves audit identity and sessions are revoked", () => {
  const routes = read("api-server/src/routes/admin.ts");
  assert.match(routes, /admin_user_deactivated/);
  assert.match(routes, /admin_account_deactivated/);
  assert.doesNotMatch(routes, /db\.delete\(usersTable\).*admin-users/s);
  assert.match(routes, /admin-users\/:id\/reactivate/);
});
