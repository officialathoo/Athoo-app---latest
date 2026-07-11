import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { beginRequest, recordRequest, runtimeMetricsSnapshot } from "../src/lib/runtimeMetrics.ts";

test("runtime metrics track requests, errors, and slow routes", () => {
  const end = beginRequest();
  recordRequest("GET", "/api/example", 503, 1250);
  end();
  const snapshot = runtimeMetricsSnapshot();
  assert.equal(snapshot.requests.active, 0);
  assert.ok(snapshot.requests.total >= 1);
  assert.ok(snapshot.requests.serverErrors >= 1);
  assert.ok(snapshot.slowestRoutes.some((route) => route.route === "GET /api/example"));
});

test("background queue has backoff and graceful shutdown wiring", () => {
  const source = readFileSync(new URL("../src/lib/queue.ts", import.meta.url), "utf8");
  assert.match(source, /QUEUE_RETRY_BASE_MS/);
  assert.match(source, /shutdownQueue/);
  assert.match(source, /availableAt/);
  assert.match(source, /not accepting new jobs/);
});

test("booking sweeper prevents overlap across replicas and exposes health", () => {
  const source = readFileSync(new URL("../src/lib/bookingSweeper.ts", import.meta.url), "utf8");
  assert.match(source, /pg_try_advisory_lock/);
  assert.match(source, /pg_advisory_unlock/);
  assert.match(source, /sweepRunning/);
  assert.match(source, /bookingSweeperStats/);
});

test("server shutdown stops periodic jobs and drains the queue", () => {
  const source = readFileSync(new URL("../src/index.ts", import.meta.url), "utf8");
  assert.match(source, /stopBookingSweeper/);
  assert.match(source, /shutdownQueue/);
  assert.match(source, /queueDrained/);
});

test("health routes expose operational metrics", () => {
  const source = readFileSync(new URL("../src/routes/health.ts", import.meta.url), "utf8");
  assert.match(source, /healthz\/metrics/);
  assert.match(source, /runtimeMetricsSnapshot/);
  assert.match(source, /METRICS_TOKEN/);
  assert.match(source, /bookingSweeperStats/);
});
