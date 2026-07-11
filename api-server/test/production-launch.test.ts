import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read = (file: string) => fs.readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');

test('launch preflight binds the exact artifact to approval and database verification', () => {
  const script = read('scripts/tools/launch-preflight.mjs');
  for (const marker of ['artifactSha256', 'RELEASE_APPROVED_BY', 'RELEASE_CHANGE_TICKET', "['run', 'db:verify']", 'preflight-passed']) {
    assert.match(script, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.match(script, /release:verify:code/);
  assert.match(script, /validate-environment\.mjs/);
});

test('post-deployment verification always runs public smoke and optionally authenticated smoke', () => {
  const script = read('scripts/tools/postdeploy-verify.mjs');
  assert.match(script, /SMOKE_API_BASE_URL is required/);
  assert.match(script, /smoke:test/);
  assert.match(script, /beta:api-smoke/);
});

test('root commands and production launch runbook are present', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.scripts['launch:preflight'], 'node ./scripts/tools/launch-preflight.mjs');
  assert.equal(pkg.scripts['launch:postdeploy'], 'node ./scripts/tools/postdeploy-verify.mjs');
  const runbook = read('PRODUCTION_LAUNCH_RUNBOOK.md');
  assert.match(runbook, /pnpm launch:preflight/);
  assert.match(runbook, /pnpm launch:postdeploy/);
  assert.match(runbook, /ROLLBACK_RUNBOOK\.md/);
});
