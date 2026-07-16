import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveAdminNotificationLink } from "../../admin-panel/src/lib/adminNotificationRouting.ts";
import { canonicalAdminPermission } from "../src/lib/adminPermissions.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const read = (relative: string) => fs.readFileSync(path.join(root, relative), "utf8");

test("admin notification links open exact operational destinations", () => {
  assert.equal(resolveAdminNotificationLink({ link: "/admin/subscriptions/sub-1" }), "/plans?tab=subs&status=pending&focus=sub-1");
  assert.equal(resolveAdminNotificationLink({ link: "/admin/support/ticket-1" }), "/complaints?focus=ticket-1");
  assert.equal(resolveAdminNotificationLink({ link: "/admin/payments/pay-1" }), "/commission?status=pending&focus=pay-1");
  assert.equal(resolveAdminNotificationLink({ link: "/admin/requests?tab=deletions&status=pending&focus=delete-1" }), "/requests?tab=deletions&status=pending&focus=delete-1");
});

test("unsafe admin links are rejected and type fallback stays internal", () => {
  assert.equal(resolveAdminNotificationLink({ link: "javascript:alert(1)" }), null);
  assert.equal(resolveAdminNotificationLink({ link: "https://evil.example/path", type: "support" }), "/complaints");
  assert.equal(resolveAdminNotificationLink({ link: "https://evil.example/users" }), null);
});

test("legacy admin permission aliases resolve to canonical API permissions", () => {
  assert.equal(canonicalAdminPermission("support.write"), "complaints.write");
  assert.equal(canonicalAdminPermission("providers.write"), "verification.write");
  assert.equal(canonicalAdminPermission("operations.read"), "bookings.read");
});

test("admin notifications are stored and emitted through one helper", () => {
  const helper = read("api-server/src/lib/adminNotifications.ts");
  assert.match(helper, /db\.insert\(adminNotificationsTable\)/);
  assert.match(helper, /emitToRole\("admin", "notification:new"/);
  for (const file of ["account.ts", "subscriptions.ts", "payments.ts", "leads.ts"]) {
    assert.match(read(`api-server/src/routes/${file}`), /createAdminNotification/);
  }
});

test("support evidence is represented in schema and migration", () => {
  assert.match(read("lib/db/src/schema/index.ts"), /mediaUrls:\s*jsonb\("media_urls"\)/);
  const migration = read("deploy/migrations/20260716_support_premium_admin_integrity.sql");
  assert.match(migration, /ADD COLUMN IF NOT EXISTS media_urls JSONB/);
  assert.match(migration, /support_tickets_status_priority_created_idx/);
});

test("support admin API validates focus, resolution, assignment, and missing tickets", () => {
  const source = read("api-server/src/routes/admin.ts");
  assert.match(source, /const focus = String\(req\.query\.focus/);
  assert.match(source, /A clear resolution note of at least 10 characters is required/);
  assert.match(source, /Support ticket not found/);
  assert.match(source, /Assigned administrator is not active/);
  assert.match(source, /assignedToName/);
});

test("support creation validates ownership and persists media evidence", () => {
  const source = read("api-server/src/routes/support.ts");
  assert.match(source, /mediaUrls/);
  assert.match(source, /or\(eq\(bookingsTable\.customerId, userId\), eq\(bookingsTable\.providerId, userId\)\)/);
  assert.match(source, /createAdminNotification/);
  assert.match(source, /\/admin\/support\/\$\{ticket\.id\}/);
});

test("subscription review API returns user and plan context", () => {
  const source = read("api-server/src/routes/subscriptions.ts");
  assert.match(source, /userName: usersTable\.name/);
  assert.match(source, /userPhone: usersTable\.phone/);
  assert.match(source, /planName: subscriptionPlansTable\.name/);
  assert.match(source, /adminRouter\.get\("\/:id"/);
});

test("admin pages consume focus links and authenticated evidence", () => {
  const subscriptions = read("admin-panel/src/pages/SubscriptionPlansPage.tsx");
  const complaints = read("admin-panel/src/pages/ComplaintsPage.tsx");
  const requests = read("admin-panel/src/pages/RequestsPage.tsx");
  const commission = read("admin-panel/src/pages/CommissionPaymentsPage.tsx");
  const users = read("admin-panel/src/pages/UsersPage.tsx");
  const providers = read("admin-panel/src/pages/ProvidersPage.tsx");
  const leads = read("admin-panel/src/pages/LeadsPage.tsx");
  const bookings = read("admin-panel/src/pages/BookingsPage.tsx");
  const negotiations = read("admin-panel/src/pages/NegotiationsPage.tsx");
  const refunds = read("admin-panel/src/pages/RefundsPage.tsx");
  const withdrawals = read("admin-panel/src/pages/WithdrawalsPage.tsx");
  const verification = read("admin-panel/src/pages/VerificationPage.tsx");
  const rates = read("admin-panel/src/pages/RateRequestsPage.tsx");
  const reportedIssues = read("admin-panel/src/pages/ReportedIssuesPage.tsx");
  assert.match(subscriptions, /query\.get\("focus"\)/);
  assert.match(subscriptions, /userName \|\| "Unknown user"/);
  assert.match(complaints, /openAuthenticatedFile/);
  assert.match(complaints, /tickets\.find\(\(ticket\) => ticket\.id === focusId\)/);
  assert.match(requests, /openAuthenticatedFile/);
  assert.match(requests, /data-focus-id/);
  assert.match(commission, /query\.get\("focus"\)/);
  assert.match(users, /`\/api\/admin\/users\/\$\{focusId\}`/);
  assert.match(providers, /`\/api\/admin\/users\/\$\{focusId\}`/);
  assert.match(leads, /lead\.id === focusId/);
  assert.match(bookings, /`\/api\/admin\/bookings\/\$\{focusId\}\/operations`/);
  assert.match(negotiations, /useState\(focusId\)/);
  assert.match(refunds, /refund\.id === focusId/);
  assert.match(withdrawals, /withdrawal\.id === focusId/);
  assert.match(verification, /`\/api\/admin\/users\/\$\{focusId\}`/);
  assert.match(rates, /request\.id === focusId/);
  assert.match(reportedIssues, /report\.id === focusId/);
});

test("account deletion notifications route to the exact deletion request", () => {
  const source = read("api-server/src/routes/account.ts");
  assert.match(source, /`\/admin\/requests\?tab=deletions&status=pending&focus=\$\{newId\}`/);
});

test("sidebar counts represent their actual queues", () => {
  const api = read("api-server/src/routes/admin.ts");
  const sidebar = read("admin-panel/src/components/layout/Sidebar.tsx");
  assert.match(api, /pendingServiceRequests/);
  assert.match(api, /pendingDeletionRequests/);
  assert.match(api, /inArray\(supportTicketsTable\.status, \["open", "in_progress"\]\)/);
  assert.match(sidebar, /pendingServiceRequests.*pendingDeletionRequests/s);
  assert.match(sidebar, /"\/complaints": sidebarCounts\?\.openSupportTickets/);
  assert.match(sidebar, /\/plans\?tab=subs&status=pending/);
});
