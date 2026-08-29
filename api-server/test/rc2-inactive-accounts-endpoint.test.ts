import test from "node:test";
import assert from "node:assert/strict";
import { readRepo } from "./helpers/repo.ts";

test("inactive account review queue endpoint is implemented and scoped to review-state accounts", () => {
  const admin = readRepo("api-server/src/routes/admin.ts");
  const route = admin.slice(
    admin.indexOf('router.get("/inactive-accounts"'),
    admin.indexOf("// ─── Sidebar Counts"),
  );

  assert.match(route, /router\.get\("\/inactive-accounts"/);
  assert.match(route, /inactivityState, "review"/);
  assert.match(route, /accountStatus, "active"/);
  assert.match(route, /isDeactivated, false/);
  assert.match(route, /isBlocked, false/);
  assert.match(route, /items: rows\.map\(toSafeUser\)/);
  assert.match(route, /reviewQueue/);
});
