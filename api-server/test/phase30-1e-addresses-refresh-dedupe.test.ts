import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "../..");

const read = (relative: string) =>
  fs.readFileSync(path.join(root, relative), "utf8").replace(/\r\n?/g, "\n");

test("Phase 30.1E deduplicates customer addresses focus refreshes", () => {
  const screen = read("athoo-app/app/(customer)/addresses.tsx");

  assert.match(screen, /useCallback, useMemo, useRef, useState/);
  assert.match(
    screen,
    /const ADDRESSES_BACKGROUND_REFRESH_MS = 60_000/,
  );
  assert.match(screen, /const requestInFlightRef = useRef\(false\)/);
  assert.match(screen, /const loadedRef = useRef\(false\)/);
  assert.match(screen, /const lastLoadedAtRef = useRef\(0\)/);
  assert.match(screen, /if \(requestInFlightRef\.current\) return/);
  assert.match(
    screen,
    /mode: "initial" \| "refresh" \| "background"/,
  );
  assert.match(
    screen,
    /Date\.now\(\) - lastLoadedAtRef\.current >=/,
  );
  assert.match(screen, /void load\("background"\)/);
  assert.match(screen, /onPress=\{\(\) => void load\("refresh"\)\}/);
  assert.doesNotMatch(screen, /void load\(\)/);
});

test("Phase 30.1E preserves addresses loading, error and mutation behavior", () => {
  const screen = read("athoo-app/app/(customer)/addresses.tsx");

  assert.match(screen, /setLoading\(true\)/);
  assert.match(screen, /setLoadError\(""\)/);
  assert.match(screen, /const res = await api\.getAddresses\(\)/);
  assert.match(screen, /setAddresses\(res\.addresses \|\| \[\]\)/);
  assert.match(screen, /setLoading\(false\)/);
  assert.match(screen, /await api\.addAddress/);
  assert.match(screen, /await api\.deleteAddress/);
  assert.match(screen, /await api\.setDefaultAddress/);
  assert.match(screen, /ActivityIndicator/);
  assert.match(screen, /Retry/);
});