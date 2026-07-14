import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// Pool tuned for high-concurrency production workloads.
// On Neon use the *pooled* DATABASE_URL (-pooler suffix) so this client
// pool sits in front of pgbouncer; `max` here governs in-process sockets.
// Override any value via env when deploying to larger instances.
function parsePosInt(envVar: string | undefined, fallback: number): number {
  if (!envVar) return fallback;
  const n = Number(envVar);
  if (!Number.isFinite(n) || n <= 0) {
    process.stderr.write(
      JSON.stringify({
        level: 40,
        time: Date.now(),
        name: "pg-pool",
        msg: `invalid pool env value "${envVar}", falling back to ${fallback}`,
      }) + "\n",
    );
    return fallback;
  }
  return Math.floor(n);
}

const poolMax = parsePosInt(process.env.DB_POOL_MAX, 20);
const poolIdleMs = parsePosInt(process.env.DB_POOL_IDLE_MS, 30_000);
const poolConnTimeoutMs = parsePosInt(process.env.DB_POOL_CONNECT_TIMEOUT_MS, 10_000);

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: poolMax,
  idleTimeoutMillis: poolIdleMs,
  connectionTimeoutMillis: poolConnTimeoutMs,
  allowExitOnIdle: false,
});

// Never crash the process on a transient pool error — let the next
// request re-acquire a fresh client. We emit a pino-compatible JSON
// line to stderr so log aggregators (Logflare/Datadog) parse it the
// same way as the rest of the API server logs. lib/db deliberately
// has no logger dependency to stay framework-agnostic.
pool.on("error", (err) => {
  process.stderr.write(
    JSON.stringify({
      level: 50,
      time: Date.now(),
      name: "pg-pool",
      msg: "unexpected error on idle client",
      err: { message: err.message, stack: err.stack },
    }) + "\n",
  );
});

export const db = drizzle(pool, { schema });

export * from "./schema";

export * from "./migrations";
