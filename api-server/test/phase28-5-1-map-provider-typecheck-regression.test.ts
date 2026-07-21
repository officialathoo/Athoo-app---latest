import test from "node:test";
import assert from "node:assert/strict";
import { readRepo } from "./helpers/repo.ts";

test("Phase 28.5.1 keeps the primary map provider as a runtime string", () => {
  const configuration = readRepo("api-server/src/lib/mapConfiguration.ts");

  assert.match(
    configuration,
    /function normalizeProvider\(value: unknown, fallback: string\): string/,
  );
  assert.match(configuration, /return provider \|\| fallback;/);
  assert.doesNotMatch(configuration, /function normalizeProvider<T extends string>/);
  assert.match(configuration, /primaryProvider === "tomtom"/);
  assert.match(configuration, /primaryProvider === "mapbox"/);
});
