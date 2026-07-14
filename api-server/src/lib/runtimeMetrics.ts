type RouteMetric = { count: number; errors: number; totalMs: number; maxMs: number };

const startedAt = Date.now();
const routes = new Map<string, RouteMetric>();
let activeRequests = 0;
let totalRequests = 0;
let totalErrors = 0;

function routeKey(method: string, path: string): string {
  const clean = (path.split("?")[0] || "/")
    .replace(/\b[0-9a-f]{8}-[0-9a-f-]{27,}\b/gi, ":id")
    .replace(/\/\d+(?=\/|$)/g, "/:id");
  return `${method.toUpperCase()} ${clean}`;
}

export function beginRequest(): () => void {
  activeRequests += 1;
  totalRequests += 1;
  let ended = false;
  return () => {
    if (ended) return;
    ended = true;
    activeRequests = Math.max(0, activeRequests - 1);
  };
}

export function recordRequest(method: string, path: string, statusCode: number, durationMs: number): void {
  const key = routeKey(method, path);
  const current = routes.get(key) || { count: 0, errors: 0, totalMs: 0, maxMs: 0 };
  current.count += 1;
  current.totalMs += durationMs;
  current.maxMs = Math.max(current.maxMs, durationMs);
  if (statusCode >= 500) {
    current.errors += 1;
    totalErrors += 1;
  }
  routes.set(key, current);
}

export function runtimeMetricsSnapshot(limit = 25) {
  const slowest = [...routes.entries()]
    .map(([route, value]) => ({
      route,
      count: value.count,
      errors: value.errors,
      averageMs: Math.round((value.totalMs / Math.max(1, value.count)) * 100) / 100,
      maxMs: Math.round(value.maxMs * 100) / 100,
    }))
    .sort((a, b) => b.averageMs - a.averageMs)
    .slice(0, Math.max(1, Math.min(limit, 100)));

  const memory = process.memoryUsage();
  return {
    startedAt: new Date(startedAt).toISOString(),
    uptimeSeconds: Math.round(process.uptime()),
    requests: { active: activeRequests, total: totalRequests, serverErrors: totalErrors },
    memory: {
      rssBytes: memory.rss,
      heapUsedBytes: memory.heapUsed,
      heapTotalBytes: memory.heapTotal,
      externalBytes: memory.external,
    },
    eventLoop: { utilization: process.resourceUsage().userCPUTime + process.resourceUsage().systemCPUTime },
    slowestRoutes: slowest,
  };
}
