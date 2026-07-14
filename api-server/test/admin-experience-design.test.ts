import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

test("admin dashboard uses progressive skeleton loading and a reusable page header", () => {
  const dashboard = read("admin-panel/src/pages/DashboardPage.tsx");
  const skeleton = read("admin-panel/src/components/ui/AdminDashboardSkeleton.tsx");
  const header = read("admin-panel/src/components/ui/AdminPageHeader.tsx");
  assert.match(dashboard, /AdminDashboardSkeleton/);
  assert.match(dashboard, /AdminPageHeader/);
  assert.match(skeleton, /role="status"/);
  assert.match(header, /Operations|eyebrow|description/);
});

test("admin dashboard provides a retryable error state and stable operational selectors", () => {
  const dashboard = read("admin-panel/src/pages/DashboardPage.tsx");
  assert.match(dashboard, /role="alert"/);
  assert.match(dashboard, /Try again/);
  assert.match(dashboard, /admin-dashboard-refresh/);
  assert.match(dashboard, /admin-stat-revenue/);
});

test("shared admin tables use skeleton loading, accessible captions and helpful empty states", () => {
  const table = read("admin-panel/src/components/ui/DataTable.tsx");
  assert.match(table, /Loading table data/);
  assert.match(table, /<caption className="sr-only">/);
  assert.match(table, /emptyDescription/);
  assert.match(table, /scope="col"/);
});
