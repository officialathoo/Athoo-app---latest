#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = path.resolve(import.meta.dirname, "../..");
const evidencePath = path.resolve(process.argv[2] || path.join(root, "device-acceptance-evidence.json"));
const checklistPath = path.join(root, "device-acceptance-checklist.json");
const allowedStatuses = new Set(["passed", "failed", "blocked", "pending"]);

if (!fs.existsSync(evidencePath)) {
  console.error(`Device evidence file not found: ${evidencePath}`);
  console.error("Copy device-acceptance-evidence-template.json to device-acceptance-evidence.json and complete every case.");
  process.exit(2);
}

const checklist = JSON.parse(fs.readFileSync(checklistPath, "utf8"));
const evidence = JSON.parse(fs.readFileSync(evidencePath, "utf8"));
const errors = [];
const failures = [];
const pending = [];

function nonEmpty(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function validateCase(group, caseId, item, platform) {
  const label = `${group}.${caseId}`;
  if (!item || typeof item !== "object") {
    errors.push(`${label}: missing evidence record`);
    return;
  }
  if (!allowedStatuses.has(item.status)) {
    errors.push(`${label}: status must be passed, failed, blocked, or pending`);
    return;
  }
  if (item.status === "failed" || item.status === "blocked") failures.push(label);
  if (item.status === "pending") pending.push(label);
  if (item.status !== "pending") {
    for (const field of ["testedAt", "buildId", "device", "osVersion", "evidence", "notes"]) {
      if (!nonEmpty(item[field])) errors.push(`${label}: ${field} is required for completed, failed, or blocked cases`);
    }
    if (Number.isNaN(Date.parse(item.testedAt))) errors.push(`${label}: testedAt must be an ISO-8601 timestamp`);
    if (platform && String(item.buildId) !== String(evidence.builds?.[platform]?.buildId || "")) {
      errors.push(`${label}: buildId must match builds.${platform}.buildId`);
    }
  }
}

if (!/^[a-f0-9]{64}$/i.test(String(evidence.artifactSha256 || ""))) {
  errors.push("artifactSha256 must be a 64-character SHA-256 digest");
}
if (!nonEmpty(evidence.releaseVersion)) errors.push("releaseVersion is required");
if (!/^[a-f0-9]{7,64}$/i.test(String(evidence.releaseCommitSha || ""))) {
  errors.push("releaseCommitSha must contain 7 to 64 hexadecimal characters");
}
for (const platform of ["android", "ios"]) {
  const build = evidence.builds?.[platform];
  if (!build || !nonEmpty(build.buildId) || !nonEmpty(build.sourceCommitSha) || !nonEmpty(build.artifactUrl) || !nonEmpty(build.createdAt)) {
    errors.push(`builds.${platform}: buildId, sourceCommitSha, artifactUrl, and createdAt are required`);
  } else {
    if (Number.isNaN(Date.parse(build.createdAt))) errors.push(`builds.${platform}.createdAt must be an ISO-8601 timestamp`);
    if (!/^[a-f0-9]{7,64}$/i.test(String(build.sourceCommitSha))) errors.push(`builds.${platform}.sourceCommitSha must contain 7 to 64 hexadecimal characters`);
    const releaseSha = String(evidence.releaseCommitSha || "").toLowerCase();
    const buildSha = String(build.sourceCommitSha || "").toLowerCase();
    if (releaseSha && buildSha && !(releaseSha.startsWith(buildSha) || buildSha.startsWith(releaseSha))) {
      errors.push(`builds.${platform}.sourceCommitSha must match releaseCommitSha`);
    }
  }
  for (const caseId of checklist.platforms?.[platform] || []) {
    validateCase(`platforms.${platform}`, caseId, evidence.platforms?.[platform]?.[caseId], platform);
  }
}
for (const caseId of checklist.crossRole || []) {
  validateCase("crossRole", caseId, evidence.crossRole?.[caseId], null);
}

if (errors.length) {
  console.error("Device acceptance evidence is invalid:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(2);
}

const summary = {
  schemaVersion: 3,
  releaseVersion: evidence.releaseVersion,
  releaseCommitSha: evidence.releaseCommitSha,
  artifactSha256: evidence.artifactSha256,
  evaluatedAt: new Date().toISOString(),
  status: failures.length ? "failed" : pending.length ? "pending" : "passed",
  failures,
  pending,
};
const outDir = path.join(root, "release-evidence");
fs.mkdirSync(outDir, { recursive: true });
const output = path.join(outDir, `device-${String(evidence.releaseVersion).replace(/[^a-zA-Z0-9._-]/g, "-")}-summary.json`);
fs.writeFileSync(output, JSON.stringify(summary, null, 2) + "\n", { mode: 0o600 });
console.log(JSON.stringify(summary, null, 2));
console.log(`Device evidence summary written: ${path.relative(root, output)}`);
process.exit(failures.length ? 1 : pending.length ? 3 : 0);
