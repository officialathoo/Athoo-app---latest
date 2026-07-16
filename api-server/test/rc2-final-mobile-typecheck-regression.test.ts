import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path: string) => fs.readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

test("booking detail imports the fast location helper it calls", () => {
  const source = read("athoo-app/app/(customer)/booking-detail.tsx");
  assert.match(source, /import \{ getFastForegroundLocation \} from "@\/services\/location"/);
  assert.match(source, /await getFastForegroundLocation\(/);
});

test("earnings translation mapping does not pass Array.map index as translation params", () => {
  const source = read("athoo-app/app/(provider)/earnings.tsx");
  assert.doesNotMatch(source, /\.map\(tr\)/);
  assert.match(source, /\.map\(\(month\) => tr\(month\)\)/);
});

test("directions wire response permits configured provider caches and normalizes them", () => {
  const source = read("athoo-app/services/maps.ts");
  assert.match(source, /source\?: "mapbox" \| "mapbox-cache" \| "osrm" \| "osrm-cache" \| "straight_line"/);
  assert.match(source, /data\.source === "mapbox" \|\| data\.source === "mapbox-cache"/);
  assert.match(source, /data\.source === "osrm" \|\| data\.source === "osrm-cache"/);
});
