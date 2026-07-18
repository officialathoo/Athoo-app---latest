import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read = (file: string) => fs.readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');

test('release evidence binds artifact, approver, change ticket, lockfile and migrations', () => {
  const script = read('scripts/tools/generate-release-evidence.mjs');
  for (const marker of ['RELEASE_ARTIFACT_SHA256','RELEASE_APPROVED_BY','RELEASE_CHANGE_TICKET','dependencyLockSha256','migrationCount']) assert.match(script, new RegExp(marker));
  assert.match(script, /\^\[a-f0-9\]\{64\}\$/);
});

test('operations readiness requires runbooks and production escalation configuration', () => {
  const validator = read('scripts/tools/validate-operations-readiness.mjs');
  for (const file of ['docs/runbooks/INCIDENT_RESPONSE_RUNBOOK.md','docs/policies/DATA_RETENTION_POLICY.md','docs/qa/BETA_FEEDBACK_TRIAGE.md']) assert.match(validator, new RegExp(file));
  for (const key of ['INCIDENT_COMMANDER_CONTACT','SUPPORT_ESCALATION_EMAIL','STATUS_PAGE_URL']) assert.match(validator, new RegExp(key));
});

test('runtime production readiness reports missing incident controls', () => {
  const readiness = read('api-server/src/lib/productionReadiness.ts');
  assert.match(readiness, /Incident commander contact is not configured/);
  assert.match(readiness, /Support escalation email is not configured/);
  assert.match(readiness, /Status page is not configured/);
});
