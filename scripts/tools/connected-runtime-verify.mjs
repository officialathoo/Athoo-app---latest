#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = path.resolve(import.meta.dirname, "../..");
const apiBase = normalizeBase(process.env.CONNECTED_API_BASE_URL || process.argv[2] || "", "API");
const adminBase = normalizeBase(process.env.CONNECTED_ADMIN_ORIGIN || "", "admin", false);
const timeoutMs = boundedNumber(process.env.CONNECTED_TIMEOUT_MS, 20_000, 2_000, 60_000);
const strict = readBoolean("CONNECTED_STRICT", true);
const expectedInstances = boundedNumber(process.env.CONNECTED_EXPECTED_API_INSTANCES, 1, 1, 100);
const maxFailedQueueJobs = boundedNumber(process.env.CONNECTED_MAX_FAILED_QUEUE_JOBS, 0, 0, 1_000_000);

if (!apiBase) throw new Error("Set CONNECTED_API_BASE_URL or pass the API base URL as the first argument");

const checks = [];
const failures = [];
const warnings = [];

function normalizeBase(value, label, required = true) {
  const normalized = String(value || "").trim().replace(/\/+$/, "");
  if (!normalized) {
    if (required) return "";
    return null;
  }
  if (!/^https:\/\//i.test(normalized) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(normalized)) {
    throw new Error(`${label} connected verification requires HTTPS unless testing localhost`);
  }
  return normalized;
}

function boundedNumber(value, fallback, min, max) {
  const parsed = Number(value ?? fallback);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(parsed)));
}

function readBoolean(name, fallback) {
  const value = String(process.env[name] ?? "").trim().toLowerCase();
  if (!value) return fallback;
  if (["true", "1", "yes", "on"].includes(value)) return true;
  if (["false", "0", "no", "off"].includes(value)) return false;
  return fallback;
}

function redact(value) {
  if (!value || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(redact);
  const output = {};
  for (const [key, item] of Object.entries(value)) {
    output[key] = /token|secret|password|credential|authorization|api[_-]?key/i.test(key)
      ? item ? "[configured]" : item
      : redact(item);
  }
  return output;
}

function compactHeaders(headers) {
  const allowed = [
    "cache-control",
    "content-type",
    "content-security-policy",
    "cross-origin-opener-policy",
    "cross-origin-resource-policy",
    "referrer-policy",
    "x-content-type-options",
    "x-frame-options",
    "x-map-provider",
    "x-robots-tag",
  ];
  const output = {};
  for (const name of allowed) {
    const value = headers.get(name);
    if (value) output[name] = value;
  }
  return output;
}

async function requestAt(target, origin, name, endpoint, options = {}, expectedStatuses = [200]) {
  if (!origin) {
    failures.push(`${name}: target origin is not configured`);
    return { response: null, body: null, record: null };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = Date.now();
  try {
    const response = await fetch(`${origin}${endpoint}`, {
      ...options,
      redirect: options.redirect || "follow",
      signal: controller.signal,
      headers: {
        accept: "application/json",
        "user-agent": "athoo-connected-runtime-verifier/2.0",
        ...(options.body ? { "content-type": "application/json" } : {}),
        ...(options.headers || {}),
      },
    });
    const contentType = String(response.headers.get("content-type") || "");
    let body;
    if (contentType.includes("application/json")) {
      body = await response.json().catch(() => ({}));
    } else if (contentType.startsWith("image/")) {
      const bytes = new Uint8Array(await response.arrayBuffer());
      body = { contentType, bytes: bytes.byteLength };
    } else {
      const text = await response.text();
      body = text.length > 4_000 ? `${text.slice(0, 4_000)}…` : text;
    }
    const record = {
      target,
      name,
      endpoint,
      status: response.status,
      ok: expectedStatuses.includes(response.status),
      latencyMs: Date.now() - startedAt,
      headers: compactHeaders(response.headers),
      body: redact(body),
    };
    checks.push(record);
    if (!record.ok) failures.push(`${name}: HTTP ${response.status}`);
    return { response, body, record };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    failures.push(`${name}: ${message}`);
    checks.push({ target, name, endpoint, ok: false, latencyMs: Date.now() - startedAt, error: message });
    return { response: null, body: null, record: null };
  } finally {
    clearTimeout(timer);
  }
}

const apiRequest = (name, endpoint, options, expectedStatuses) =>
  requestAt("api", apiBase, name, endpoint, options, expectedStatuses);
const adminRequest = (name, endpoint, options, expectedStatuses) =>
  requestAt("admin", adminBase, name, endpoint, options, expectedStatuses);

function requireCondition(condition, message, severity = "failure") {
  if (condition) return;
  if (severity === "warning" || !strict) warnings.push(message);
  else failures.push(message);
}

function matchingCommit(actual, expected) {
  const left = String(actual || "").trim().toLowerCase();
  const right = String(expected || "").trim().toLowerCase();
  return Boolean(left && right && (left.startsWith(right) || right.startsWith(left)));
}

async function login(role, identifier, password, accountRole) {
  if (!identifier || !password) return null;
  const endpoint = role === "admin" ? "/api/auth/admin-login" : "/api/auth/login";
  const result = await apiRequest(`${role} login`, endpoint, {
    method: "POST",
    body: JSON.stringify({ identifier, password, ...(accountRole ? { role: accountRole } : {}) }),
  });
  const token = result.body && typeof result.body === "object"
    ? String(result.body.token || result.body.accessToken || "")
    : "";
  requireCondition(Boolean(token), `${role} login did not return an access token`);
  return token || null;
}

const live = await apiRequest("liveness", "/api/healthz");
requireCondition(live.body?.status === "ok", "Liveness response did not report status=ok");

const deep = await apiRequest("deep readiness", "/api/healthz/deep");
const deepChecks = deep.body?.checks || {};
const apiRelease = deep.body?.release || live.body?.release || {};
requireCondition(deep.body?.status === "ok", `Deep health is ${deep.body?.status || "unavailable"}`);
requireCondition(deepChecks.database?.ok === true, "Database deep-health check failed");
requireCondition(deepChecks.migrations?.ok === true, "Database migrations are not current");
requireCondition(deepChecks.maps?.configured === true, `Map services are not configured: ${deepChecks.maps?.error || "unknown"}`);
requireCondition(deepChecks.email?.configured === true, "Transactional email is not configured");
requireCondition(deepChecks.storage?.configured === true, "Object storage is not configured");
requireCondition(deepChecks.storage?.productionSafe !== false, "Object storage is not production safe");
requireCondition(deepChecks.otpDelivery?.configured === true, "No production authentication OTP delivery channel is configured");
requireCondition(deepChecks.otpDelivery?.phoneRegistrationConfigured === true, "No phone-bound registration OTP channel is configured");
requireCondition(deepChecks.push?.configured !== false, "Push provider is not configured", "warning");
requireCondition(deepChecks.calls?.productionReady === true, `Production voice calling is not ready: ${deepChecks.calls?.warning || "TURN configuration missing"}`);
requireCondition(deepChecks.queue?.provider === "postgres", `Durable queue provider is ${deepChecks.queue?.provider || "missing"}, expected postgres`);
requireCondition(deepChecks.queue?.configured === true, "Durable queue is not configured");
requireCondition(deepChecks.queue?.durable === true, "Queue is not reporting durable operation");
requireCondition(deepChecks.queue?.accepting === true && deepChecks.queue?.running === true, "Durable queue worker is not running and accepting jobs");
requireCondition(Number(deepChecks.queue?.failed || 0) <= maxFailedQueueJobs, `Failed queue jobs exceed the allowed threshold (${deepChecks.queue?.failed || 0} > ${maxFailedQueueJobs})`);
requireCondition(deepChecks.cache?.configured === true, `Cache provider is not configured: ${deepChecks.cache?.error || "unknown"}`);
if (expectedInstances > 1) {
  requireCondition(deepChecks.cache?.horizontalScaleSafe === true, `Configured cache is not safe for ${expectedInstances} API instances`);
} else if (deepChecks.cache?.provider === "memory") {
  warnings.push("Memory cache is correctly limited to the declared single API instance; do not scale horizontally without a shared adapter or disabling configurable caches");
}
requireCondition(Boolean(apiRelease.version) && apiRelease.version !== "unversioned", "API deployment did not expose a real release version");
requireCondition(Boolean(apiRelease.environment), "API deployment did not expose a deployment environment");

const expectedVersion = String(process.env.CONNECTED_EXPECTED_RELEASE_VERSION || "").trim();
if (expectedVersion) requireCondition(apiRelease.version === expectedVersion, `API release version mismatch: expected ${expectedVersion}, received ${apiRelease.version || "missing"}`);
const expectedCommit = String(process.env.CONNECTED_EXPECTED_COMMIT_SHA || "").trim().toLowerCase();
if (expectedCommit) requireCondition(matchingCommit(apiRelease.commitSha, expectedCommit), `API release commit mismatch: expected ${expectedCommit}, received ${apiRelease.commitSha || "missing"}`);

let adminRelease = null;
if (adminBase) {
  const adminHtml = await adminRequest("admin application", "/", { headers: { accept: "text/html" } });
  const adminType = String(adminHtml.response?.headers.get("content-type") || "");
  requireCondition(adminType.includes("text/html"), `Admin application returned unexpected content type: ${adminType || "missing"}`);
  const adminHeaders = adminHtml.response?.headers;
  requireCondition(Boolean(adminHeaders?.get("content-security-policy")), "Admin deployment is missing Content-Security-Policy");
  requireCondition(adminHeaders?.get("x-content-type-options")?.toLowerCase() === "nosniff", "Admin deployment is missing X-Content-Type-Options=nosniff");
  requireCondition(adminHeaders?.get("x-frame-options")?.toUpperCase() === "DENY", "Admin deployment is missing X-Frame-Options=DENY");

  const manifest = await adminRequest("admin release manifest", "/release.json");
  adminRelease = manifest.body && typeof manifest.body === "object" ? manifest.body : null;
  requireCondition(adminRelease?.service === "athoo-admin", "Admin release manifest has the wrong or missing service identity");
  requireCondition(Boolean(adminRelease?.version) && adminRelease?.version !== "unversioned", "Admin deployment did not expose a real release version");
  requireCondition(Boolean(adminRelease?.commitSha), "Admin deployment did not expose its Git commit");
  requireCondition(String(manifest.response?.headers.get("cache-control") || "").toLowerCase().includes("no-store"), "Admin release manifest is cacheable and may report stale deployment identity");
  requireCondition(adminRelease?.version === apiRelease.version, `API/admin release version mismatch: API ${apiRelease.version || "missing"}, admin ${adminRelease?.version || "missing"}`);
  requireCondition(matchingCommit(adminRelease?.commitSha, apiRelease.commitSha), `API/admin Git commit mismatch: API ${apiRelease.commitSha || "missing"}, admin ${adminRelease?.commitSha || "missing"}`);
  if (expectedVersion) requireCondition(adminRelease?.version === expectedVersion, `Admin release version mismatch: expected ${expectedVersion}, received ${adminRelease?.version || "missing"}`);
  if (expectedCommit) requireCondition(matchingCommit(adminRelease?.commitSha, expectedCommit), `Admin release commit mismatch: expected ${expectedCommit}, received ${adminRelease?.commitSha || "missing"}`);

  const cors = await apiRequest("admin CORS preflight", "/api/healthz", {
    method: "OPTIONS",
    headers: {
      origin: adminBase,
      "access-control-request-method": "GET",
      "access-control-request-headers": "authorization,content-type",
    },
  }, [200, 204]);
  requireCondition(cors.response?.headers.get("access-control-allow-origin") === adminBase, "Admin CORS preflight did not allow the deployed admin origin");
} else {
  requireCondition(false, "Admin deployment verification skipped; set CONNECTED_ADMIN_ORIGIN", strict ? "failure" : "warning");
}

await apiRequest("service categories", "/api/categories");
const publicPolicies = await apiRequest("public policy center", "/api/policies?audience=customer");
requireCondition(Array.isArray(publicPolicies.body?.policies) && publicPolicies.body.policies.length >= 2, "Published customer policy center is incomplete");

if (deepChecks.maps?.configured) {
  const tileZ = boundedNumber(process.env.CONNECTED_TILE_Z, 10, 0, 22);
  const tileX = boundedNumber(process.env.CONNECTED_TILE_X, 720, 0, 2 ** tileZ - 1);
  const tileY = boundedNumber(process.env.CONNECTED_TILE_Y, 410, 0, 2 ** tileZ - 1);
  const tile = await apiRequest("map tile", `/api/geo/tiles/${tileZ}/${tileX}/${tileY}.png`);
  const type = String(tile.response?.headers.get("content-type") || "");
  requireCondition(type.startsWith("image/"), `Map tile returned unexpected content type: ${type || "missing"}`);
  requireCondition(Number(tile.body?.bytes || 0) > 0, "Map tile returned an empty image");
}

let userToken = String(process.env.CONNECTED_USER_TOKEN || "").trim() || null;
if (!userToken) {
  userToken = await login(
    "customer",
    process.env.CONNECTED_CUSTOMER_IDENTIFIER,
    process.env.CONNECTED_CUSTOMER_PASSWORD,
    process.env.CONNECTED_CUSTOMER_ROLE || "customer",
  );
}

if (userToken) {
  const auth = { authorization: `Bearer ${userToken}` };
  const query = encodeURIComponent(String(process.env.CONNECTED_LOCATION_QUERY || "Faisal Mosque Islamabad").trim());
  const search = await apiRequest("location search", `/api/geo/search?q=${query}&limit=5&lat=33.6844&lng=73.0479`, { headers: auth });
  requireCondition(Array.isArray(search.body?.results) && search.body.results.length > 0, "Location search returned no results");
  if (search.body?.cacheable === false) warnings.push("Selected geocoder uses temporary results; persistent caching is correctly disabled");

  const reverse = await apiRequest("reverse geocoding", "/api/geo/reverse?lat=33.7295&lng=73.0372", { headers: auth });
  requireCondition(typeof reverse.body?.address === "string" && reverse.body.address.length > 4, "Reverse geocoding returned no usable address");

  const directions = await apiRequest(
    "road directions",
    "/api/geo/directions?originLat=33.6844&originLng=73.0479&destLat=33.7295&destLng=73.0372",
    { headers: auth },
  );
  requireCondition(Array.isArray(directions.body?.polyline) && directions.body.polyline.length >= 2, "Directions returned no usable polyline");
} else {
  requireCondition(false, "Authenticated customer checks skipped because no customer token or credentials were supplied", strict ? "failure" : "warning");
}

let providerToken = String(process.env.CONNECTED_PROVIDER_TOKEN || "").trim() || null;
if (!providerToken) {
  providerToken = await login(
    "provider",
    process.env.CONNECTED_PROVIDER_IDENTIFIER,
    process.env.CONNECTED_PROVIDER_PASSWORD,
    "provider",
  );
}
requireCondition(Boolean(providerToken), "Controlled provider credentials are required for strict connected verification");
if (providerToken) {
  const providerAuth = { authorization: `Bearer ${providerToken}` };
  const providerMe = await apiRequest("provider identity", "/api/auth/me", { headers: providerAuth });
  requireCondition(providerMe.body?.user?.role === "provider", "Provider identity returned the wrong role");
  const providerBroadcasts = await apiRequest("provider broadcast eligibility", "/api/broadcast", { headers: providerAuth });
  requireCondition(Array.isArray(providerBroadcasts.body?.requests), "Provider broadcast endpoint did not return a request list");
  requireCondition(providerBroadcasts.body?.eligibility?.eligible !== false, `Controlled provider is not eligible for customer broadcasts: ${providerBroadcasts.body?.eligibility?.reason || "unknown"}`);
  const callConfig = await apiRequest("production call configuration", "/api/calls/config", { headers: providerAuth });
  requireCondition(callConfig.body?.productionReady === true && callConfig.body?.hasTurnCredentials === true, `Authenticated call configuration is not production ready: ${callConfig.body?.warning || "TURN missing"}`);
  const providerPolicies = await apiRequest("provider policy center", "/api/policies?audience=provider", { headers: providerAuth });
  requireCondition(Array.isArray(providerPolicies.body?.policies) && providerPolicies.body.policies.length >= 2, "Published provider policy center is incomplete");
}

const otpTestPhone = String(process.env.CONNECTED_OTP_TEST_PHONE || "").trim();
if (otpTestPhone) {
  const otpTest = await apiRequest("authentication OTP delivery", "/api/auth/send-otp", {
    method: "POST",
    body: JSON.stringify({
      phone: otpTestPhone,
      purpose: "login",
      role: process.env.CONNECTED_OTP_TEST_ROLE || "customer",
    }),
  });
  requireCondition(otpTest.body?.success === true, `Authentication OTP delivery failed: ${otpTest.body?.code || otpTest.body?.error || "unknown"}`);
  requireCondition(!Object.prototype.hasOwnProperty.call(otpTest.body || {}, "code"), "Production OTP response exposed the verification code");
} else {
  requireCondition(false, "Real authentication OTP delivery skipped; set CONNECTED_OTP_TEST_PHONE for a controlled registered test account", strict ? "failure" : "warning");
}

let adminToken = String(process.env.CONNECTED_ADMIN_TOKEN || "").trim() || null;
if (!adminToken) {
  adminToken = await login(
    "admin",
    process.env.CONNECTED_ADMIN_IDENTIFIER,
    process.env.CONNECTED_ADMIN_PASSWORD,
  );
}
requireCondition(Boolean(adminToken), "Controlled administrator credentials are required for strict connected verification");

let integrationStatus = null;
if (adminToken) {
  const adminAuth = { authorization: `Bearer ${adminToken}` };
  await apiRequest("admin sidebar counts", "/api/admin/sidebar-counts", { headers: adminAuth });
  const governedPolicies = await apiRequest("admin policy governance", "/api/admin/policies", { headers: adminAuth });
  requireCondition(Array.isArray(governedPolicies.body?.policies) && governedPolicies.body.policies.length >= 2, "Admin policy governance returned no policy documents");
  await apiRequest("admin inactive account queue", "/api/admin/inactive-accounts?limit=1", { headers: adminAuth });

  const integrations = await apiRequest("admin integration status", "/api/admin/settings/integrations/status", { headers: adminAuth });
  integrationStatus = integrations.body;
  const configured = integrations.body?.integrations || {};
  for (const name of ["maps", "email", "push", "otp", "storage", "calls", "queue", "cache"]) {
    requireCondition(configured[name]?.configured === true, `Admin integration status reports ${name} as unconfigured: ${configured[name]?.error || "unknown"}`);
  }
  requireCondition(configured.storage?.productionSafe === true, "Admin integration status reports storage as not production safe");
  requireCondition(configured.queue?.durable === true, "Admin integration status reports a non-durable queue");
  if (expectedInstances > 1) requireCondition(configured.cache?.horizontalScaleSafe === true, "Admin integration status reports cache as unsafe for horizontal scaling");

  if (readBoolean("CONNECTED_VERIFY_STORAGE", true)) {
    const storageTest = await apiRequest("storage provider connectivity", "/api/admin/settings/integrations/storage/test", { method: "POST", headers: adminAuth });
    requireCondition(storageTest.body?.ok === true, `Storage provider connectivity failed: ${storageTest.body?.error || "unknown"}`);
  }

  if (readBoolean("CONNECTED_VERIFY_MAP_PROVIDERS", true)) {
    const mapTest = await apiRequest("map provider connectivity", "/api/admin/settings/maps/test", { method: "POST", headers: adminAuth });
    requireCondition(mapTest.body?.status?.configured === true, "Map provider connectivity did not report configured status");
  }

  if (readBoolean("CONNECTED_VERIFY_EMAIL_TRANSPORT", true)) {
    const transport = await apiRequest("email transport verification", "/api/admin/email/verify-transport", { method: "POST", headers: adminAuth });
    requireCondition(transport.body?.ok === true, `Email transport verification failed: ${transport.body?.error || "unknown"}`);

    const testRecipient = String(process.env.CONNECTED_EMAIL_TEST_TO || "").trim();
    if (testRecipient) {
      const testEmail = await apiRequest("real test email", "/api/admin/email/test", {
        method: "POST",
        headers: adminAuth,
        body: JSON.stringify({ to: testRecipient }),
      });
      requireCondition(testEmail.body?.ok === true, `Real test email failed: ${testEmail.body?.errorCode || "unknown"}`);
    } else {
      requireCondition(false, "Real test email skipped; set CONNECTED_EMAIL_TEST_TO", strict ? "failure" : "warning");
    }
  }
}

warnings.push("Actual Expo push receipt, notification sound, background/killed-state deep link, and two-way media transfer remain physical-device evidence and are not claimed by this HTTP verifier");

const evidence = {
  schemaVersion: 3,
  status: failures.length ? "failed" : "passed",
  apiBaseUrl: apiBase,
  adminBaseUrl: adminBase,
  strict,
  expectedInstances,
  verifiedAt: new Date().toISOString(),
  summary: { checks: checks.length, failures: failures.length, warnings: warnings.length },
  release: {
    api: redact(apiRelease),
    admin: redact(adminRelease),
  },
  providers: {
    email: redact(deepChecks.email || null),
    storage: redact(deepChecks.storage || null),
    otpDelivery: redact(deepChecks.otpDelivery || null),
    maps: redact(deepChecks.maps || null),
    push: redact(deepChecks.push || null),
    calls: redact(deepChecks.calls || null),
    queue: redact(deepChecks.queue || null),
    cache: redact(deepChecks.cache || null),
  },
  adminIntegrationStatus: redact(integrationStatus),
  failures,
  warnings,
  checks,
};

const outDir = path.join(root, "release-evidence");
fs.mkdirSync(outDir, { recursive: true });
const timestamp = evidence.verifiedAt.replace(/[:.]/g, "-");
const output = path.join(outDir, `connected-runtime-${timestamp}.json`);
fs.writeFileSync(output, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });

if (failures.length) {
  console.error(JSON.stringify({ status: "failed", failures, warnings, evidence: path.relative(root, output) }, null, 2));
  process.exit(1);
}
console.log(JSON.stringify({ status: "passed", warnings, evidence: path.relative(root, output) }, null, 2));
