import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../", import.meta.url);
const read = (path: string) => readFile(new URL(path, root), "utf8");

test("provider registration uses the searchable city picker", async () => {
  const [screen, picker] = await Promise.all([
    read("athoo-app/app/auth/provider-register.tsx"),
    read("athoo-app/components/ui/CityPicker.tsx"),
  ]);
  assert.match(screen, /provider-city-picker/);
  assert.match(screen, /<CityPicker/);
  assert.match(picker, /Search city/);
  assert.match(picker, /getActiveServiceAreas/);
  assert.doesNotMatch(picker, /const\s+PAKISTAN_CITIES/);
  assert.match(picker, /accessibilityState=\{\{ selected \}\}/);
});

test("map fallback remains backward compatible and supports retry", async () => {
  const source = await read("athoo-app/app/components/maps/AthooMapFallback.tsx");
  assert.match(source, /export function AthooMapFallback/);
  assert.match(source, /export default AthooMapFallback/);
  assert.match(source, /onRetry/);
  assert.match(source, /entering the address manually/);
});

test("admin status badges cover manual finance and account states", async () => {
  const source = await read("admin-panel/src/components/ui/StatusBadge.tsx");
  for (const status of ["deactivated", "rejected", "approved", "paid"]) {
    assert.match(source, new RegExp(`${status}:`));
  }
});
