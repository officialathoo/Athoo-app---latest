#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = path.resolve(import.meta.dirname, "../..");
const evidencePath = path.resolve(process.argv[2] || path.join(root, "device-acceptance-evidence.json"));
const artifactArgument = process.argv[3] || process.env.DEVICE_EVIDENCE_ARTIFACT_PATH || "";
const artifactPath = artifactArgument ? path.resolve(artifactArgument) : "";
const checklistPath = path.join(root, "docs/qa/device-acceptance-checklist.json");
const statusPath = path.join(root, "docs/qa/current-release-status.json");
const allowedStatuses = new Set(["passed", "failed", "blocked", "pending"]);
const completedStatuses = new Set(["passed", "failed", "blocked"]);
const placeholderPattern = /^(?:0+|n\/?a|none|ok|pass(?:ed)?|test(?:ed)?|pending|todo|tbd|replace(?:_with.*)?|example)$/i;
const futureGraceMs = 5 * 60 * 1000;

function readJson(filePath, label) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    console.error(`${label} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(2);
  }
}

if (!fs.existsSync(evidencePath)) {
  console.error(`Device evidence file not found: ${evidencePath}`);
  console.error("Run device:evidence:init for the exact release artifact, then complete every case.");
  process.exit(2);
}
if (!artifactPath) {
  console.error("The exact candidate ZIP path is required as the second argument or DEVICE_EVIDENCE_ARTIFACT_PATH.");
  console.error("Usage: pnpm device:evidence:validate -- <evidence.json> <candidate.zip>");
  process.exit(2);
}
if (!fs.existsSync(artifactPath) || !fs.statSync(artifactPath).isFile()) {
  console.error(`Candidate artifact not found: ${artifactPath}`);
  process.exit(2);
}

const checklist = readJson(checklistPath, "Device acceptance checklist");
const releaseStatus = readJson(statusPath, "Current release status");
const evidence = readJson(evidencePath, "Device acceptance evidence");
const errors = [];
const failures = [];
const pending = [];

function nonEmpty(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isSpecific(value, minLength = 1) {
  if (!nonEmpty(value)) return false;
  const normalized = value.trim();
  return normalized.length >= minLength && !placeholderPattern.test(normalized);
}

function parseTime(value, label) {
  const time = Date.parse(String(value || ""));
  if (Number.isNaN(time)) {
    errors.push(`${label} must be an ISO-8601 timestamp`);
    return null;
  }
  if (time > Date.now() + futureGraceMs) errors.push(`${label} cannot be in the future`);
  return time;
}

function assertExactCases(groupLabel, expected, actual) {
  const actualKeys = Object.keys(actual || {});
  const missing = expected.filter((caseId) => !actualKeys.includes(caseId));
  const unknown = actualKeys.filter((caseId) => !expected.includes(caseId));
  for (const caseId of missing) errors.push(`${groupLabel}.${caseId}: missing evidence record`);
  for (const caseId of unknown) errors.push(`${groupLabel}.${caseId}: unknown case not present in the certified checklist`);
}

function validateCommonCase(label, item, minimumTestTime) {
  if (!item || typeof item !== "object" || Array.isArray(item)) {
    errors.push(`${label}: missing evidence record`);
    return null;
  }
  if (!allowedStatuses.has(item.status)) {
    errors.push(`${label}: status must be passed, failed, blocked, or pending`);
    return null;
  }
  if (item.status === "failed" || item.status === "blocked") failures.push(label);
  if (item.status === "pending") pending.push(label);
  if (!completedStatuses.has(item.status)) return null;

  const testedAt = parseTime(item.testedAt, `${label}.testedAt`);
  if (testedAt !== null && minimumTestTime !== null && testedAt + futureGraceMs < minimumTestTime) {
    errors.push(`${label}.testedAt cannot be earlier than the tested build creation time`);
  }
  if (!isSpecific(item.evidence, 5)) errors.push(`${label}.evidence must identify a real screenshot, video, log, or evidence URL`);
  if (!isSpecific(item.notes, 12)) errors.push(`${label}.notes must describe the observed result; generic values such as OK or Passed are not accepted`);
  return testedAt;
}

function validatePlatformCase(platform, caseId, item, buildCreatedAt) {
  const label = `platforms.${platform}.${caseId}`;
  validateCommonCase(label, item, buildCreatedAt);
  if (!completedStatuses.has(item?.status)) return;
  for (const field of ["buildId", "device", "osVersion"]) {
    if (!isSpecific(item[field], 2)) errors.push(`${label}.${field} is required for completed, failed, or blocked cases`);
  }
  if (String(item.buildId || "") !== String(evidence.builds?.[platform]?.buildId || "")) {
    errors.push(`${label}.buildId must match builds.${platform}.buildId`);
  }
}

function validateCrossRoleCase(caseId, item, minimumTestTime) {
  const label = `crossRole.${caseId}`;
  validateCommonCase(label, item, minimumTestTime);
  if (!completedStatuses.has(item?.status)) return;
  for (const platform of ["android", "ios"]) {
    const device = item.devices?.[platform];
    if (!device || typeof device !== "object") {
      errors.push(`${label}.devices.${platform} is required`);
      continue;
    }
    for (const field of ["buildId", "device", "osVersion"]) {
      if (!isSpecific(device[field], 2)) errors.push(`${label}.devices.${platform}.${field} is required`);
    }
    if (String(device.buildId || "") !== String(evidence.builds?.[platform]?.buildId || "")) {
      errors.push(`${label}.devices.${platform}.buildId must match builds.${platform}.buildId`);
    }
  }
}

if (evidence.schemaVersion !== checklist.schemaVersion || evidence.schemaVersion !== 4) {
  errors.push(`schemaVersion must equal the current checklist schemaVersion 4`);
}
if (!isSpecific(evidence.candidateArtifactName, 5)) errors.push("candidateArtifactName is required");
if (String(evidence.candidateArtifactName || "") !== String(releaseStatus.candidate || "")) {
  errors.push(`candidateArtifactName must match the active candidate ${releaseStatus.candidate}`);
}
if (!isSpecific(evidence.releaseVersion, 3) || /candidate|replace|example|pending|tbd/i.test(String(evidence.releaseVersion))) {
  errors.push("releaseVersion must be the real deployed release version, not a template value");
}
if (!/^[a-f0-9]{7,64}$/i.test(String(evidence.releaseCommitSha || "")) || /^0+$/.test(String(evidence.releaseCommitSha || ""))) {
  errors.push("releaseCommitSha must contain a real 7 to 64 character hexadecimal Git commit SHA");
}
if (!/^[a-f0-9]{64}$/i.test(String(evidence.artifactSha256 || "")) || /^0{64}$/.test(String(evidence.artifactSha256 || ""))) {
  errors.push("artifactSha256 must be a real non-zero 64-character SHA-256 digest");
}

const actualArtifactName = path.basename(artifactPath);
const actualArtifactSha256 = crypto.createHash("sha256").update(fs.readFileSync(artifactPath)).digest("hex");
if (actualArtifactName !== String(evidence.candidateArtifactName || "")) {
  errors.push(`candidate artifact filename mismatch: expected ${evidence.candidateArtifactName}, received ${actualArtifactName}`);
}
if (actualArtifactSha256 !== String(evidence.artifactSha256 || "").toLowerCase()) {
  errors.push("artifactSha256 does not match the supplied candidate ZIP bytes");
}

const buildTimes = {};
for (const platform of ["android", "ios"]) {
  const build = evidence.builds?.[platform];
  if (!build || typeof build !== "object") {
    errors.push(`builds.${platform} is required`);
    buildTimes[platform] = null;
    continue;
  }
  for (const field of ["buildId", "sourceCommitSha", "artifactUrl", "createdAt"]) {
    if (!isSpecific(build[field], field === "artifactUrl" ? 10 : 2)) errors.push(`builds.${platform}.${field} is required`);
  }
  if (nonEmpty(build.artifactUrl) && !/^https:\/\//i.test(build.artifactUrl.trim())) {
    errors.push(`builds.${platform}.artifactUrl must be an HTTPS build artifact URL`);
  }
  buildTimes[platform] = parseTime(build.createdAt, `builds.${platform}.createdAt`);
  if (!/^[a-f0-9]{7,64}$/i.test(String(build.sourceCommitSha || "")) || /^0+$/.test(String(build.sourceCommitSha || ""))) {
    errors.push(`builds.${platform}.sourceCommitSha must contain a real Git commit SHA`);
  }
  const releaseSha = String(evidence.releaseCommitSha || "").toLowerCase();
  const buildSha = String(build.sourceCommitSha || "").toLowerCase();
  if (releaseSha && buildSha && !(releaseSha.startsWith(buildSha) || buildSha.startsWith(releaseSha))) {
    errors.push(`builds.${platform}.sourceCommitSha must match releaseCommitSha`);
  }
}

assertExactCases("platforms.android", checklist.platforms?.android || [], evidence.platforms?.android);
assertExactCases("platforms.ios", checklist.platforms?.ios || [], evidence.platforms?.ios);
assertExactCases("crossRole", checklist.crossRole || [], evidence.crossRole);
for (const platform of ["android", "ios"]) {
  for (const caseId of checklist.platforms?.[platform] || []) {
    validatePlatformCase(platform, caseId, evidence.platforms?.[platform]?.[caseId], buildTimes[platform]);
  }
}
const crossRoleMinimumTime = Math.max(...Object.values(buildTimes).filter((value) => typeof value === "number"), 0) || null;
for (const caseId of checklist.crossRole || []) {
  validateCrossRoleCase(caseId, evidence.crossRole?.[caseId], crossRoleMinimumTime);
}

if (errors.length) {
  console.error("Device acceptance evidence is invalid:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(2);
}

const totalCases = checklist.platforms.android.length + checklist.platforms.ios.length + checklist.crossRole.length;
const summary = {
  schemaVersion: 4,
  candidateArtifactName: evidence.candidateArtifactName,
  releaseVersion: evidence.releaseVersion,
  releaseCommitSha: evidence.releaseCommitSha,
  artifactSha256: evidence.artifactSha256,
  evaluatedAt: new Date().toISOString(),
  status: failures.length ? "failed" : pending.length ? "pending" : "passed",
  totalCases,
  passedCases: totalCases - failures.length - pending.length,
  failedOrBlockedCases: failures.length,
  pendingCases: pending.length,
  failures,
  pending,
};
const outDir = path.join(root, "release-evidence");
fs.mkdirSync(outDir, { recursive: true });
const output = path.join(outDir, `device-${String(evidence.releaseVersion).replace(/[^a-zA-Z0-9._-]/g, "-")}-summary.json`);
fs.writeFileSync(output, `${JSON.stringify(summary, null, 2)}\n`, { mode: 0o600 });
console.log(JSON.stringify(summary, null, 2));
console.log(`Device evidence summary written: ${path.relative(root, output)}`);
process.exit(failures.length ? 1 : pending.length ? 3 : 0);
