import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "../..");

const read = (relative: string) =>
  fs.readFileSync(path.join(root, relative), "utf8").replace(/\r\n?/g, "\n");

test("Phase 30.2B adds bounded keyset pagination to the provider list endpoint", () => {
  const route = read("api-server/src/routes/providers.ts");

  assert.match(route, /type ProviderListCursor =/);
  assert.match(route, /toString\("base64url"\)/);
  assert.match(route, /Buffer\.from\(value, "base64url"\)/);
  assert.match(route, /cursor requires limit/);
  assert.match(route, /invalid provider cursor/);
  assert.match(route, /const fetchLimit = limit === null \? null : limit \+ 1/);
  assert.match(route, /const hasMore = providers\.length > limit/);
  assert.match(route, /nextCursor/);
  assert.match(route, /\.limit\(fetchLimit\)/);
});

test("Phase 30.2B uses deterministic tie breakers for paginated provider ordering", () => {
  const route = read("api-server/src/routes/providers.ts");

  assert.match(route, /const providerRatingOrder = sql<number>`COALESCE\(\$\{usersTable\.rating\}, 0\)`/);
  assert.match(route, /const providerRatingCountOrder = sql<number>`COALESCE\(\$\{usersTable\.ratingCount\}, 0\)`/);
  assert.match(route, /const providerUpdatedAtOrder = sql<Date>`COALESCE\(\$\{usersTable\.updatedAt\}, \$\{new Date\(0\)\}\)`/);
  assert.match(
    route,
    /desc\(providerRatingOrder\),\s*desc\(providerRatingCountOrder\),\s*desc\(providerUpdatedAtOrder\),\s*desc\(usersTable\.id\)/,
  );
  assert.match(
    route,
    /desc\(providerUpdatedAtOrder\),\s*desc\(usersTable\.id\)/,
  );
  assert.match(route, /updatedAt: \(provider\.updatedAt \?\? new Date\(0\)\)\.toISOString\(\)/);
});

test("Phase 30.2B preserves legacy unbounded provider calls while exposing cursor metadata to new clients", () => {
  const route = read("api-server/src/routes/providers.ts");
  const api = read("athoo-app/services/api.ts");

  assert.match(
    route,
    /if \(limit === null\) \{\s*res\.json\(\{ providers: providers\.map\(\(provider\) => toPublicProvider\(provider\)\) \}\);\s*return;/,
  );
  assert.match(api, /options: \{ limit\?: number; sort\?: "top"; cursor\?: string \} = \{\}/);
  assert.match(api, /hasMore\?: boolean/);
  assert.match(api, /nextCursor\?: string \| null/);
  assert.match(api, /cursor: options\.cursor/);
});

test("Phase 30.2B keeps the existing service filter and approved-provider safety rules", () => {
  const route = read("api-server/src/routes/providers.ts");

  assert.match(route, /eq\(usersTable\.role, "provider"\)/);
  assert.match(route, /eq\(usersTable\.isDeactivated, false\)/);
  assert.match(route, /eq\(usersTable\.isBlocked, false\)/);
  assert.match(route, /eq\(usersTable\.verificationStatus, "approved"\)/);
  assert.match(route, /lower\(\$\{serviceId\}\) = ANY/);
});