import { randomUUID } from "node:crypto";
import { pool } from "@workspace/db";
import { logger } from "./logger";

type JobHandler<T = unknown> = (payload: T) => Promise<void> | void;
type QueueOptions = { attempts?: number; delayMs?: number; dedupeKey?: string };
type ClaimedJob = { id: string; name: string; payload: unknown; attempts: number; max_attempts: number; locked_by: string };

const handlers = new Map<string, JobHandler>();
let accepting = true;
let workerRunning = false;
let pollTimer: NodeJS.Timeout | null = null;
let activeJobs = 0;
let lastError: string | null = null;
let lastPollAt: string | null = null;
let lastSnapshot = { pending: 0, processing: 0, failed: 0, completed: 0 };
let lastMaintenanceAt = 0;
let reclaimedJobs = 0;
let cleanedJobs = 0;

const pollMs = () => Math.max(250, Number(process.env.QUEUE_POLL_MS || 1000));
const concurrency = () => Math.max(1, Math.min(20, Number(process.env.QUEUE_CONCURRENCY || 4)));
const workerId = () => process.env.RENDER_INSTANCE_ID || process.env.HOSTNAME || `pid-${process.pid}`;
const staleLockMinutes = () => Math.max(1, Math.min(120, Number(process.env.QUEUE_STALE_LOCK_MINUTES || 15)));
const completedRetentionDays = () => Math.max(1, Math.min(365, Number(process.env.QUEUE_COMPLETED_RETENTION_DAYS || 14)));

export function registerJobHandler<T = unknown>(name: string, handler: JobHandler<T>): void {
  handlers.set(name, handler as JobHandler);
}

export async function enqueueJob(name: string, payload: unknown, opts: QueueOptions = {}): Promise<string> {
  if (!accepting) throw new Error("Queue is shutting down and is not accepting new jobs");
  if (!name.trim()) throw new Error("Queue job name is required");
  const id = randomUUID();
  const maxAttempts = Math.max(1, Math.min(20, opts.attempts || 3));
  const availableAt = new Date(Date.now() + Math.max(0, opts.delayMs || 0));
  const result = await pool.query<{ id: string }>(
    `INSERT INTO background_jobs (id, name, payload, max_attempts, available_at, dedupe_key)
     VALUES ($1, $2, $3::jsonb, $4, $5, $6)
     ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL
     DO UPDATE SET updated_at = now()
     RETURNING id`,
    [id, name, JSON.stringify(payload ?? null), maxAttempts, availableAt, opts.dedupeKey || null],
  );
  schedulePoll(0);
  return result.rows[0]!.id;
}

export function queueStats() {
  return {
    provider: "postgres",
    durable: true,
    accepting,
    running: workerRunning,
    activeJobs,
    lastPollAt,
    lastError,
    handlers: [...handlers.keys()],
    reclaimedJobs,
    cleanedJobs,
    staleLockMinutes: staleLockMinutes(),
    completedRetentionDays: completedRetentionDays(),
    ...lastSnapshot,
  };
}

export async function clearFailedJobs(): Promise<number> {
  const result = await pool.query(`DELETE FROM background_jobs WHERE status = 'failed'`);
  void refreshStats();
  return result.rowCount || 0;
}

export function startQueueWorker(): void {
  if (workerRunning) return;
  accepting = true;
  workerRunning = true;
  schedulePoll(0);
  logger.info({ provider: "postgres", concurrency: concurrency() }, "durable queue worker started");
}

export async function shutdownQueue(timeoutMs = 10_000): Promise<boolean> {
  accepting = false;
  workerRunning = false;
  if (pollTimer) clearTimeout(pollTimer);
  pollTimer = null;
  const deadline = Date.now() + timeoutMs;
  while (activeJobs > 0 && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return activeJobs === 0;
}

function schedulePoll(delay = pollMs()): void {
  if (!workerRunning || pollTimer) return;
  pollTimer = setTimeout(() => {
    pollTimer = null;
    void pollQueue();
  }, delay);
  pollTimer.unref?.();
}

async function pollQueue(): Promise<void> {
  if (!workerRunning) return;
  lastPollAt = new Date().toISOString();
  try {
    const slots = Math.max(0, concurrency() - activeJobs);
    if (Date.now() - lastMaintenanceAt > 60_000) {
      await maintainQueue();
      lastMaintenanceAt = Date.now();
    }
    if (slots > 0) {
      const jobs = await claimJobs(slots);
      for (const job of jobs) void executeJob(job);
    }
    await refreshStats();
    lastError = null;
  } catch (error) {
    lastError = error instanceof Error ? error.message : String(error);
    logger.error({ err: error }, "durable queue poll failed");
  } finally {
    schedulePoll();
  }
}

async function claimJobs(limit: number): Promise<ClaimedJob[]> {
  const result = await pool.query<ClaimedJob>(
    `WITH claimable AS (
       SELECT id FROM background_jobs
       WHERE status = 'pending' AND available_at <= now()
       ORDER BY available_at, created_at
       FOR UPDATE SKIP LOCKED
       LIMIT $1
     )
     UPDATE background_jobs AS jobs
     SET status = 'processing', locked_at = now(), locked_by = $2, updated_at = now()
     FROM claimable
     WHERE jobs.id = claimable.id
     RETURNING jobs.id, jobs.name, jobs.payload, jobs.attempts, jobs.max_attempts, jobs.locked_by`,
    [limit, workerId()],
  );
  return result.rows;
}

async function executeJob(job: ClaimedJob): Promise<void> {
  activeJobs += 1;
  try {
    const handler = handlers.get(job.name);
    if (!handler) throw new Error(`No handler registered for job: ${job.name}`);
    await handler(job.payload);
    const completed = await pool.query(
      `UPDATE background_jobs SET status = 'completed', completed_at = now(), locked_at = NULL, locked_by = NULL, updated_at = now()
       WHERE id = $1 AND status = 'processing' AND locked_by = $2`,
      [job.id, job.locked_by],
    );
    if ((completed.rowCount || 0) === 0) {
      logger.warn({ jobId: job.id, lockedBy: job.locked_by }, "queue completion ignored because job ownership changed");
    }
  } catch (error) {
    const attempts = job.attempts + 1;
    const retryBase = Math.max(100, Number(process.env.QUEUE_RETRY_BASE_MS || 500));
    const failed = attempts >= job.max_attempts;
    const delayMs = Math.min(300_000, retryBase * 2 ** Math.max(0, attempts - 1));
    await pool.query(
      `UPDATE background_jobs
       SET status = $2, attempts = $3, last_error = $4,
           available_at = CASE WHEN $2 = 'pending' THEN now() + ($5 * interval '1 millisecond') ELSE available_at END,
           failed_at = CASE WHEN $2 = 'failed' THEN now() ELSE failed_at END,
           locked_at = NULL, locked_by = NULL, updated_at = now()
       WHERE id = $1 AND status = 'processing' AND locked_by = $6`,
      [job.id, failed ? "failed" : "pending", attempts, error instanceof Error ? error.message.slice(0, 4000) : String(error).slice(0, 4000), delayMs, job.locked_by],
    );
    logger.error({ err: error, jobName: job.name, jobId: job.id, attempts, failed }, "durable queue job failed");
  } finally {
    activeJobs -= 1;
    schedulePoll(0);
  }
}

async function maintainQueue(): Promise<void> {
  const reclaimed = await pool.query(
    `UPDATE background_jobs
     SET status = 'pending', locked_at = NULL, locked_by = NULL,
         available_at = now(), updated_at = now(),
         last_error = CASE WHEN last_error IS NULL OR last_error = '' THEN 'Recovered after stale worker lock' ELSE last_error END
     WHERE status = 'processing'
       AND locked_at < now() - ($1 * interval '1 minute')`,
    [staleLockMinutes()],
  );
  const cleaned = await pool.query(
    `DELETE FROM background_jobs
     WHERE status = 'completed'
       AND completed_at < now() - ($1 * interval '1 day')`,
    [completedRetentionDays()],
  );
  reclaimedJobs += reclaimed.rowCount || 0;
  cleanedJobs += cleaned.rowCount || 0;
  if ((reclaimed.rowCount || 0) > 0 || (cleaned.rowCount || 0) > 0) {
    logger.info({ reclaimed: reclaimed.rowCount || 0, cleaned: cleaned.rowCount || 0 }, "durable queue maintenance completed");
  }
}

async function refreshStats(): Promise<void> {
  const result = await pool.query<{ status: keyof typeof lastSnapshot; count: string }>(
    `SELECT status, count(*)::text AS count FROM background_jobs GROUP BY status`,
  );
  const snapshot = { pending: 0, processing: 0, failed: 0, completed: 0 };
  for (const row of result.rows) {
    if (row.status in snapshot) snapshot[row.status] = Number(row.count);
  }
  lastSnapshot = snapshot;
}
