import "dotenv/config";
import { mkdir, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { databaseFingerprint, databaseName, run, secureFile, sha256File } from "./db-common.mjs";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");

const dir = path.resolve(process.env.DB_BACKUP_DIR || "backups");
await mkdir(dir, { recursive: true, mode: 0o700 });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const file = path.join(dir, `athoo-${stamp}.dump`);
const manifestPath = `${file}.manifest.json`;
const checksumPath = `${file}.sha256`;

const pgDumpVersion = (await run("pg_dump", ["--version"], { capture: true })).stdout.trim();
const latestMigration = (await run("psql", [databaseUrl, "--tuples-only", "--no-align", "--set", "ON_ERROR_STOP=1", "--command", "SELECT migration_id FROM athoo_schema_migrations ORDER BY migration_id DESC LIMIT 1"], { capture: true })).stdout.trim();
if (!latestMigration) throw new Error("Cannot create a release backup before migrations have been applied");

await run("pg_dump", [
  "--no-owner", "--no-privileges", "--format=custom", "--compress=9",
  "--file", file, databaseUrl,
]);
await secureFile(file);
await run("pg_restore", ["--list", file], { capture: true });
const info = await stat(file);
if (info.size < 1024) throw new Error("Backup is unexpectedly small");
const sha256 = await sha256File(file);
const manifest = {
  formatVersion: 1,
  application: "ATHOO",
  createdAt: new Date().toISOString(),
  database: databaseName(databaseUrl),
  source: databaseFingerprint(databaseUrl),
  pgDumpVersion,
  latestMigration,
  bytes: info.size,
  sha256,
};
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600, flag: "wx" });
await writeFile(checksumPath, `${sha256}  ${path.basename(file)}\n`, { mode: 0o600, flag: "wx" });

const retentionDays = Number(process.env.DB_BACKUP_RETENTION_DAYS || 0);
if (Number.isFinite(retentionDays) && retentionDays > 0) {
  const cutoff = Date.now() - retentionDays * 86_400_000;
  for (const name of await readdir(dir)) {
    if (!/^athoo-.*\.dump(?:\.manifest\.json|\.sha256)?$/.test(name)) continue;
    const candidate = path.join(dir, name);
    if ((await stat(candidate)).mtimeMs < cutoff) await rm(candidate, { force: true });
  }
}

console.log(JSON.stringify({ backup: file, manifest: manifestPath, checksum: checksumPath, latestMigration, bytes: info.size, sha256 }, null, 2));
