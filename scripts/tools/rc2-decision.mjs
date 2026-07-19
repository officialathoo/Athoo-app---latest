#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = path.resolve(import.meta.dirname, "../..");
const file = path.resolve(process.argv[2] || path.join(root, "rc2-evidence.json"));
const statusFile = path.join(root, "docs/qa/current-release-status.json");
if (!fs.existsSync(file)) {
  console.error(`RC2 evidence file not found: ${file}`);
  console.error("Copy docs/qa/rc2-evidence-template.json to rc2-evidence.json and attach evidence for every check.");
  process.exit(2);
}

function readJson(filePath, label) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    console.error(`${label} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(2);
  }
}

const evidence = readJson(file, "RC2 evidence");
const releaseStatus = readJson(statusFile, "Current release status");
const allowed = new Set(["passed", "failed", "pending", "waived"]);
const waivableChecks = new Set(["databaseRecoveryRehearsal"]);
const requiredChecks = [
  "sourceVerification", "securityScan", "databaseMigrations", "databaseIntegrity", "databaseRecoveryRehearsal",
  "connectedRuntime", "releaseIdentity", "storageUpload", "mapSearchAndDirections", "otpDelivery", "emailDelivery",
  "pushDelivery", "performanceSmoke", "expoDoctor", "mobileExport", "androidPreviewBuild", "iosPreviewBuild",
  "androidDeviceAcceptance", "iosDeviceAcceptance", "crossRoleDeviceAcceptance", "darkThemeMatrix",
  "notificationSoundMatrix", "customerJobBroadcast", "chatRealtimeAndUnread", "voiceCallTwoWay",
  "singleDeviceBiometric", "adminDeepLinks", "policyGovernance", "inactivityLifecycleSafety",
  "mapTileRendering", "providerLiveLocation", "providerRadiusPersistence", "bottomNavigationSafeArea",
  "availabilityTimePicker", "biometricEnableLogin", "invoiceNoTax", "broadcastRadiusDelivery",
  "singleDeviceImmediateRevocation", "callCrashFreeTwoWayAudio",
  "legalReview", "productionSecretsRotation", "monitoringAndAlerts", "hostingCapacity",
  "openP0Defects", "openP1Defects",
];
const errors = [];
const placeholderPattern = /^(?:0+|n\/?a|none|ok|pass(?:ed)?|test(?:ed)?|pending|todo|tbd|replace(?:_with.*)?|example)$/i;
const specific = (value, minLength = 1) => typeof value === "string" && value.trim().length >= minLength && !placeholderPattern.test(value.trim());

if (evidence.schemaVersion !== 4) errors.push("schemaVersion must be 4");
if (String(evidence.candidateArtifactName || "") !== String(releaseStatus.candidate || "")) {
  errors.push(`candidateArtifactName must match the active candidate ${releaseStatus.candidate}`);
}
for (const key of requiredChecks) {
  const item = evidence?.checks?.[key];
  if (!item || !allowed.has(item.status)) errors.push(`${key}: missing or invalid status`);
  if (item && ["passed", "waived"].includes(item.status) && !specific(item.evidence, 5)) {
    errors.push(`${key}: specific evidence is required for ${item.status}`);
  }
  if (item?.status === "waived") {
    if (!waivableChecks.has(key)) errors.push(`${key}: this release check cannot be waived`);
    if (!specific(item.reason, 12)) errors.push(`${key}: a specific waiver reason is required`);
  }
}
if (!/^[a-f0-9]{64}$/i.test(String(evidence.artifactSha256 || "")) || /^0{64}$/.test(String(evidence.artifactSha256 || ""))) {
  errors.push("artifactSha256 must be a real non-zero 64-character SHA-256 digest");
}
if (!specific(evidence.releaseVersion, 3) || /candidate|replace|example|pending|tbd/i.test(String(evidence.releaseVersion))) {
  errors.push("releaseVersion must be the real release version");
}
if (!/^[a-f0-9]{7,64}$/i.test(String(evidence.releaseCommitSha || "")) || /^0+$/.test(String(evidence.releaseCommitSha || ""))) {
  errors.push("releaseCommitSha must contain a real 7 to 64 character hexadecimal commit SHA");
}
for (const key of ["engineering", "qa", "product", "operations"]) {
  if (!specific(evidence?.approvals?.[key], 3)) errors.push(`approvals.${key} is required and cannot be a placeholder`);
}

if (!specific(evidence.deviceEvidenceSummary, 5)) {
  errors.push("deviceEvidenceSummary must reference the passed Phase 24.8 device evidence summary JSON");
} else {
  const summaryPath = path.resolve(path.dirname(file), evidence.deviceEvidenceSummary);
  if (!fs.existsSync(summaryPath)) {
    errors.push(`deviceEvidenceSummary not found: ${summaryPath}`);
  } else {
    const summary = readJson(summaryPath, "Device evidence summary");
    if (summary.schemaVersion !== 4) errors.push("deviceEvidenceSummary.schemaVersion must be 4");
    if (summary.status !== "passed") errors.push("deviceEvidenceSummary.status must be passed");
    for (const key of ["candidateArtifactName", "releaseVersion", "releaseCommitSha", "artifactSha256"]) {
      if (String(summary[key] || "") !== String(evidence[key] || "")) {
        errors.push(`deviceEvidenceSummary.${key} must match RC2 evidence`);
      }
    }
  }
}

for (const key of ["openP0Defects", "openP1Defects"]) {
  const count = Number(evidence.checks?.[key]?.count);
  if (!Number.isInteger(count) || count < 0) errors.push(`${key}.count must be a non-negative integer`);
}

if (errors.length) {
  console.error("RC2 evidence is invalid:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(2);
}

const failed = requiredChecks.filter((key) => evidence.checks[key].status === "failed");
const pending = requiredChecks.filter((key) => evidence.checks[key].status === "pending");
const waived = requiredChecks.filter((key) => evidence.checks[key].status === "waived");
const p0 = Number(evidence.checks.openP0Defects.count || 0);
const p1 = Number(evidence.checks.openP1Defects.count || 0);
let decision = "GO";
let exitCode = 0;
if (failed.length || p0 > 0 || p1 > 0) {
  decision = "NO-GO";
  exitCode = 1;
} else if (pending.length) {
  decision = "CONDITIONAL-NO-GO";
  exitCode = 3;
}

const result = {
  schemaVersion: 4,
  decision,
  candidateArtifactName: evidence.candidateArtifactName,
  releaseVersion: evidence.releaseVersion,
  releaseCommitSha: evidence.releaseCommitSha,
  artifactSha256: evidence.artifactSha256,
  deviceEvidenceSummary: evidence.deviceEvidenceSummary,
  evaluatedAt: new Date().toISOString(),
  failedChecks: failed,
  pendingChecks: pending,
  waivedChecks: waived,
  openP0Defects: p0,
  openP1Defects: p1,
  approvals: evidence.approvals,
};
const outDir = path.join(root, "release-evidence");
fs.mkdirSync(outDir, { recursive: true });
const output = path.join(outDir, `rc2-${String(evidence.releaseVersion).replace(/[^a-zA-Z0-9._-]/g, "-")}-decision.json`);
fs.writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600 });
console.log(JSON.stringify(result, null, 2));
console.log(`RC2 decision evidence written: ${path.relative(root, output)}`);
process.exit(exitCode);
