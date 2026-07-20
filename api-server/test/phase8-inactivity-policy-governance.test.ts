import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveAdminNotificationLink } from "../../admin-panel/src/lib/adminNotificationRouting.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const read = (relative: string) => fs.readFileSync(path.join(root, relative), "utf8");

test("inactivity lifecycle is configurable, staged, and never auto-deletes accounts", () => {
  const lifecycle = read("api-server/src/lib/inactivityLifecycle.ts");
  const settings = read("api-server/src/lib/admin.ts");
  assert.match(lifecycle, /warnInactiveUser/);
  assert.match(lifecycle, /restrictInactiveUser/);
  assert.match(lifecycle, /markForReview/);
  assert.match(lifecycle, /Permanent deletion is not automatic/);
  assert.doesNotMatch(lifecycle, /delete\(usersTable\)/);
  assert.match(settings, /inactivityLifecycleEnabled/);
  assert.match(settings, /inactivityWarningDays/);
  assert.match(settings, /inactivityRestrictionDays/);
  assert.match(settings, /inactivityReviewDays/);
});

test("user activity safely clears inactivity state without silently re-enabling providers", () => {
  const lifecycle = read("api-server/src/lib/inactivityLifecycle.ts");
  assert.match(lifecycle, /recordUserActivity/);
  assert.match(lifecycle, /inactivityState: "active"/);
  assert.match(lifecycle, /Turn availability on when you are ready/);
  const activityBlock = lifecycle.slice(lifecycle.indexOf("export async function recordUserActivity"), lifecycle.indexOf("function dayCutoff"));
  assert.doesNotMatch(activityBlock, /isAvailable: true/);
});

test("database migration stores lifecycle state and versioned bilingual policies", () => {
  const migration = read("deploy/migrations/20260716_workflow_inactivity_policy_governance.sql");
  const schema = read("lib/db/src/schema/index.ts");
  assert.match(migration, /ADD COLUMN IF NOT EXISTS last_active_at/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS policy_documents/);
  assert.match(migration, /account-deletion-retention-policy/);
  assert.match(migration, /Permanent deletion is (?:intentionally )?never automatic/);
  assert.match(schema, /inactivityState: text\("inactivity_state"\)/);
  assert.match(schema, /policyDocumentsTable/);
  assert.match(read("lib/db/src/migrations.ts"), /20260720_release_phase28_professional_workflow_integrity\.sql/);
});

test("admin inactivity queue supports audited review actions and exact notification routing", () => {
  const routes = read("api-server/src/routes/inactivity.ts");
  const page = read("admin-panel/src/pages/InactiveAccountsPage.tsx");
  assert.match(routes, /requirePermission\("users\.read"\)/);
  assert.match(routes, /requirePermission\("settings\.write"\)/);
  assert.match(routes, /inactive_account_deactivated/);
  assert.match(routes, /revokeAllUserSessions/);
  assert.match(page, /Inactivity never causes automatic permanent deletion/);
  assert.match(page, /query\.search|URLSearchParams/);
  assert.equal(resolveAdminNotificationLink({ link: "/admin/inactive-accounts?focus=user-1" }), "/inactive-accounts?focus=user-1");
});

test("policy API is public-read, admin-governed, validated, audited, and version safe", () => {
  const routes = read("api-server/src/routes/policies.ts");
  assert.match(routes, /publicRouter\.get\("\/"/);
  assert.match(routes, /publicRouter\.get\("\/:slug"/);
  assert.match(routes, /adminRouter\.use\(requireAuth, requireAdmin\)/);
  assert.match(routes, /requirePermission\("settings\.write"\)/);
  assert.match(routes, /Required-acceptance policy version must match/);
  assert.match(routes, /policy_updated/);
  assert.match(routes, /isPublished: false/);
});

test("admin policy center edits bilingual drafts and requires explicit publication", () => {
  const page = read("admin-panel/src/pages/PolicyGovernancePage.tsx");
  const app = read("admin-panel/src/App.tsx");
  const sidebar = read("admin-panel/src/components/layout/Sidebar.tsx");
  assert.match(page, /English content/);
  assert.match(page, /Urdu content/);
  assert.match(page, /Saving changes unpublishes/);
  assert.match(page, /Publish/);
  assert.match(app, /path="\/policies"/);
  assert.match(sidebar, /Policy Center/);
});

test("mobile policy center consumes published versions with offline cache and legal fallback", () => {
  const api = read("athoo-app/services/api.ts");
  const center = read("athoo-app/components/screens/PolicyCenterScreen.tsx");
  const detail = read("athoo-app/components/screens/DynamicPolicyDocumentScreen.tsx");
  const privacy = read("athoo-app/app/legal/privacy.tsx");
  assert.match(api, /getPolicies/);
  assert.match(api, /getPolicy/);
  assert.match(center, /AsyncStorage\.setItem/);
  assert.match(center, /audience/);
  assert.match(detail, /athoo_policy_document_v1/);
  assert.match(detail, /fallback/);
  assert.match(privacy, /LegalDocumentScreen/);
});

test("admin and mobile navigation expose policy and lifecycle destinations", () => {
  const app = read("admin-panel/src/App.tsx");
  const privacy = read("athoo-app/components/screens/PrivacySecurityScreen.tsx");
  const legalLayout = read("athoo-app/app/legal/_layout.tsx");
  assert.match(app, /path="\/inactive-accounts"/);
  assert.match(app, /path="\/policies"/);
  assert.match(privacy, /Policy center/);
  assert.match(legalLayout, /name="\[slug\]"/);
  assert.equal(resolveAdminNotificationLink({ link: "/admin/policies" }), "/policies");
});

test("accessibility provides skip navigation, focus visibility, reduced motion, and labelled menus", () => {
  const app = read("admin-panel/src/App.tsx");
  const css = read("admin-panel/src/index.css");
  const sidebar = read("admin-panel/src/components/layout/Sidebar.tsx");
  const mobile = read("athoo-app/components/screens/PolicyCenterScreen.tsx");
  assert.match(app, /className="skip-link"/);
  assert.match(app, /id="admin-main-content"/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(sidebar, /aria-expanded/);
  assert.match(sidebar, /aria-controls/);
  assert.match(mobile, /accessibilityRole="button"/);
  assert.match(mobile, /accessibilityHint/);
});
