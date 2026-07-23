import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "../..");

const read = (relative: string) =>
  fs.readFileSync(path.join(root, relative), "utf8").replace(/\r\n?/g, "\n");

test("Phase 30.1B bounds only the customer Home provider query", () => {
  const providersRoute = read("api-server/src/routes/providers.ts");
  const mobileApi = read("athoo-app/services/api.ts");
  const home = read("athoo-app/app/(customer)/(tabs)/home.tsx");
  const map = read("athoo-app/app/(customer)/map.tsx");
  const providerList = read("athoo-app/app/(customer)/service-providers.tsx");
  const search = read("athoo-app/app/(customer)/(tabs)/search.tsx");

  assert.match(providersRoute, /const rawLimit = req\.query\.limit/);
  assert.match(providersRoute, /limit = Math\.min\(50, parsedLimit\)/);
  assert.match(providersRoute, /req\.query\.sort === "top"/);
  assert.match(providersRoute, /desc\(usersTable\.rating\)/);
  assert.match(providersRoute, /desc\(usersTable\.ratingCount\)/);
  assert.match(providersRoute, /\.limit\(limit\)/);
  assert.match(providersRoute, /limit must be a positive integer/);

  assert.match(
    mobileApi,
    /options: \{ limit\?: number; sort\?: "top" \} = \{\}/,
  );
  assert.match(mobileApi, /limit: options\.limit/);
  assert.match(mobileApi, /sort: options\.sort/);

  assert.match(home, /const HOME_PROVIDER_FETCH_LIMIT = 50/);
  assert.match(
    home,
    /api\.getProviders\(undefined, \{ limit: HOME_PROVIDER_FETCH_LIMIT, sort: "top" \}\)/,
  );

  assert.match(map, /api\.getProviders\(serviceId && serviceId !== "all" \? serviceId : undefined\)/);
  assert.match(providerList, /api\.getProviders\(sid\)/);
  assert.match(search, /api\.getProviders\(\)/);
});