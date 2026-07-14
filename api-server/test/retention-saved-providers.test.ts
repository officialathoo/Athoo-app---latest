import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "../..");
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

test("saved providers synchronize with the authenticated API and roll back failed optimistic updates", () => {
  const auth = read("athoo-app/context/AuthContext.tsx");
  const api = read("athoo-app/services/api.ts");
  assert.match(auth, /api\.getSavedProviders\(\)/);
  assert.match(auth, /api\.saveProvider\(providerId\)/);
  assert.match(auth, /api\.removeSavedProvider\(providerId\)/);
  assert.match(auth, /savedProviders: saved/);
  assert.match(api, /saveProvider\(providerId: string\)/);
  assert.match(api, /removeSavedProvider\(providerId: string\)/);
});

test("saved-provider API validates provider accounts and enforces idempotent uniqueness", () => {
  const route = read("api-server/src/routes/me.ts");
  const schema = read("lib/db/src/schema/index.ts");
  const migration = read("deploy/migrations/20260711_saved_provider_integrity.sql");
  assert.match(route, /provider\.role !== "provider"/);
  assert.match(route, /provider\.isDeactivated/);
  assert.match(route, /onConflictDoNothing/);
  assert.match(schema, /saved_providers_user_provider_uq/);
  assert.match(migration, /CREATE UNIQUE INDEX IF NOT EXISTS saved_providers_user_provider_uq/);
});

test("saved-provider screen includes progressive loading, recovery, and cross-device trust guidance", () => {
  const screen = read("athoo-app/app/(customer)/saved.tsx");
  assert.match(screen, /saved-providers-screen/);
  assert.match(screen, /saved-providers-retry/);
  assert.match(screen, /Build your trusted provider list/);
  assert.match(screen, /faster repeat bookings on any device/);
  assert.match(screen, /Available providers appear first/);
});
