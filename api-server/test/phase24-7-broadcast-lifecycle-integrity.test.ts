import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "../..");
const read = (relative: string) => fs.readFileSync(path.join(root, relative), "utf8");

test("broadcast defaults keep the expansion pass inside the request lifetime", () => {
  const settings = read("api-server/src/lib/admin.ts");
  const adminPage = read("admin-panel/src/pages/SettingsPage.tsx");

  assert.match(settings, /broadcastTTLMinutes:\s*30/);
  assert.match(settings, /broadcastExpandAfterMinutes:\s*5/);
  assert.match(settings, /broadcastExpandAfterMinutes must be smaller than broadcastTTLMinutes/);
  assert.match(settings, /computed\.broadcastExpandAfterMinutes >= computed\.broadcastTTLMinutes/);
  assert.match(adminPage, /Broadcast expansion must run at least 1 minute before the broadcast expires/);
});

test("existing invalid platform settings are repaired by an idempotent migration", () => {
  const migration = read("deploy/migrations/20260719_broadcast_delivery_configuration_integrity.sql");
  const latest = read("lib/db/src/migrations.ts");

  assert.match(migration, /UPDATE app_settings AS settings/);
  assert.match(migration, /broadcastTTLMinutes/);
  assert.match(migration, /broadcastExpandAfterMinutes/);
  assert.match(migration, /base_expand >= base_ttl/);
  assert.match(migration, /IS DISTINCT FROM/);
  assert.match(latest, /20260720_provider_document_expiry_lifecycle\.sql/);
});

test("broadcast creation and matching use canonical service slugs", () => {
  const mobile = read("athoo-app/app/(customer)/book-service.tsx");
  const route = read("api-server/src/routes/broadcast.ts");

  assert.match(mobile, /service:\s*\(selectedCategory as any\)\.slug \|\| selectedCategory\.id/);
  assert.match(route, /serviceCategoriesTable/);
  assert.match(route, /service:\s*category\?\.slug \|\| rawService/);
  assert.match(route, /serviceLabel:\s*category\?\.name/);
});

test("Available for Jobs is authoritative for broadcast delivery and listing", () => {
  const route = read("api-server/src/routes/broadcast.ts");

  assert.match(route, /if \(!provider\.isAvailable\) return \{ eligible: false, reason: "unavailable" \}/);
  assert.match(route, /!provider\.isAvailable[\s\S]*?"unavailable"/);
  assert.match(route, /explicit "Available for jobs" preference does/);
});

test("customer success state reports when the first delivery radius matched nobody", () => {
  const api = read("athoo-app/services/api.ts");
  const screen = read("athoo-app/app/(customer)/book-service.tsx");

  assert.match(api, /matchedCount:\s*number/);
  assert.match(api, /expansionQueued:\s*boolean/);
  assert.match(screen, /setBroadcastDelivery\(res\.delivery/);
  assert.match(screen, /No provider matched the first radius yet/);
  assert.match(screen, /no currently available provider matched the service, location, and radius requirements/);
});
