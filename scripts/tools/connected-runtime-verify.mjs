#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = path.resolve(import.meta.dirname, "../..");
const base = String(process.env.CONNECTED_API_BASE_URL || process.argv[2] || "").replace(/\/$/, "");
const timeoutMs = Math.max(2_000, Math.min(60_000, Number(process.env.CONNECTED_TIMEOUT_MS || 20_000)));
const strict = String(process.env.CONNECTED_STRICT || "true").toLowerCase() !== "false";

if (!base) throw new Error("Set CONNECTED_API_BASE_URL or pass the API base URL as the first argument");
if (!/^https:\/\//.test(base) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(base)) {
  throw new Error("Connected runtime verification requires HTTPS unless testing localhost");
}

const checks = [];
const failures = [];
const warnings = [];

function redact(value) {
  if (!value || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(redact);
  const output = {};
  for (const [key, item] of Object.entries(value)) {
    output[key] = /token|secret|password|credential|authorization/i.test(key)
      ? item ? "[configured]" : item
      : redact(item);
  }
  return output;
}

async function request(name, endpoint, options = {}, expectedStatuses = [200]) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = Date.now();
  try {
    const response = await fetch(`${base}${endpoint}`, {
      ...options,
      signal: controller.signal,
      headers: {
        accept: "application/json",
        "user-agent": "athoo-connected-runtime-verifier/1.0",
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
      name,
      endpoint,
      status: response.status,
      ok: expectedStatuses.includes(response.status),
      latencyMs: Date.now() - startedAt,
      body: redact(body),
    };
    checks.push(record);
    if (!record.ok) failures.push(`${name}: HTTP ${response.status}`);
    return { response, body, record };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    failures.push(`${name}: ${message}`);
    checks.push({ name, endpoint, ok: false, latencyMs: Date.now() - startedAt, error: message });
    return { response: null, body: null, record: null };
  } finally {
    clearTimeout(timer);
  }
}

function requireCondition(condition, message, severity = "failure") {
  if (condition) return;
  if (severity === "warning" || !strict) warnings.push(message);
  else failures.push(message);
}

async function login(role, identifier, password, accountRole) {
  if (!identifier || !password) return null;
  const endpoint = role === "admin" ? "/api/auth/admin-login" : "/api/auth/login";
  const result = await request(`${role} login`, endpoint, {
    method: "POST",
    body: JSON.stringify({ identifier, password, ...(accountRole ? { role: accountRole } : {}) }),
  });
  const token = result.body && typeof result.body === "object"
    ? String(result.body.token || result.body.accessToken || "")
    : "";
  requireCondition(Boolean(token), `${role} login did not return an access token`);
  return token || null;
}

const live = await request("liveness", "/api/healthz");
requireCondition(live.body?.status === "ok", "Liveness response did not report status=ok");

const deep = await request("deep readiness", "/api/healthz/deep");
const deepChecks = deep.body?.checks || {};
const release = deep.body?.release || live.body?.release || {};
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
requireCondition(Boolean(release.version), "Deployment health did not expose a release version");
requireCondition(Boolean(release.environment), "Deployment health did not expose a deployment environment");

const expectedVersion = String(process.env.CONNECTED_EXPECTED_RELEASE_VERSION || "").trim();
if (expectedVersion) requireCondition(release.version === expectedVersion, `Release version mismatch: expected ${expectedVersion}, received ${release.version || "missing"}`);
const expectedCommit = String(process.env.CONNECTED_EXPECTED_COMMIT_SHA || "").trim().toLowerCase();
if (expectedCommit) {
  const actualCommit = String(release.commitSha || "").toLowerCase();
  requireCondition(Boolean(actualCommit) && (actualCommit.startsWith(expectedCommit) || expectedCommit.startsWith(actualCommit)), `Release commit mismatch: expected ${expectedCommit}, received ${actualCommit || "missing"}`);
}

const adminOrigin = String(process.env.CONNECTED_ADMIN_ORIGIN || "").trim().replace(/\/$/, "");
if (adminOrigin) {
  const cors = await request("admin CORS preflight", "/api/healthz", {
    method: "OPTIONS",
    headers: {
      origin: adminOrigin,
      "access-control-request-method": "GET",
      "access-control-request-headers": "authorization,content-type",
    },
  }, [200, 204]);
  requireCondition(cors.response?.headers.get("access-control-allow-origin") === adminOrigin, "Admin CORS preflight did not allow the configured admin origin");
} else {
  warnings.push("Admin CORS preflight skipped; set CONNECTED_ADMIN_ORIGIN to verify the deployed allowlist");
}

await request("service categories", "/api/categories");
const publicPolicies = await request("public policy center", "/api/policies?audience=customer");
requireCondition(Array.isArray(publicPolicies.body?.policies) && publicPolicies.body.policies.length >= 2, "Published customer policy center is incomplete");

if (deepChecks.maps?.configured) {
  const tileZ = Number(process.env.CONNECTED_TILE_Z || 6);
  const tileX = Number(process.env.CONNECTED_TILE_X || 44);
  const tileY = Number(process.env.CONNECTED_TILE_Y || 26);
  const tile = await request("map tile", `/api/geo/tiles/${tileZ}/${tileX}/${tileY}.png`);
  const type = String(tile.response?.headers.get("content-type") || "");
  requireCondition(type.startsWith("image/"), `Map tile returned unexpected content type: ${type || "missing"}`);
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
  const query = encodeURIComponent(String(process.env.CONNECTED_LOCATION_QUERY || "Islamabad").trim());
  const search = await request("location search", `/api/geo/search?q=${query}&limit=5&lat=33.6844&lng=73.0479`, { headers: auth });
  requireCondition(Array.isArray(search.body?.results) && search.body.results.length > 0, "Location search returned no results");
  if (search.body?.cacheable === false) warnings.push("Selected geocoder uses temporary results; persistent caching is correctly disabled");

  const reverse = await request("reverse geocoding", "/api/geo/reverse?lat=33.6844&lng=73.0479", { headers: auth });
  requireCondition(typeof reverse.body?.address === "string" && reverse.body.address.length > 4, "Reverse geocoding returned no usable address");

  const directions = await request(
    "road directions",
    "/api/geo/directions?originLat=33.6844&originLng=73.0479&destLat=33.6938&destLng=73.0652",
    { headers: auth },
  );
  requireCondition(Array.isArray(directions.body?.polyline) && directions.body.polyline.length >= 2, "Directions returned no usable polyline");
} else {
  warnings.push("Authenticated map checks skipped because no customer token or credentials were supplied");
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
  const providerMe = await request("provider identity", "/api/auth/me", { headers: providerAuth });
  requireCondition(providerMe.body?.user?.role === "provider", "Provider identity returned the wrong role");
  const providerBroadcasts = await request("provider broadcast eligibility", "/api/broadcast", { headers: providerAuth });
  requireCondition(Array.isArray(providerBroadcasts.body?.requests), "Provider broadcast endpoint did not return a request list");
  requireCondition(providerBroadcasts.body?.eligibility?.eligible !== false, `Controlled provider is not eligible for customer broadcasts: ${providerBroadcasts.body?.eligibility?.reason || "unknown"}`);
  const callConfig = await request("production call configuration", "/api/calls/config", { headers: providerAuth });
  requireCondition(callConfig.body?.productionReady === true && callConfig.body?.hasTurnCredentials === true, `Authenticated call configuration is not production ready: ${callConfig.body?.warning || "TURN missing"}`);
  const providerPolicies = await request("provider policy center", "/api/policies?audience=provider", { headers: providerAuth });
  requireCondition(Array.isArray(providerPolicies.body?.policies) && providerPolicies.body.policies.length >= 2, "Published provider policy center is incomplete");
}

const otpTestPhone = String(process.env.CONNECTED_OTP_TEST_PHONE || "").trim();
if (otpTestPhone) {
  const otpTest = await request("authentication OTP delivery", "/api/auth/send-otp", {
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
  warnings.push("Real authentication OTP delivery skipped; set CONNECTED_OTP_TEST_PHONE only for a controlled registered test account");
}

let adminToken = String(process.env.CONNECTED_ADMIN_TOKEN || "").trim() || null;
if (!adminToken) {
  adminToken = await login(
    "admin",
    process.env.CONNECTED_ADMIN_IDENTIFIER,
    process.env.CONNECTED_ADMIN_PASSWORD,
  );
}

if (adminToken) {
  const adminAuth = { authorization: `Bearer ${adminToken}` };
  await request("admin sidebar counts", "/api/admin/sidebar-counts", { headers: adminAuth });
  const governedPolicies = await request("admin policy governance", "/api/admin/policies", { headers: adminAuth });
  requireCondition(Array.isArray(governedPolicies.body?.policies) && governedPolicies.body.policies.length >= 2, "Admin policy governance returned no policy documents");
  await request("admin inactive account queue", "/api/admin/inactive-accounts?limit=1", { headers: adminAuth });
}

if (adminToken && String(process.env.CONNECTED_VERIFY_EMAIL_TRANSPORT || "true").toLowerCase() !== "false") {
  const auth = { authorization: `Bearer ${adminToken}` };
  const transport = await request("email transport verification", "/api/admin/email/verify-transport", { method: "POST", headers: auth });
  requireCondition(transport.body?.ok === true, `Email transport verification failed: ${transport.body?.error || "unknown"}`);

  const testRecipient = String(process.env.CONNECTED_EMAIL_TEST_TO || "").trim();
  if (testRecipient) {
    const testEmail = await request("real test email", "/api/admin/email/test", {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ to: testRecipient }),
    });
    requireCondition(testEmail.body?.ok === true, `Real test email failed: ${testEmail.body?.errorCode || "unknown"}`);
  } else {
    warnings.push("Real test email skipped; set CONNECTED_EMAIL_TEST_TO to explicitly send one");
  }
} else {
  warnings.push("Admin email transport checks skipped because no admin token or credentials were supplied");
}

const evidence = {
  schemaVersion: 2,
  status: failures.length ? "failed" : "passed",
  baseUrl: base,
  strict,
  verifiedAt: new Date().toISOString(),
  summary: { checks: checks.length, failures: failures.length, warnings: warnings.length },
  release: redact(release),
  providers: {
    email: redact(deepChecks.email || null),
    storage: redact(deepChecks.storage || null),
    otpDelivery: redact(deepChecks.otpDelivery || null),
    maps: redact(deepChecks.maps || null),
    push: redact(deepChecks.push || null),
    calls: redact(deepChecks.calls || null),
  },
  failures,
  warnings,
  checks,
};

const outDir = path.join(root, "release-evidence");
fs.mkdirSync(outDir, { recursive: true });
const timestamp = evidence.verifiedAt.replace(/[:.]/g, "-");
const output = path.join(outDir, `connected-runtime-${timestamp}.json`);
fs.writeFileSync(output, JSON.stringify(evidence, null, 2) + "\n", { mode: 0o600 });

if (failures.length) {
  console.error(JSON.stringify({ status: "failed", failures, warnings, evidence: path.relative(root, output) }, null, 2));
  process.exit(1);
}
console.log(JSON.stringify({ status: "passed", warnings, evidence: path.relative(root, output) }, null, 2));
