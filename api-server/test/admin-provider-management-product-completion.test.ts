import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const routes = readFileSync(new URL("../src/routes/admin.ts", import.meta.url), "utf8");
const page = readFileSync(new URL("../../admin-panel/src/pages/ProvidersPage.tsx", import.meta.url), "utf8");
const apiClient = readFileSync(new URL("../../admin-panel/src/lib/api.ts", import.meta.url), "utf8");

test("provider verification cannot bypass document-aware workflow", () => {
  assert.match(routes, /Legacy verification toggle is disabled/);
  assert.match(routes, /Required documents are missing or not approved/);
  assert.match(routes, /Use the provider-specific verification, block, or deactivation workflow/);
  assert.doesNotMatch(page, /handleToggleVerify/);
});

test("provider account actions require reasons and revoke unsafe sessions", () => {
  assert.match(routes, /A block reason is required/);
  assert.match(routes, /A deactivation reason is required/);
  assert.match(routes, /provider_blocked_by_admin/);
  assert.match(routes, /provider_deactivated_by_admin/);
  assert.match(routes, /provider_sessions_revoked_by_admin/);
  assert.match(routes, /isAvailable: false/);
});

test("provider management uses dedicated audited workflows", () => {
  assert.match(page, /\/api\/admin\/providers/);
  assert.match(page, /Open Verification Queue/);
  assert.match(page, /Service Requests/);
  assert.match(page, /Rate Requests/);
  assert.match(page, /Force Logout/);
  assert.doesNotMatch(page, /ratePerHour: editForm/);
});

test("private provider documents open with authenticated requests", () => {
  assert.match(apiClient, /openAuthenticatedFile/);
  assert.match(apiClient, /Authorization: `Bearer/);
  assert.match(page, /openAuthenticatedFile\(doc\.url\)/);
});
