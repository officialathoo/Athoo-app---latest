import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..", "..");
const migratePath = path.join(root, "scripts", "src", "db-migrate.ts");

test("migration verification permits only the three known historical database-only IDs", async () => {
  const source = await readFile(migratePath, "utf8");

  const allowlistMatch = source.match(
    /const LEGACY_DATABASE_ONLY_MIGRATIONS = new Set\(\[([\s\S]*?)\]\);/,
  );

  assert.ok(allowlistMatch, "migration lineage allowlist is missing");

  const ids = [...allowlistMatch[1].matchAll(/"([^"]+\.sql)"/g)]
    .map((match) => match[1])
    .sort();

  assert.deepEqual(ids, [
    "20260720_phase26_release_blockers.sql",
    "20260720_provider_document_expiry_lifecycle.sql",
    "20260720_release_phase28_professional_workflow_integrity.sql",
  ]);

  assert.match(
    source,
    /const localMigrationIds = new Set\(/,
  );
  assert.match(
    source,
    /const databaseOnlyMigrationIds = \[\.\.\.existing\.keys\(\)\]/,
  );
  assert.match(
    source,
    /const unexpectedDatabaseOnlyMigrationIds =/,
  );
  assert.match(
    source,
    /!LEGACY_DATABASE_ONLY_MIGRATIONS\.has\(migrationId\)/,
  );
  assert.match(
    source,
    /Database contains unexpected migration ID\(s\) that are absent from the local migration history/,
  );

  const guardPosition = source.indexOf(
    "unexpectedDatabaseOnlyMigrationIds",
  );
  const pendingPosition = source.indexOf(
    "const pending = migrations.filter",
  );

  assert.ok(guardPosition >= 0);
  assert.ok(pendingPosition >= 0);
  assert.ok(
    guardPosition < pendingPosition,
    "unknown database-only migrations must be rejected before status, verify, or up processing",
  );
});
