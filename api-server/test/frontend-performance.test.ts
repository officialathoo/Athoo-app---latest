import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('admin routes including dashboard are lazy loaded', async () => {
  const source = await readFile(new URL('../../admin-panel/src/App.tsx', import.meta.url), 'utf8');
  assert.match(source, /const DashboardPage = lazy\(/);
  assert.doesNotMatch(source, /import \{ DashboardPage \}/);
});

test('category icon picker does not import the complete lucide namespace', async () => {
  const source = await readFile(new URL('../../admin-panel/src/pages/CategoriesPage.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /import \* as LucideIcons/);
  assert.doesNotMatch(source, /\(LucideIcons as any\)/);
});

test('admin production build enforces a bundle budget', async () => {
  const pkg = JSON.parse(await readFile(new URL('../../admin-panel/package.json', import.meta.url), 'utf8'));
  assert.match(pkg.scripts.build, /check-admin-bundle\.mjs/);
  const checker = await readFile(new URL('../../scripts/tools/check-admin-bundle.mjs', import.meta.url), 'utf8');
  assert.match(checker, /ADMIN_MAX_JS_CHUNK_BYTES/);
  assert.match(checker, /ADMIN_MAX_ENTRY_BYTES/);
});
