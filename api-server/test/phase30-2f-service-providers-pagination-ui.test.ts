import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "../..");

const read = (relative: string) =>
  fs.readFileSync(path.join(root, relative), "utf8").replace(/\r\n?/g, "\n");

test("Phase 30.2F wires Service Providers to bounded server discovery", () => {
  const screen = read("athoo-app/app/(customer)/service-providers.tsx");

  assert.match(screen, /const PROVIDER_PAGE_SIZE = 25/);
  assert.match(screen, /api\.getProviderDiscovery\(sid, \{/);
  assert.match(screen, /limit: PROVIDER_PAGE_SIZE/);
  assert.match(screen, /sort: serverSort/);
  assert.match(screen, /available: onlyAvailable/);
  assert.match(screen, /city: cityFilter === "All" \? undefined : cityFilter/);
  assert.match(screen, /query: debouncedAreaQuery \|\| undefined/);
  assert.doesNotMatch(screen, /api\.getProviders\(sid\)/);
});

test("Phase 30.2F paginates without local whole-dataset sorting", () => {
  const screen = read("athoo-app/app/(customer)/service-providers.tsx");

  assert.match(screen, /const \[hasMore, setHasMore\] = useState\(false\)/);
  assert.match(screen, /const \[nextCursor, setNextCursor\] = useState<string \| null>\(null\)/);
  assert.match(screen, /void loadProviders\("more", nextCursor\)/);
  assert.match(screen, /Load more workers/);
  assert.doesNotMatch(screen, /const filtered = useMemo/);
  assert.doesNotMatch(screen, /list\.sort\(/);
});

test("Phase 30.2F keeps nearest truthful when device location is unavailable", () => {
  const screen = read("athoo-app/app/(customer)/service-providers.tsx");

  assert.match(screen, /setSortBy\("rating"\)/);
  assert.match(screen, /nextSort === "nearby" && !userLocation/);
  assert.match(screen, /Turn on location access to sort workers by nearest distance/);
  assert.match(screen, /latitude: serverSort === "nearby" \? userLocation\?\.latitude : undefined/);
  assert.match(screen, /longitude: serverSort === "nearby" \? userLocation\?\.longitude : undefined/);
});

test("Phase 30.2F gives provider discovery truthful loading and retry states", () => {
  const screen = read("athoo-app/app/(customer)/service-providers.tsx");

  assert.match(screen, /const \[loadError, setLoadError\] = useState<string \| null>\(null\)/);
  assert.match(screen, /Couldn't load workers/);
  assert.match(screen, /onPress=\{\(\) => void loadProviders\("initial"\)\}/);
  assert.match(screen, /PROVIDER_SEARCH_DEBOUNCE_MS = 350/);
  assert.match(screen, /requestVersionRef/);
  assert.match(screen, /loadingMoreRef/);
});