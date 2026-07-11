#!/usr/bin/env node

const baseUrl = String(process.env.PERF_API_BASE_URL || "http://127.0.0.1:5000").replace(/\/$/, "");
const concurrency = Math.min(100, Math.max(1, Number(process.env.PERF_CONCURRENCY || 10)));
const requestsPerRoute = Math.min(5000, Math.max(1, Number(process.env.PERF_REQUESTS_PER_ROUTE || 50)));
const p95LimitMs = Math.max(50, Number(process.env.PERF_P95_LIMIT_MS || 750));
const errorRateLimit = Math.max(0, Math.min(1, Number(process.env.PERF_ERROR_RATE_LIMIT || 0.01)));
const token = String(process.env.PERF_ACCESS_TOKEN || "").trim();
const routes = String(process.env.PERF_ROUTES || "/api/health,/api/categories,/api/settings/public")
  .split(",").map((value) => value.trim()).filter(Boolean);

if (!routes.length) throw new Error("PERF_ROUTES must include at least one route");
if (!/^https:\/\//.test(baseUrl) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(baseUrl)) {
  throw new Error("Remote performance targets must use HTTPS");
}

const headers = token ? { Authorization: `Bearer ${token}` } : {};
const results = [];

function percentile(values, fraction) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)];
}

async function runRoute(path) {
  const latencies = [];
  let errors = 0;
  let index = 0;
  const started = performance.now();
  async function worker() {
    while (true) {
      const current = index++;
      if (current >= requestsPerRoute) return;
      const requestStarted = performance.now();
      try {
        const response = await fetch(`${baseUrl}${path}`, { headers, signal: AbortSignal.timeout(10_000) });
        await response.arrayBuffer();
        if (!response.ok) errors += 1;
      } catch {
        errors += 1;
      } finally {
        latencies.push(performance.now() - requestStarted);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, requestsPerRoute) }, worker));
  const durationMs = performance.now() - started;
  return {
    path,
    requests: requestsPerRoute,
    errors,
    errorRate: errors / requestsPerRoute,
    p50Ms: Math.round(percentile(latencies, 0.5)),
    p95Ms: Math.round(percentile(latencies, 0.95)),
    p99Ms: Math.round(percentile(latencies, 0.99)),
    requestsPerSecond: Math.round((requestsPerRoute / Math.max(0.001, durationMs / 1000)) * 100) / 100,
  };
}

for (const route of routes) results.push(await runRoute(route));
console.table(results);
const failed = results.filter((result) => result.p95Ms > p95LimitMs || result.errorRate > errorRateLimit);
if (failed.length) {
  console.error(JSON.stringify({ status: "failed", p95LimitMs, errorRateLimit, failed }, null, 2));
  process.exit(1);
}
console.log(JSON.stringify({ status: "passed", baseUrl, concurrency, requestsPerRoute, p95LimitMs, errorRateLimit, results }, null, 2));
