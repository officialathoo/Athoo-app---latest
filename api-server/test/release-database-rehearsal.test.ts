import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path: string) => fs.readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

test("backup uses PostgreSQL custom format with checksum and manifest", () => {
  const backup = read("scripts/tools/db-backup.mjs");
  assert.match(backup, /--format=custom/);
  assert.match(backup, /pg_restore.*--list/s);
  assert.match(backup, /latestMigration/);
  assert.match(backup, /sha256/);
  assert.match(backup, /mode: 0o600/);
});

test("restore requires a separate explicit target and verifies backup integrity", () => {
  const restore = read("scripts/tools/db-restore.mjs");
  assert.match(restore, /RESTORE_DATABASE_URL is required/);
  assert.match(restore, /--confirm-database=/);
  assert.match(restore, /verifyBackupSet/);
  assert.match(restore, /--single-transaction/);
  assert.match(restore, /--clean/);
  assert.match(restore, /Refusing to restore over DATABASE_URL/);
});

test("database rehearsal validates restored and freshly migrated temporary databases", () => {
  const rehearsal = read("scripts/tools/db-rehearse.mjs");
  assert.match(rehearsal, /athoo_restore_rehearsal/);
  assert.match(rehearsal, /athoo_migration_rehearsal/);
  assert.match(rehearsal, /db:verify/);
  assert.match(rehearsal, /db:integrity/);
  assert.match(rehearsal, /db:migrate/);
  assert.match(rehearsal, /dropdb/);
  assert.match(rehearsal, /Migration mismatch after restore/);
  assert.match(rehearsal, /Fresh migration mismatch/);
});

test("root scripts expose backup restore rehearsal and toolchain preflight", () => {
  const pkg = JSON.parse(read("package.json"));
  assert.equal(pkg.scripts["db:backup"], "node ./scripts/tools/db-backup.mjs");
  assert.equal(pkg.scripts["db:restore"], "node ./scripts/tools/db-restore.mjs");
  assert.equal(pkg.scripts["db:rehearse"], "node ./scripts/tools/db-rehearse.mjs");
  assert.equal(pkg.scripts["db:tools-check"], "node ./scripts/tools/db-tools-check.mjs");
});
