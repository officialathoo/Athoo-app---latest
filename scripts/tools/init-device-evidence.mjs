#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = path.resolve(import.meta.dirname, "../..");
const checklistPath = path.join(root, "docs/qa/device-acceptance-checklist.json");
const statusPath = path.join(root, "docs/qa/current-release-status.json");

function fail(message) {
  console.error(message);
  process.exit(2);
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith("--")) fail(`Unexpected argument: ${value}`);
    const key = value.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) fail(`Missing value for --${key}`);
    parsed[key] = next;
    index += 1;
  }
  return parsed;
}

function sha256(filePath) {
  const hash = crypto.createHash("sha256");
  hash.update(fs.readFileSync(filePath));
  return hash.digest("hex");
}

const args = parseArgs(process.argv.slice(2));
const artifactPath = path.resolve(args.artifact || "");
const releaseVersion = String(args["release-version"] || "").trim();
const releaseCommitSha = String(args.commit || "").trim().toLowerCase();
const outputPath = path.resolve(args.output || path.join(root, "device-acceptance-evidence.json"));

if (!args.artifact) fail("Usage: pnpm device:evidence:init -- --artifact <candidate.zip> --release-version <version> --commit <git-sha> [--output <file>]");
if (!fs.existsSync(artifactPath) || !fs.statSync(artifactPath).isFile()) fail(`Candidate artifact not found: ${artifactPath}`);
if (!releaseVersion || /candidate|replace|example|pending|tbd/i.test(releaseVersion)) fail("--release-version must be the real release version, not a placeholder");
if (!/^[a-f0-9]{7,64}$/i.test(releaseCommitSha) || /^0+$/.test(releaseCommitSha)) fail("--commit must be a real 7-64 character hexadecimal Git commit SHA");
if (fs.existsSync(outputPath) && args.overwrite !== "true") fail(`Refusing to overwrite existing evidence file: ${outputPath}. Pass --overwrite true to replace it.`);

const checklist = JSON.parse(fs.readFileSync(checklistPath, "utf8"));
const status = JSON.parse(fs.readFileSync(statusPath, "utf8"));
const candidateArtifactName = path.basename(artifactPath);
if (candidateArtifactName !== status.candidate) {
  fail(`Artifact name must match the active candidate ${status.candidate}; received ${candidateArtifactName}`);
}

const platformRecord = () => ({
  status: "pending",
  testedAt: "",
  buildId: "",
  device: "",
  osVersion: "",
  evidence: "",
  notes: "",
});
const crossRoleRecord = () => ({
  status: "pending",
  testedAt: "",
  evidence: "",
  notes: "",
  devices: {
    android: { buildId: "", device: "", osVersion: "" },
    ios: { buildId: "", device: "", osVersion: "" },
  },
});

const evidence = {
  schemaVersion: checklist.schemaVersion,
  candidateArtifactName,
  releaseVersion,
  releaseCommitSha,
  artifactSha256: sha256(artifactPath),
  builds: {
    android: { buildId: "", sourceCommitSha: "", artifactUrl: "", createdAt: "" },
    ios: { buildId: "", sourceCommitSha: "", artifactUrl: "", createdAt: "" },
  },
  platforms: {
    android: Object.fromEntries(checklist.platforms.android.map((caseId) => [caseId, platformRecord()])),
    ios: Object.fromEntries(checklist.platforms.ios.map((caseId) => [caseId, platformRecord()])),
  },
  crossRole: Object.fromEntries(checklist.crossRole.map((caseId) => [caseId, crossRoleRecord()])),
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
console.log(`Device evidence initialized: ${outputPath}`);
console.log(`Candidate: ${candidateArtifactName}`);
console.log(`SHA-256: ${evidence.artifactSha256}`);
console.log("Complete both build records and every Android, iOS, and cross-role case before validation.");
