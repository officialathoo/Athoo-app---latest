import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readRepo } from "./helpers/repo.ts";

test("mobile build profiles remain deployment and vendor configurable", () => {
  const rootEas = readRepo("eas.json");
  const appEas = readRepo("athoo-app/eas.json");
  assert.equal(rootEas, appEas);
  assert.doesNotMatch(rootEas, /athoo-api\.onrender\.com|EXPO_PUBLIC_API_BASE_URL|EXPO_PUBLIC_MAP_PROVIDER|EAS_PROJECT_ID/);
  const appConfig = readRepo("athoo-app/app.config.js");
  assert.match(appConfig, /readEnv\(\s*"EAS_PROJECT_ID"/);
  assert.doesNotMatch(appConfig, /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i);
  assert.match(appConfig, /projectId:\s*easProjectId/);
});

test("storage verifies actual objects and callers declare private evidence scope", () => {
  const storage = readRepo("api-server/src/routes/storage.ts");
  assert.match(storage, /actualPolicyError = validateUploadPolicy/);
  assert.match(storage, /size: metadata\.contentLength/);
  assert.match(storage, /await provider\.deleteObject\(objectPath\)/);
  assert.match(storage, /scope\?: "private" \| "shared"/);
  for (const file of [
    "athoo-app/components/screens/ContactSupportScreen.tsx",
    "athoo-app/app/auth/provider-register.tsx",
    "athoo-app/app/(provider)/verification-documents.tsx",
    "athoo-app/app/(customer)/subscription.tsx",
    "athoo-app/app/(provider)/subscription.tsx",
    "athoo-app/app/(provider)/pay-commission.tsx",
  ]) {
    assert.match(readRepo(file), /"private"/);
  }
});

test("mobile errors and call alerts never expose raw server diagnostics", () => {
  const api = readRepo("athoo-app/services/api.ts");
  const errors = readRepo("athoo-app/lib/apiError.ts");
  const calls = readRepo("athoo-app/context/CallContext.tsx");
  assert.match(api, /Object\.assign\(safeError, \{ status: response\.status/);
  assert.doesNotMatch(api, /JSON\.stringify\(data\).*throw|responseDetails/);
  assert.match(errors, /explicitStatus/);
  assert.match(calls, /apiErrorToMessage\(err/);
  assert.match(calls, /apiErrorToMessage\(error/);
});

test("admin route and API permissions protect sensitive operations", () => {
  const app = readRepo("admin-panel/src/App.tsx");
  const sidebar = readRepo("admin-panel/src/components/layout/Sidebar.tsx");
  const leads = readRepo("api-server/src/routes/leads.ts");
  const contacts = readRepo("api-server/src/routes/emergency-contacts.ts");
  const reports = readRepo("api-server/src/routes/report-issues.ts");
  assert.match(app, /SuperAdminGuard/);
  assert.match(app, /path="\/admin-users"/);
  assert.match(app, /path="\/blacklist"/);
  assert.match(app, /GuardAny/);
  assert.match(sidebar, /superAdminOnly/);
  assert.match(leads, /requirePermission\("users\.read"\)/);
  assert.match(leads, /requirePermission\("users\.write"\)/);
  assert.match(contacts, /requirePermission\("settings\.read"\)/);
  assert.match(reports, /requirePermission\("support\.read"\)/);
});

test("realtime connections are bounded and cannot outlive call state", () => {
  const ws = readRepo("api-server/src/ws.ts");
  const sessions = readRepo("api-server/src/lib/sessionConnections.ts");
  assert.match(sessions, /WS_MAX_CONNECTIONS_PER_SESSION/);
  assert.match(sessions, /return null/);
  assert.match(ws, /ACTIVE_CALL_STATUSES/);
  assert.match(ws, /call_forbidden_or_inactive/);
  assert.match(ws, /too_many_realtime_connections/);
  assert.match(ws, /additionalValidation/);
  assert.match(ws, /makeCleanup/);
});

test("print and spreadsheet exports neutralize injected content", () => {
  const invoices = readRepo("admin-panel/src/pages/InvoicesPage.tsx");
  const csv = readRepo("admin-panel/src/lib/csv.ts");
  const leads = readRepo("api-server/src/routes/leads.ts");
  assert.match(invoices, /escapeHtml\(inv\.customerName\)/);
  assert.match(invoices, /document\.createElement\("iframe"\)/);
  assert.match(invoices, /frame\.srcdoc = buildInvoiceHtml\(inv\)/);
  assert.doesNotMatch(invoices, /<script>window\.onload/);
  assert.match(csv, /\[=\+@-\]/);
  assert.match(leads, /csvCell/);
  assert.equal(leads.includes('replace(/\\r?\\n/g, " ")'), true);
  assert.match(leads, /escapeHtml/);
});

test("web and local deployment blueprints use hardened defaults", () => {
  const vercel = readRepo("vercel.json");
  const nginx = readRepo("deploy/nginx/admin.conf");
  const compose = readRepo("docker-compose.yml");
  assert.match(vercel, /Content-Security-Policy/);
  assert.match(nginx, /Content-Security-Policy/);
  assert.match(compose, /127\.0\.0\.1:/);
  assert.doesNotMatch(compose, /redis:\s*\n/);
  assert.doesNotMatch(compose, /athoo_password/);
});

test("broad raw-user production routes and raw verification users are absent", () => {
  assert.equal(existsSync(new URL("../src/routes/production.ts", import.meta.url)), false);
  const email = readRepo("api-server/src/routes/email.ts");
  assert.match(email, /returning\(\{/);
  assert.match(email, /returning\(\{[\s\S]*emailVerified: usersTable\.emailVerified/);
  assert.doesNotMatch(email, /returning\(\)[\s\S]{0,120}user: updated/);
  const safe = readRepo("api-server/src/lib/admin.ts");
  assert.match(safe, /expoPushToken/);
  assert.match(safe, /adminFailedLoginCount/);
});

test("public identifiers use cryptographic randomness when a source id is unavailable", () => {
  assert.match(readRepo("api-server/src/lib/publicIds.ts"), /randomUUID/);
  assert.match(readRepo("api-server/src/routes/bookings.ts"), /crypto\.randomInt\(10000, 100000\)/);
  assert.match(readRepo("api-server/src/routes/broadcast.ts"), /crypto\.randomInt\(10000, 100000\)/);
  assert.match(readRepo("api-server/src/routes/negotiations.ts"), /crypto\.randomInt\(10000, 100000\)/);
});

test("HTTP and WebSocket resource limits are deployment controlled", () => {
  const index = readRepo("api-server/src/index.ts");
  const env = readRepo(".env.production.example");
  const render = readRepo("render.yaml");
  assert.match(index, /timeoutFromEnv/);
  assert.match(index, /headersTimeoutMs/);
  for (const key of ["SERVER_REQUEST_TIMEOUT_MS", "SERVER_HEADERS_TIMEOUT_MS", "SERVER_KEEP_ALIVE_TIMEOUT_MS", "WS_MAX_PAYLOAD_BYTES", "WS_MAX_CONNECTIONS_PER_SESSION"]) {
    assert.match(env, new RegExp(key));
    assert.match(render, new RegExp(`key: ${key}`));
  }
});
