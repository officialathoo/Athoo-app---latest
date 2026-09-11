import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("../../scripts/tools/db-rehearse.mjs", import.meta.url),
  "utf8",
);

test("database rehearsal upgrades a restored production backup before fresh convergence", () => {
  assert.match(source, /Applying pending migrations to restored rehearsal database/);
  assert.match(source, /DATABASE_URL: rehearsalUrl/);
  assert.match(source, /Restored production upgrade passed/);
  assert.match(source, /migratedLatest !== restoredMigratedLatest/);
  assert.match(source, /restored_fresh_migration_convergence/);
  assert.doesNotMatch(source, /migratedLatest !== sourceLatest/);
  assert.doesNotMatch(source, /"restored_db_verify"/);
});