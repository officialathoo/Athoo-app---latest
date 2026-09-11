import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "../..");

const read = (relative: string) =>
  fs.readFileSync(path.join(root, relative), "utf8").replace(/\r\n?/g, "\n");

test("Phase 30.1C deduplicates provider dashboard focus refreshes", () => {
  const dashboard = read("athoo-app/app/(provider)/(tabs)/dashboard.tsx");

  assert.match(
    dashboard,
    /const PROVIDER_DASHBOARD_BACKGROUND_REFRESH_MS = 60_000/,
  );
  assert.match(
    dashboard,
    /const dashboardRequestInFlightRef = useRef\(false\)/,
  );
  assert.match(
    dashboard,
    /const dashboardLoadedRef = useRef\(false\)/,
  );
  assert.match(
    dashboard,
    /const dashboardLastLoadedAtRef = useRef\(0\)/,
  );
  assert.match(
    dashboard,
    /if \(dashboardRequestInFlightRef\.current\) return/,
  );
  assert.match(
    dashboard,
    /mode: "initial" \| "refresh" \| "background" \| "event"/,
  );
  assert.match(
    dashboard,
    /Date\.now\(\) - dashboardLastLoadedAtRef\.current >=/,
  );
  assert.match(
    dashboard,
    /void loadDashboard\("background"\)/,
  );
  assert.match(
    dashboard,
    /onRefresh=\{\(\) => void loadDashboard\("refresh"\)\}/,
  );
  assert.match(
    dashboard,
    /onPress=\{\(\) => void loadDashboard\("refresh"\)\}/,
  );
  assert.equal(
    (dashboard.match(/loadDashboard\("event"\)/g) || []).length,
    4,
  );
  assert.doesNotMatch(
    dashboard,
    /loadDashboard\((?:true|false)\)/,
  );
});

test("Phase 30.1C preserves dashboard loading, retry and realtime behavior", () => {
  const dashboard = read("athoo-app/app/(provider)/(tabs)/dashboard.tsx");

  assert.match(dashboard, /setDashboardLoading\(true\)/);
  assert.match(dashboard, /setDashboardRefreshing\(true\)/);
  assert.match(dashboard, /setDashboardError\(null\)/);
  assert.match(dashboard, /setDashboard\(response\.dashboard\)/);
  assert.match(dashboard, /setDashboardRefreshing\(false\)/);
  assert.match(dashboard, /setDashboardLoading\(false\)/);
  assert.match(dashboard, /event\?\.type === "provider:availability"/);
  assert.match(dashboard, /event\?\.type === "booking:updated"/);
  assert.match(dashboard, /await api\.updateAvailability\(val\)/);
});