import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (file: string) => readFileSync(new URL(`../../${file}`, import.meta.url), "utf8");

test("API startup refuses pending migrations instead of mutating schema", () => {
  const index = read("api-server/src/index.ts");
  assert.match(index, /assertDatabaseMigrationsCurrent/);
  assert.doesNotMatch(index, /ensureSchemaCompatibility/);
});

test("migration runner uses checksum drift protection and advisory locking", () => {
  const runner = read("scripts/src/db-migrate.ts");
  assert.match(runner, /pg_advisory_lock/);
  assert.match(runner, /checksum mismatch/i);
  assert.match(runner, /athoo_schema_migrations/);
  assert.match(runner, /ROLLBACK/);
});

test("deployment starts by applying migrations", () => {
  assert.match(read("render.yaml"), /startCommand: pnpm db:migrate &&/);
  assert.match(read("Dockerfile.api"), /pnpm db:migrate && pnpm --filter @workspace\/api-server start/);
});

test("deep health reports migration readiness", () => {
  const health = read("api-server/src/routes/health.ts");
  assert.match(health, /getMigrationHealth/);
  assert.match(health, /migrations/);
});

test("backup and destructive restore tools are explicitly wired", () => {
  const pkg = JSON.parse(read("package.json"));
  assert.equal(pkg.scripts["db:backup"], "node ./scripts/tools/db-backup.mjs");
  assert.equal(pkg.scripts["db:restore"], "node ./scripts/tools/db-restore.mjs");
  const restore = read("scripts/tools/db-restore.mjs");
  assert.match(restore, /RESTORE_DATABASE_URL is required/);
  assert.match(restore, /--confirm-database=/);
  assert.match(restore, /verifyBackupSet/);
  assert.match(restore, /--single-transaction/);
});
