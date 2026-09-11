import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("../../scripts/tools/db-rehearse.mjs", import.meta.url),
  "utf8",
);

test("database rehearsal proves structural schema convergence", () => {
  assert.match(source, /--schema-only/);
  assert.match(source, /normalizeSchemaDump/);
  assert.match(source, /restoredSchemaFingerprint !==/);
  assert.match(source, /Schema fingerprint convergence mismatch/);
  assert.match(source, /restored_fresh_schema_fingerprint_convergence/);
  assert.match(source, /createHash\("sha256"\)/);
});