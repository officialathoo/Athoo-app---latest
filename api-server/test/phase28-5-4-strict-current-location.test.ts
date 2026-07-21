import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "../..");
const read = (relative: string) =>
  fs.readFileSync(path.join(root, relative), "utf8");

test("current-location workflows never substitute cached coordinates", () => {
  const location = read("athoo-app/services/location.ts");
  const map = read("athoo-app/app/(customer)/map.tsx");
  const booking = read("athoo-app/app/(customer)/book-service.tsx");
  const picker = read("athoo-app/components/maps/LocationSearchPicker.tsx");
  const auth = read("athoo-app/context/AuthContext.tsx");

  assert.match(
    location,
    /const LOCATION_CACHE_KEY = "athoo:last-known-location:v2"/,
  );
  assert.match(location, /requireFresh\?: boolean/);
  assert.match(
    location,
    /!options\.preferFresh && !options\.requireFresh && bestCached/,
  );
  assert.match(
    location,
    /if \(options\.requireFresh\) \{[\s\S]*?!fresh \|\| fresh\.accuracy == null[\s\S]*?location: null/,
  );

  assert.match(map, /preferFresh: true,\s*requireFresh: true,/);
  assert.match(
    booking,
    /preferFresh: true,\s*requireFresh: true,/,
  );
  assert.match(
    picker,
    /preferFresh: true,\s*requireFresh: true,/,
  );
  assert.match(
    auth,
    /preferFresh: force,\s*requireFresh: true,/,
  );

  assert.match(map, /const mapCenter = pickedLocation \|\| userLocation;/);
  assert.doesNotMatch(
    map,
    /providerId \? selectedProvider : userLocation/,
  );
});