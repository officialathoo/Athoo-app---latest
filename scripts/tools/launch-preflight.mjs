#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '../..');
const args = process.argv.slice(2);
const envFileArg = args.find((value) => !value.startsWith('--'));
const artifactArg = args.find((value, index) => index > args.indexOf(envFileArg) && !value.startsWith('--'));
const skipCode = args.includes('--skip-code');

if (!envFileArg || !artifactArg) {
  console.error('Usage: pnpm launch:preflight <environment-file> <release-artifact> [--skip-code]');
  process.exit(1);
}

const envFile = path.resolve(envFileArg);
const artifact = path.resolve(artifactArg);
if (!fs.existsSync(envFile)) throw new Error(`Environment file not found: ${envFile}`);
if (!fs.existsSync(artifact) || !fs.statSync(artifact).isFile()) throw new Error(`Release artifact not found: ${artifact}`);

const parseEnv = (text) => {
  const values = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
    if (!match) continue;
    values[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, '');
  }
  return values;
};
const deploymentEnv = parseEnv(fs.readFileSync(envFile, 'utf8'));
const mergedEnv = { ...process.env, ...deploymentEnv };
const environment = String(deploymentEnv.NODE_ENV || '').toLowerCase();
if (!['staging', 'production'].includes(environment)) throw new Error('NODE_ENV must be staging or production');

const run = (label, command, commandArgs, options = {}) => {
  console.log(`\n== ${label} ==`);
  const result = spawnSync(command, commandArgs, {
    cwd: root,
    env: mergedEnv,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    ...options,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${label} failed with exit code ${result.status}`);
};

const hashFile = (file) => {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(file));
  return hash.digest('hex');
};
const artifactSha256 = hashFile(artifact);

run('Environment validation', process.execPath, ['scripts/tools/validate-environment.mjs', envFile]);
run('Operations readiness', process.execPath, ['scripts/tools/validate-operations-readiness.mjs']);
if (!skipCode) run('Code release verification', 'pnpm', ['run', 'release:verify:code']);
run('Database migration verification', 'pnpm', ['run', 'db:verify']);

const requiredApproval = ['RELEASE_VERSION', 'RELEASE_APPROVED_BY', 'RELEASE_CHANGE_TICKET'];
const missingApproval = requiredApproval.filter((key) => !String(mergedEnv[key] || '').trim());
if (missingApproval.length) throw new Error(`Missing release approval variables: ${missingApproval.join(', ')}`);

const lockfile = path.join(root, 'pnpm-lock.yaml');
const migrationsDir = path.join(root, 'deploy/migrations');
const migrations = fs.readdirSync(migrationsDir).filter((name) => name.endsWith('.sql')).sort();
const record = {
  schemaVersion: 2,
  status: 'preflight-passed',
  releaseVersion: String(mergedEnv.RELEASE_VERSION),
  environment,
  artifact: path.basename(artifact),
  artifactSha256,
  approvedBy: String(mergedEnv.RELEASE_APPROVED_BY),
  changeTicket: String(mergedEnv.RELEASE_CHANGE_TICKET),
  sourceRevision: String(mergedEnv.RELEASE_SOURCE_REVISION || mergedEnv.RELEASE_COMMIT_SHA || 'not-provided'),
  dependencyLockSha256: hashFile(lockfile),
  migrationCount: migrations.length,
  latestMigration: migrations.at(-1) || null,
  verifiedAt: new Date().toISOString(),
  checks: {
    environment: 'passed',
    operations: 'passed',
    code: skipCode ? 'previously-verified' : 'passed',
    database: 'passed',
    connectedRuntime: 'run-after-deployment',
    deviceAcceptance: 'required-before-go-decision',
  },
};
const outDir = path.join(root, 'release-evidence');
fs.mkdirSync(outDir, { recursive: true });
const safeVersion = record.releaseVersion.replace(/[^a-zA-Z0-9._-]/g, '-');
const output = path.join(outDir, `${environment}-${safeVersion}-preflight.json`);
fs.writeFileSync(output, JSON.stringify(record, null, 2) + '\n', { mode: 0o600 });
console.log(`\nLaunch preflight passed. Evidence: ${path.relative(root, output)}`);
console.log(`Artifact SHA-256: ${artifactSha256}`);
