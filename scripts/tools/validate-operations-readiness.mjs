#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
const requiredFiles = [
  'docs/runbooks/INCIDENT_RESPONSE_RUNBOOK.md',
  'docs/policies/DATA_RETENTION_POLICY.md',
  'docs/qa/BETA_FEEDBACK_TRIAGE.md',
  'docs/runbooks/ROLLBACK_RUNBOOK.md',
  'docs/runbooks/STAGING_DEPLOYMENT_RUNBOOK.md',
  'docs/qa/CLOSED_BETA_CHECKLIST.md',
];
const errors = [];
for (const file of requiredFiles) {
  if (!fs.existsSync(path.join(root, file))) errors.push(`Missing operational document: ${file}`);
}
const integerAtLeast = (name, fallback, minimum) => {
  const raw = process.env[name] ?? String(fallback);
  const value = Number(raw);
  if (!Number.isInteger(value) || value < minimum) errors.push(`${name} must be an integer of at least ${minimum}`);
};
integerAtLeast('BACKUP_RETENTION_DAYS', 30, 7);
integerAtLeast('AUDIT_LOG_RETENTION_DAYS', 365, 90);
integerAtLeast('FAILED_JOB_RETENTION_DAYS', 30, 7);

if (process.env.NODE_ENV === 'production') {
  for (const key of ['INCIDENT_COMMANDER_CONTACT', 'SUPPORT_ESCALATION_EMAIL', 'STATUS_PAGE_URL']) {
    if (!String(process.env[key] || '').trim()) errors.push(`${key} is required in production`);
  }
  const statusUrl = String(process.env.STATUS_PAGE_URL || '');
  if (statusUrl && !/^https:\/\//i.test(statusUrl)) errors.push('STATUS_PAGE_URL must use HTTPS in production');
}

if (errors.length) {
  console.error('Operations readiness failed:\n- ' + errors.join('\n- '));
  process.exit(1);
}
console.log(`Operations readiness passed (${requiredFiles.length} runbooks, retention controls valid).`);
