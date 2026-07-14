import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const adminRoutes = fs.readFileSync(new URL("../src/routes/admin.ts", import.meta.url), "utf8");
const dashboard = fs.readFileSync(new URL("../../admin-panel/src/pages/DashboardPage.tsx", import.meta.url), "utf8");
const types = fs.readFileSync(new URL("../../admin-panel/src/lib/types.ts", import.meta.url), "utf8");

test("dashboard provider verification and active-job metrics use operational states", () => {
  assert.match(adminRoutes, /role} = 'provider'/);
  assert.match(adminRoutes, /verificationStatus, "pending"/);
  assert.match(adminRoutes, /acceptedBookings/);
  assert.match(adminRoutes, /inProgressBookings/);
  assert.match(adminRoutes, /activeBookings/);
});

test("dashboard exposes finance and stuck-workflow alerts", () => {
  assert.match(adminRoutes, /pendingWithdrawals/);
  assert.match(adminRoutes, /pendingRefunds/);
  assert.match(adminRoutes, /overdueNegotiations/);
  assert.match(adminRoutes, /staleAcceptedBookings/);
  assert.match(dashboard, /admin-operations-alerts/);
});

test("reports and audit widgets are permission-aware and revenue labels are accurate", () => {
  assert.match(dashboard, /enabled: canViewReports/);
  assert.match(dashboard, /enabled: canViewAudit/);
  assert.match(dashboard, /Completed Job Value/);
  assert.match(dashboard, /Athoo Commission Earned/);
  assert.doesNotMatch(dashboard, /Live Activity Feed/);
  assert.match(types, /completedJobValue: number/);
});
