import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../..");
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

test("category discovery metadata is admin-managed and migrated", () => {
  const schema = read("lib/db/src/schema/index.ts");
  const route = read("api-server/src/routes/categories.ts");
  const admin = read("admin-panel/src/pages/CategoriesPage.tsx");
  const migration = read("deploy/migrations/20260711_search_category_intelligence.sql");
  assert.match(schema, /searchKeywords: text\("search_keywords"\)/);
  assert.match(schema, /isFeatured: boolean\("is_featured"\)/);
  assert.match(route, /requirePermission\("marketing.write"\)/);
  assert.match(admin, /Search keywords & synonyms/);
  assert.match(migration, /service_categories_featured_sort_idx/);
});

test("customer search uses category synonyms and explainable recommended ranking", () => {
  const search = read("athoo-app/app/(customer)/(tabs)/search.tsx");
  const discovery = read("athoo-app/utils/discovery.ts");
  assert.match(search, /matchingCategories/);
  assert.match(search, /Recommended/);
  assert.match(search, /Matching \{categoryMatches/);
  assert.match(discovery, /providerRecommendationScore/);
  assert.match(discovery, /searchKeywords/);
});

test("category slug updates reject duplicates", () => {
  const route = read("api-server/src/routes/categories.ts");
  assert.match(route, /ne\(serviceCategoriesTable.id, cat.id\)/);
  assert.match(route, /A category with this slug already exists/);
});
