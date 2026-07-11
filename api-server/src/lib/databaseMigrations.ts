import { pool } from "@workspace/db";

export const LATEST_DATABASE_MIGRATION = "20260712_release_performance_scalability.sql";

export type MigrationHealth = {
  ok: boolean;
  latestExpected: string;
  latestApplied: string | null;
  appliedCount: number;
  error?: string;
};

export async function getMigrationHealth(): Promise<MigrationHealth> {
  try {
    const exists = await pool.query<{ exists: boolean }>(`
      SELECT to_regclass('public.athoo_schema_migrations') IS NOT NULL AS exists
    `);
    if (!exists.rows[0]?.exists) {
      return { ok: false, latestExpected: LATEST_DATABASE_MIGRATION, latestApplied: null, appliedCount: 0, error: "migration registry is missing" };
    }

    const result = await pool.query<{ migration_id: string; total: string }>(`
      SELECT migration_id, COUNT(*) OVER()::text AS total
      FROM athoo_schema_migrations
      ORDER BY migration_id DESC
      LIMIT 1
    `);
    const latestApplied = result.rows[0]?.migration_id ?? null;
    const appliedCount = Number(result.rows[0]?.total ?? 0);
    return {
      ok: latestApplied === LATEST_DATABASE_MIGRATION,
      latestExpected: LATEST_DATABASE_MIGRATION,
      latestApplied,
      appliedCount,
      ...(latestApplied === LATEST_DATABASE_MIGRATION ? {} : { error: "database migrations are pending" }),
    };
  } catch (error) {
    return {
      ok: false,
      latestExpected: LATEST_DATABASE_MIGRATION,
      latestApplied: null,
      appliedCount: 0,
      error: error instanceof Error ? error.message : "migration check failed",
    };
  }
}

export async function assertDatabaseMigrationsCurrent(): Promise<void> {
  if (process.env.ALLOW_PENDING_MIGRATIONS === "1") return;
  const health = await getMigrationHealth();
  if (!health.ok) {
    throw new Error(`Database schema is not current: ${health.error}; latest applied=${health.latestApplied ?? "none"}, expected=${health.latestExpected}. Run pnpm db:migrate.`);
  }
}
