import process from "node:process";

const base = String(process.env.SMOKE_API_BASE_URL || process.argv[2] || "").replace(/\/$/, "");
if (!base) throw new Error("Set SMOKE_API_BASE_URL or pass the API base URL as the first argument");
if (!/^https?:\/\//.test(base)) throw new Error("Smoke-test API URL must start with http:// or https://");

const timeoutMs = Number(process.env.SMOKE_TIMEOUT_MS || 15000);
const checks = [
  { name: "liveness", path: "/api/healthz", statuses: [200] },
  { name: "deep readiness", path: "/api/healthz/deep", statuses: [200] },
  { name: "service categories", path: "/api/categories", statuses: [200] },
];

const failures = [];
for (const check of checks) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${base}${check.path}`, {
      signal: controller.signal,
      headers: { "user-agent": "athoo-release-smoke-test/1.0" },
    });
    const body = await response.text();
    if (!check.statuses.includes(response.status)) {
      failures.push(`${check.name}: expected ${check.statuses.join("/")}, received ${response.status}: ${body.slice(0, 300)}`);
    } else {
      console.log(`PASS ${check.name} (${response.status})`);
    }
  } catch (error) {
    failures.push(`${check.name}: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    clearTimeout(timer);
  }
}
if (failures.length) {
  console.error(`Smoke test failed:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log("Athoo deployment smoke test passed.");
