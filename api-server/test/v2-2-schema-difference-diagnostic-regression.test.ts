import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("../../scripts/tools/db-rehearse.mjs", import.meta.url),
  "utf8",
);

test("schema fingerprint failures report complete structural differences", () => {
  assert.match(source, /function schemaBlocks/);
  assert.match(source, /function schemaBlockDifference/);
  assert.match(source, /function schemaDifferenceSummary/);
  assert.match(source, /SCHEMA DIFFERENCE SUMMARY/);
  assert.match(source, /restoredOnlyCount/);
  assert.match(source, /freshOnlyCount/);
  assert.doesNotMatch(source, /slice\\(0,\\s*25\\)/);
  assert.match(source, /--schema-only/);
});
