#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
const required = ['RELEASE_VERSION','RELEASE_ENVIRONMENT','RELEASE_ARTIFACT_SHA256','RELEASE_APPROVED_BY','RELEASE_CHANGE_TICKET'];
const missing = required.filter((key) => !String(process.env[key] || '').trim());
if (missing.length) {
  console.error(`Missing release evidence variables: ${missing.join(', ')}`);
  process.exit(1);
}
const environment = String(process.env.RELEASE_ENVIRONMENT).toLowerCase();
if (!['staging','production'].includes(environment)) {
  console.error('RELEASE_ENVIRONMENT must be staging or production');
  process.exit(1);
}
const artifactSha256 = String(process.env.RELEASE_ARTIFACT_SHA256).toLowerCase();
if (!/^[a-f0-9]{64}$/.test(artifactSha256)) {
  console.error('RELEASE_ARTIFACT_SHA256 must be a 64-character SHA-256 digest');
  process.exit(1);
}
const lockfile = path.join(root, 'pnpm-lock.yaml');
if (!fs.existsSync(lockfile)) {
  console.error('pnpm-lock.yaml is required before generating release evidence');
  process.exit(1);
}
const hashFile = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const migrationsDir = path.join(root, 'deploy/migrations');
const migrations = fs.readdirSync(migrationsDir).filter((name) => name.endsWith('.sql')).sort();
const evidence = {
  schemaVersion: 2,
  releaseVersion: String(process.env.RELEASE_VERSION),
  environment,
  artifactSha256,
  approvedBy: String(process.env.RELEASE_APPROVED_BY),
  changeTicket: String(process.env.RELEASE_CHANGE_TICKET),
  generatedAt: new Date().toISOString(),
  sourceRevision: String(process.env.RELEASE_SOURCE_REVISION || process.env.RELEASE_COMMIT_SHA || 'not-provided'),
  dependencyLockSha256: hashFile(lockfile),
  migrationCount: migrations.length,
  latestMigration: migrations.at(-1) || null,
  controls: {
    codeVerification: 'pnpm release:verify:code',
    databaseVerification: 'pnpm db:verify',
    environmentValidation: 'pnpm env:validate <environment-file>',
    operationsValidation: 'pnpm ops:validate',
    postDeploySmoke: 'pnpm smoke:test',
    connectedRuntime: 'pnpm rc2:connected-verify',
    deviceEvidence: 'pnpm device:evidence:validate',
    releaseDecision: 'pnpm rc2:decision',
    rollbackRunbook: 'docs/runbooks/ROLLBACK_RUNBOOK.md',
    incidentRunbook: 'docs/runbooks/INCIDENT_RESPONSE_RUNBOOK.md',
  },
};
const outDir = path.join(root, 'release-evidence');
fs.mkdirSync(outDir, { recursive: true });
const safeVersion = evidence.releaseVersion.replace(/[^a-zA-Z0-9._-]/g, '-');
const output = path.join(outDir, `${environment}-${safeVersion}.json`);
fs.writeFileSync(output, JSON.stringify(evidence, null, 2) + '\n', { mode: 0o600 });
console.log(`Release evidence written: ${path.relative(root, output)}`);
