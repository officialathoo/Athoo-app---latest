import test from "node:test";
import assert from "node:assert/strict";
import { readRepo } from "./helpers/repo.ts";

test("Phase 28.4 upgrades TomTom raster tiles and retries suspicious blank responses", () => {
  const configuration = readRepo("api-server/src/lib/mapConfiguration.ts");
  const geo = readRepo("api-server/src/routes/geo.ts");
  const publicSettings = readRepo("api-server/src/routes/index.ts");
  const mobileConfig = readRepo("athoo-app/app.config.js");

  assert.match(configuration, /maps\/orbis\/display\/raster\/tile/);
  assert.match(configuration, /buildMapTileUpstreamCandidates/);
  assert.match(configuration, /tomtom-orbis-v2/);
  assert.match(configuration, /tomtom-legacy-v1/);
  assert.match(geo, /MAP_TILE_SUSPICIOUS_BYTES/);
  assert.match(geo, /suspiciously small tile/);
  assert.match(geo, /X-Map-Upstream/);
  assert.match(publicSettings, /MAP_TILE_PUBLIC_VERSION/);
  assert.match(publicSettings, /\.png\?v=\$\{publicMapTileVersion\}/);
  assert.match(mobileConfig, /geo\/tiles\/\{z\}\/\{x\}\/\{y\}\.png\?v=2/);
});

test("Phase 28.4 operations inbox degrades per source instead of returning a false empty state", () => {
  const admin = readRepo("api-server/src/routes/admin.ts");
  const page = readRepo("admin-panel/src/pages/OperationsInboxPage.tsx");

  assert.match(admin, /Promise\.allSettled/);
  assert.match(admin, /degradedSources/);
  assert.match(admin, /withAdminWorkTimeout/);
  assert.match(admin, /ADMIN_OPERATIONS_SOURCE_TIMEOUT_MS/);
  assert.match(page, /degradedSources\?: string\[\]/);
  assert.match(page, /Operations data is unavailable/);
  assert.match(page, /perTypeLimit: 20/);
  assert.match(page, /requestSequence/);
});

test("Phase 28.4 reduces admin navigation database round trips", () => {
  const admin = readRepo("api-server/src/routes/admin.ts");
  const sidebarRoute = admin.slice(admin.indexOf('router.get("/sidebar-counts"'), admin.indexOf('// ─── Admin Blacklist'));

  assert.match(sidebarRoute, /const result = await db\.execute/);
  assert.match(sidebarRoute, /SELECT[\s\S]*pending_verifications/);
  assert.doesNotMatch(sidebarRoute, /Promise\.all/);
  assert.doesNotMatch(sidebarRoute, /db\.\$count/);
  assert.match(sidebarRoute, /Server-Timing/);
});

test("Phase 28.4 removes blocked Google Fonts and repairs the admin logo path", () => {
  const index = readRepo("admin-panel/index.html");
  const css = readRepo("admin-panel/src/index.css");
  const sidebar = readRepo("admin-panel/src/components/layout/Sidebar.tsx");

  assert.doesNotMatch(index, /fonts\.googleapis\.com|fonts\.gstatic\.com/);
  assert.match(css, /ui-sans-serif, system-ui/);
  assert.match(sidebar, /src="\/logo\.png"/);
  assert.doesNotMatch(sidebar, /src="\/admin\/logo\.png"/);
});
