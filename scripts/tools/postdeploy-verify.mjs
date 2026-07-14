#!/usr/bin/env node
import process from 'node:process';
import { spawnSync } from 'node:child_process';

const run = (label, args) => {
  console.log(`\n== ${label} ==`);
  const result = spawnSync('pnpm', args, { stdio: 'inherit', env: process.env, shell: process.platform === 'win32' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${label} failed with exit code ${result.status}`);
};
if (!process.env.SMOKE_API_BASE_URL) {
  console.error('SMOKE_API_BASE_URL is required');
  process.exit(1);
}
run('Public deployment smoke test', ['run', 'smoke:test']);
if (process.env.BETA_CUSTOMER_IDENTIFIER && process.env.BETA_PROVIDER_IDENTIFIER && process.env.BETA_ADMIN_IDENTIFIER) {
  process.env.BETA_API_BASE_URL ||= process.env.SMOKE_API_BASE_URL;
  run('Authenticated closed-beta smoke test', ['run', 'beta:api-smoke']);
} else {
  console.log('\nAuthenticated beta smoke skipped because beta test credentials were not supplied.');
}
console.log('\nPost-deployment verification passed.');
