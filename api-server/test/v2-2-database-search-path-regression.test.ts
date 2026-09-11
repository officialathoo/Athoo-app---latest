import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (file: string) => readFileSync(new URL(`../../${file}`, import.meta.url), "utf8");

test("database certification tools schema-qualify the migration registry", () => {
  const files = [
    "scripts/tools/db-backup.mjs",
    "scripts/tools/db-rehearse.mjs",
    "scripts/src/db-migrate.ts",
    "scripts/src/db-integrity.ts",
    "api-server/src/lib/databaseMigrations.ts",
  ];

  for (const file of files) {
    const source = read(file);
    assert.match(source, /public\.athoo_schema_migrations/);
    assert.doesNotMatch(source, /FROM athoo_schema_migrations/);
  }
});