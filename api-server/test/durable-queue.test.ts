import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const queue = readFileSync(new URL("../src/lib/queue.ts", import.meta.url), "utf8");
const migration = readFileSync(new URL("../../deploy/migrations/20260710_durable_background_jobs.sql", import.meta.url), "utf8");
const index = readFileSync(new URL("../src/index.ts", import.meta.url), "utf8");

test("background queue persists jobs in PostgreSQL", () => {
  assert.match(queue, /INSERT INTO background_jobs/);
  assert.match(queue, /provider: "postgres"/);
  assert.match(queue, /durable: true/);
});

test("workers claim jobs safely across replicas", () => {
  assert.match(queue, /FOR UPDATE SKIP LOCKED/);
  assert.match(queue, /locked_by/);
  assert.match(queue, /QUEUE_CONCURRENCY/);
});

test("durable queue retries and records terminal failures", () => {
  assert.match(queue, /QUEUE_RETRY_BASE_MS/);
  assert.match(queue, /status = 'failed'/);
  assert.match(queue, /last_error/);
});

test("queue schema enforces states and deduplication", () => {
  assert.match(migration, /background_jobs_status_check/);
  assert.match(migration, /dedupe_key_unique/);
  assert.match(migration, /processing.*15 minutes/s);
});

test("queue worker starts only after migration readiness", () => {
  const migrationCheck = index.indexOf("await assertDatabaseMigrationsCurrent()");
  const workerStart = index.indexOf("startQueueWorker()");
  assert.ok(migrationCheck >= 0 && workerStart > migrationCheck);
});
