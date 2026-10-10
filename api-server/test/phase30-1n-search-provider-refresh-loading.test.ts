import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "../..");

const read = (relative: string) =>
  fs.readFileSync(path.join(root, relative), "utf8").replace(/\r\n?/g, "\n");

test("Phase 30.1N deduplicates customer search provider refreshes", () => {
  const screen = read("athoo-app/app/(customer)/(tabs)/search.tsx");

  assert.match(
    screen,
    /const SEARCH_PROVIDERS_BACKGROUND_REFRESH_MS = 60_000/,
  );
  assert.match(screen, /const providerLoadRequestInFlightRef = useRef\(false\)/);
  assert.match(screen, /const providersLoadedRef = useRef\(false\)/);
  assert.match(screen, /const providersLastLoadedAtRef = useRef\(0\)/);
  assert.match(screen, /if \(providerLoadRequestInFlightRef\.current\) return/);
  assert.match(
    screen,
    /mode: "initial" \| "refresh" \| "background"/,
  );
  assert.match(
    screen,
    /Date\.now\(\) - providersLastLoadedAtRef\.current >=/,
  );
  assert.match(screen, /void loadProviders\("initial"\)/);
  assert.match(screen, /void loadProviders\("background"\)/);
});

test("Phase 30.1N recomputes nearby prefilter distance without refetching providers", () => {
  const screen = read("athoo-app/app/(customer)/(tabs)/search.tsx");

  assert.match(screen, /setAllProviders\(\(current\) =>\s*current\.map/);
  assert.match(
    screen,
    /getDistanceKm\(userLat, userLng, provider\.latitude!, provider\.longitude!\)/,
  );
  assert.match(screen, /\}, \[userLat, userLng\]\);/);
  assert.match(screen, /const loadProviders = useCallback/);
  assert.match(screen, /\}, \[\]\);/);
});

test("Phase 30.1N keeps provider load failures truthful without truncating nationwide discovery", () => {
  const screen = read("athoo-app/app/(customer)/(tabs)/search.tsx");

  assert.match(screen, /const \[providerLoadError, setProviderLoadError\] = useState\(""\)/);
  assert.match(screen, /search-provider-load-retry-map/);
  assert.match(screen, /search-provider-load-retry-list/);
  assert.match(screen, /Provider refresh failed\. Showing the last loaded results\./);
  assert.doesNotMatch(screen, /setAllProviders\(\[\]\)/);

  // Search remains intentionally unbounded until proper pagination/load-more is
  // implemented, so this phase must not hide Pakistan-wide providers.
  assert.match(screen, /const res = await api\.getProviders\(\);/);
  assert.doesNotMatch(screen, /api\.getProviders\([^)]*limit/);

  assert.match(screen, /"recommended" \| "nearby" \| "rating" \| "jobs"/);
  assert.match(screen, /AthooInteractiveMap/);
  assert.match(screen, /ProviderCard/);
});