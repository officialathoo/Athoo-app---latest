import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path: string) => fs.readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

test("admin icon picker is searchable, explicit and bundle-safe", () => {
  const picker = read("admin-panel/src/components/admin/IconPicker.tsx");
  const categories = read("admin-panel/src/pages/CategoriesPage.tsx");
  assert.match(picker, /ADMIN_ICON_OPTIONS/);
  assert.match(picker, /Search icons by name or purpose/);
  assert.doesNotMatch(picker, /import \* as/);
  assert.ok((picker.match(/icon\("/g) || []).length >= 80, "expected a broad explicit icon catalog");
  assert.match(categories, /<IconPicker value=\{icon\}/);
});

test("advanced color controls support HEX RGB HSL and gradients", () => {
  const colorPicker = read("admin-panel/src/components/admin/AdvancedColorPicker.tsx");
  const categories = read("admin-panel/src/pages/CategoriesPage.tsx");
  const marketing = read("admin-panel/src/pages/MarketingPage.tsx");
  assert.match(colorPicker, /"hex" \| "rgb" \| "hsl"/);
  assert.match(colorPicker, /AdvancedGradientPicker/);
  assert.match(categories, /AdvancedColorPicker/);
  assert.match(marketing, /AdvancedGradientPicker/);
});

test("banner category relationship is live and searchable", () => {
  const marketing = read("admin-panel/src/pages/MarketingPage.tsx");
  assert.match(marketing, /api<\{ categories: CategoryOption\[\] \}>\("\/api\/admin\/categories"\)/);
  assert.match(marketing, /SearchableSelect/);
  assert.match(marketing, /placeholder="Select a live category"/);
  assert.doesNotMatch(marketing, /placeholder=\{form\.linkType === "category" \? "plumber"/);
});

test("broadcast quick content is database managed instead of hardcoded", () => {
  const page = read("admin-panel/src/pages/BroadcastsPage.tsx");
  const routes = read("api-server/src/routes/admin.ts");
  assert.doesNotMatch(page, /const TEMPLATES\s*=/);
  assert.match(page, /\/api\/admin\/broadcast-templates/);
  assert.match(page, /useQuery/);
  assert.match(routes, /router\.get\("\/broadcast-templates", requirePermission\("broadcasts\.read"\)/);
  assert.match(routes, /notificationTemplatesTable\.isActive/);
  assert.match(routes, /notificationTemplatesTable\.channel, "push"/);
});

test("core customer provider and verification lists expose safe bulk actions", () => {
  const users = read("admin-panel/src/pages/UsersPage.tsx");
  const providers = read("admin-panel/src/pages/ProvidersPage.tsx");
  const verification = read("admin-panel/src/pages/VerificationPage.tsx");
  for (const source of [users, providers, verification]) {
    assert.match(source, /BulkActionBar/);
    assert.match(source, /selectedIds/);
    assert.match(source, /type="checkbox"/);
    assert.match(source, /Promise\.allSettled/);
  }
  assert.match(users, /Force logout/);
  assert.match(providers, /revoke-sessions/);
  assert.match(verification, /Mark in process/);
  assert.doesNotMatch(verification, /Approve selected/);
});
