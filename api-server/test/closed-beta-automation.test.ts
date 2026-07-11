import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (file: string) => fs.readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');

test('mobile login screens expose stable closed-beta automation identifiers', () => {
  const welcome = read('athoo-app/app/auth/welcome.tsx');
  const login = read('athoo-app/app/auth/login.tsx');
  for (const marker of ['welcome-screen','welcome-customer-sign-in','welcome-provider-sign-in']) assert.match(welcome, new RegExp(marker));
  for (const marker of ['login-password-tab','login-identifier','login-password','login-submit']) assert.match(login, new RegExp(marker));
});

test('Maestro flows isolate state and never contain committed credentials', () => {
  for (const file of ['.maestro/customer-login.yaml','.maestro/provider-login.yaml']) {
    const flow = read(file);
    assert.match(flow, /clearState: true/);
    assert.match(flow, /\$\{ATHOO_APP_ID\}/);
    assert.doesNotMatch(flow, /Admin@123|password123|0300\d{7}/i);
  }
});

test('closed-beta API smoke remains non-destructive and covers all roles', () => {
  const smoke = read('scripts/tools/beta-api-smoke.mjs');
  assert.match(smoke, /customer/);
  assert.match(smoke, /provider/);
  assert.match(smoke, /admin/);
  assert.match(smoke, /\/api\/healthz\/deep/);
  assert.match(smoke, /\/api\/categories/);
  assert.doesNotMatch(smoke, /method:\s*['"](?:PATCH|DELETE|PUT)['"]/);
});
