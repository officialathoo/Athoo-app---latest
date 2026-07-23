import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "../..");

const read = (relative: string) =>
  fs.readFileSync(path.join(root, relative), "utf8").replace(/\r\n?/g, "\n");

test("Phase 30.2E adds bounded server-side discovery sorts and filters", () => {
  const route = read("api-server/src/routes/providers.ts");

  assert.match(route, /type ProviderListSort = "default" \| "top" \| "jobs" \| "nearby"/);
  assert.match(route, /req\.query\.sort === "top"/);
  assert.match(route, /req\.query\.sort === "jobs"/);
  assert.match(route, /req\.query\.sort === "nearby"/);
  assert.match(route, /provider discovery filters require limit/);
  assert.match(route, /eq\(usersTable\.isAvailable, true\)/);
  assert.match(route, /lower\(COALESCE\(\$\{usersTable\.location\}, ''\)\) LIKE/);
  assert.match(route, /lower\(\$\{usersTable\.name\}\) LIKE/);
});

test("Phase 30.2E gives jobs and nearby deterministic cursor ordering", () => {
  const route = read("api-server/src/routes/providers.ts");

  assert.match(route, /const providerTotalJobsOrder = sql<number>`COALESCE\(\$\{usersTable\.totalJobs\}, 0\)`/);
  assert.match(
    route,
    /desc\(providerTotalJobsOrder\),\s*desc\(providerUpdatedAtOrder\),\s*desc\(usersTable\.id\)/,
  );
  assert.match(
    route,
    /asc\(providerDistanceOrder\),\s*asc\(usersTable\.id\)/,
  );
  assert.match(route, /distanceKm\?: number/);
  assert.match(route, /totalJobs\?: number/);
});

test("Phase 30.2E computes nearby distance on the server without exposing provider coordinates", () => {
  const route = read("api-server/src/routes/providers.ts");
  const admin = read("api-server/src/lib/admin.ts");

  assert.match(route, /nearby sort requires latitude and longitude/);
  assert.match(route, /6371\.0 \* acos/);
  assert.match(route, /discoveryDistanceKm: providerDistanceOrder/);
  assert.match(route, /distanceKm: discoveredDistance/);

  const projectionStart = admin.indexOf("export function toPublicProvider");
  const projectionEnd = admin.indexOf("export function toSafeUser", projectionStart);
  assert.ok(projectionStart >= 0 && projectionEnd > projectionStart);
  const projection = admin.slice(projectionStart, projectionEnd);

  assert.doesNotMatch(projection, /\blatitude\b/);
  assert.doesNotMatch(projection, /\blongitude\b/);
});

test("Phase 30.2E adds a dedicated mobile discovery API while preserving legacy getProviders", () => {
  const api = read("athoo-app/services/api.ts");

  assert.match(api, /getProviders\(\s*serviceId\?: string,\s*options: \{ limit\?: number; sort\?: "top"; cursor\?: string \} = \{\}/);
  assert.match(api, /getProviderDiscovery\(\s*serviceId: string \| undefined,\s*options:/);
  assert.match(api, /sort: "top" \| "jobs" \| "nearby"/);
  assert.match(api, /available\?: boolean/);
  assert.match(api, /city\?: string/);
  assert.match(api, /query\?: string/);
  assert.match(api, /latitude\?: number/);
  assert.match(api, /longitude\?: number/);
  assert.match(api, /q: options\.query/);
});