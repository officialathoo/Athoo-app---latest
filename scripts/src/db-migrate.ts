import "dotenv/config";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import pg from "pg";

const { Client } = pg;
const ROOT = path.resolve(import.meta.dirname, "../..");
const BASELINE_ID = "00000000_database_baseline.sql";
const BASELINE_FILE = path.join(ROOT, "sql", "database.sql");
const MIGRATIONS_DIR = path.join(ROOT, "deploy", "migrations");
const LOCK_KEY = 2_184_600_101;

type Migration = { id: string; sql: string; checksum: string; source: string };

type AppliedRow = { migration_id: string; checksum: string };

function normalizedSql(sql: string): string {
  const normalized = sql.replace(/\r\n/g, "\n").trim();
  return normalized.replace(/^BEGIN;\s*/i, "").replace(/\s*COMMIT;\s*$/i, "").trim();
}

function checksum(sql: string): string {
  return createHash("sha256").update(sql.replace(/\r\n/g, "\n")).digest("hex");
}

async function loadMigrations(): Promise<Migration[]> {
  const baselineSql = await fs.readFile(BASELINE_FILE, "utf8");
  const files = (await fs.readdir(MIGRATIONS_DIR))
    .filter((name) => name.endsWith(".sql"))
    .sort((a, b) => a.localeCompare(b));

  const migrations: Migration[] = [
    { id: BASELINE_ID, sql: baselineSql, checksum: checksum(baselineSql), source: BASELINE_FILE },
  ];
  for (const id of files) {
    const source = path.join(MIGRATIONS_DIR, id);
    const sql = await fs.readFile(source, "utf8");
    migrations.push({ id, sql, checksum: checksum(sql), source });
  }
  return migrations;
}

async function ensureTable(client: pg.Client): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS athoo_schema_migrations (
      migration_id TEXT PRIMARY KEY,
      checksum TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      execution_ms INTEGER NOT NULL DEFAULT 0
    )
  `);
}

async function applied(client: pg.Client): Promise<Map<string, string>> {
  const result = await client.query<AppliedRow>(
    "SELECT migration_id, checksum FROM athoo_schema_migrations ORDER BY migration_id",
  );
  return new Map(result.rows.map((row) => [row.migration_id, row.checksum]));
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");

  const command = process.argv[2] ?? "up";
  if (!new Set(["up", "status", "verify"]).has(command)) {
    throw new Error(`Unknown command '${command}'. Use up, status, or verify.`);
  }

  const migrations = await loadMigrations();
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    await client.query("SELECT pg_advisory_lock($1)", [LOCK_KEY]);
    await ensureTable(client);
    const existing = await applied(client);

    for (const migration of migrations) {
      const recorded = existing.get(migration.id);
      if (recorded && recorded !== migration.checksum) {
        throw new Error(
          `Migration checksum mismatch for ${migration.id}. Never edit an applied migration; add a new migration instead.`,
        );
      }
    }

    const pending = migrations.filter((migration) => !existing.has(migration.id));
    if (command === "status") {
      console.log(JSON.stringify({ applied: existing.size, pending: pending.map((m) => m.id) }, null, 2));
      process.exitCode = pending.length ? 2 : 0;
      return;
    }
    if (command === "verify") {
      if (pending.length) throw new Error(`Database has ${pending.length} pending migration(s): ${pending.map((m) => m.id).join(", ")}`);
      console.log(`Database schema verified: ${existing.size} migration(s) applied, no checksum drift.`);
      return;
    }

    for (const migration of pending) {
      const started = Date.now();
      console.log(`Applying ${migration.id} ...`);
      await client.query("BEGIN");
      try {
        await client.query(normalizedSql(migration.sql));
        await client.query(
          "INSERT INTO athoo_schema_migrations (migration_id, checksum, execution_ms) VALUES ($1, $2, $3)",
          [migration.id, migration.checksum, Date.now() - started],
        );
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw new Error(`Migration ${migration.id} failed (${migration.source}): ${(error as Error).message}`);
      }
    }
    console.log(`Database is current. Applied ${pending.length} migration(s).`);
  } finally {
    try { await client.query("SELECT pg_advisory_unlock($1)", [LOCK_KEY]); } catch { /* connection may already be unavailable */ }
    await client.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
