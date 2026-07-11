import "dotenv/config";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { databaseName, run, safeDatabaseName, verifyBackupSet, withDatabase } from "./db-common.mjs";

const sourceUrl = process.env.DATABASE_URL;
const adminUrl = process.env.DB_ADMIN_URL;
if (!sourceUrl) throw new Error("DATABASE_URL is required");
if (!adminUrl) throw new Error("DB_ADMIN_URL is required and must be able to create/drop rehearsal databases");
if (process.env.NODE_ENV === "production" && process.env.ALLOW_PRODUCTION_REHEARSAL !== "true") {
  throw new Error("Refusing to run a temporary database rehearsal in NODE_ENV=production without ALLOW_PRODUCTION_REHEARSAL=true");
}

const temporaryDir = path.resolve(process.env.DB_REHEARSAL_DIR || ".athoo-db-rehearsal");
await mkdir(temporaryDir, { recursive: true, mode: 0o700 });
const rehearsalDb = safeDatabaseName("athoo_restore_rehearsal");
const migrationDb = safeDatabaseName("athoo_migration_rehearsal");
const rehearsalUrl = withDatabase(adminUrl, rehearsalDb);
const migrationUrl = withDatabase(adminUrl, migrationDb);
let backupFile = process.argv[2] ? path.resolve(process.argv[2]) : null;
let createdBackup = false;

try {
  if (!backupFile) {
    const before = new Set(await import("node:fs/promises").then((fs) => fs.readdir(temporaryDir)));
    await run(process.execPath, [path.resolve("scripts/tools/db-backup.mjs")], {
      env: { ...process.env, DATABASE_URL: sourceUrl, DB_BACKUP_DIR: temporaryDir, DB_BACKUP_RETENTION_DAYS: "0" },
    });
    const after = await import("node:fs/promises").then((fs) => fs.readdir(temporaryDir));
    const created = after.filter((name) => name.endsWith(".dump") && !before.has(name)).sort().at(-1);
    if (!created) throw new Error("Backup rehearsal did not create a dump file");
    backupFile = path.join(temporaryDir, created);
    createdBackup = true;
  }
  await verifyBackupSet(backupFile);
  await run("createdb", ["--maintenance-db", adminUrl, rehearsalDb]);
  await run(process.execPath, [path.resolve("scripts/tools/db-restore.mjs"), backupFile, `--confirm-database=${rehearsalDb}`], {
    env: { ...process.env, DATABASE_URL: sourceUrl, RESTORE_DATABASE_URL: rehearsalUrl },
  });
  const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  await run(pnpm, ["--filter", "@workspace/scripts", "db:verify"], { env: { ...process.env, DATABASE_URL: rehearsalUrl } });
  await run(pnpm, ["--filter", "@workspace/scripts", "db:integrity"], { env: { ...process.env, DATABASE_URL: rehearsalUrl } });
  const sourceLatest = (await run("psql", [sourceUrl, "--tuples-only", "--no-align", "--set", "ON_ERROR_STOP=1", "--command", "SELECT migration_id FROM athoo_schema_migrations ORDER BY migration_id DESC LIMIT 1"], { capture: true })).stdout.trim();
  const restoredLatest = (await run("psql", [rehearsalUrl, "--tuples-only", "--no-align", "--set", "ON_ERROR_STOP=1", "--command", "SELECT migration_id FROM athoo_schema_migrations ORDER BY migration_id DESC LIMIT 1"], { capture: true })).stdout.trim();
  if (!sourceLatest || sourceLatest !== restoredLatest) throw new Error(`Migration mismatch after restore: source=${sourceLatest}, restored=${restoredLatest}`);

  await run("createdb", ["--maintenance-db", adminUrl, migrationDb]);
  await run(pnpm, ["--filter", "@workspace/scripts", "db:migrate"], { env: { ...process.env, DATABASE_URL: migrationUrl } });
  await run(pnpm, ["--filter", "@workspace/scripts", "db:verify"], { env: { ...process.env, DATABASE_URL: migrationUrl } });
  await run(pnpm, ["--filter", "@workspace/scripts", "db:integrity"], { env: { ...process.env, DATABASE_URL: migrationUrl } });
  const migratedLatest = (await run("psql", [migrationUrl, "--tuples-only", "--no-align", "--set", "ON_ERROR_STOP=1", "--command", "SELECT migration_id FROM athoo_schema_migrations ORDER BY migration_id DESC LIMIT 1"], { capture: true })).stdout.trim();
  if (migratedLatest !== sourceLatest) throw new Error(`Fresh migration mismatch: source=${sourceLatest}, fresh=${migratedLatest}`);

  console.log(JSON.stringify({
    ok: true,
    sourceDatabase: databaseName(sourceUrl),
    restoreRehearsalDatabase: rehearsalDb,
    migrationRehearsalDatabase: migrationDb,
    backup: backupFile,
    latestMigration: sourceLatest,
    checks: ["backup_checksum", "restore", "restored_db_verify", "restored_db_integrity", "fresh_migrate", "fresh_db_verify", "fresh_db_integrity"],
  }, null, 2));
} finally {
  try { await run("dropdb", ["--if-exists", "--force", "--maintenance-db", adminUrl, rehearsalDb]); } catch (error) { console.error(`WARNING: failed to drop rehearsal database ${rehearsalDb}: ${error.message}`); }
  try { await run("dropdb", ["--if-exists", "--force", "--maintenance-db", adminUrl, migrationDb]); } catch (error) { console.error(`WARNING: failed to drop migration database ${migrationDb}: ${error.message}`); }
  if (createdBackup && process.env.KEEP_REHEARSAL_BACKUP !== "true" && backupFile) {
    await rm(backupFile, { force: true });
    await rm(`${backupFile}.manifest.json`, { force: true });
    await rm(`${backupFile}.sha256`, { force: true });
  }
}
