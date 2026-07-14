import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const homePath = new URL("../../athoo-app/app/(customer)/(tabs)/home.tsx", import.meta.url);
const providerCardPath = new URL("../../athoo-app/components/ui/ProviderCard.tsx", import.meta.url);

test("customer home throttles focus refresh and prevents overlapping requests", async () => {
  const source = await readFile(homePath, "utf8");
  assert.match(source, /HOME_BACKGROUND_REFRESH_MS\s*=\s*60_000/);
  assert.match(source, /homeRequestInFlightRef\.current/);
  assert.match(source, /loadFocusData\("background"\)/);
  assert.doesNotMatch(source, /loadFocusData\(hasLoadedHomeRef\.current \? "refresh" : "initial"\)/);
});

test("customer home keeps first-load skeleton exclusive from populated content", async () => {
  const source = await readFile(homePath, "utf8");
  assert.match(source, /homeLoading\s*\?\s*\([\s\S]*CustomerHomeSkeleton[\s\S]*\)\s*:\s*\(\s*<>/);
});

test("customer home and provider cards use the active theme", async () => {
  const home = await readFile(homePath, "utf8");
  const provider = await readFile(providerCardPath, "utf8");
  assert.match(home, /useTheme\(\)/);
  assert.match(home, /theme\.colors\.background/);
  assert.match(home, /theme\.colors\.surface/);
  assert.match(provider, /useTheme\(\)/);
  assert.match(provider, /theme\.colors\.surface/);
  assert.match(provider, /theme\.colors\.border/);
});

test("active broadcast gradient has one style property", async () => {
  const source = await readFile(homePath, "utf8");
  const matches = source.match(/style=\{styles\.activeBroadcastGrad\}/g) ?? [];
  assert.equal(matches.length, 1);
});
