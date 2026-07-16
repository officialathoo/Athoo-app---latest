#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = path.resolve(import.meta.dirname, "../..");
const file = path.resolve(process.argv[2] || path.join(root, "rc2-evidence.json"));
if (!fs.existsSync(file)) {
  console.error(`RC2 evidence file not found: ${file}`);
  console.error("Copy rc2-evidence-template.json to rc2-evidence.json and attach evidence for every check.");
  process.exit(2);
}

const evidence = JSON.parse(fs.readFileSync(file, "utf8"));
const allowed = new Set(["passed", "failed", "pending", "waived"]);
const waivableChecks = new Set(["databaseRecoveryRehearsal"]);
const requiredChecks = [
  "sourceVerification", "securityScan", "databaseMigrations", "databaseIntegrity", "databaseRecoveryRehearsal",
  "connectedRuntime", "releaseIdentity", "storageUpload", "mapSearchAndDirections", "otpDelivery", "emailDelivery",
  "pushDelivery", "performanceSmoke", "expoDoctor", "mobileExport", "androidPreviewBuild", "iosPreviewBuild",
  "androidDeviceAcceptance", "iosDeviceAcceptance", "crossRoleDeviceAcceptance", "darkThemeMatrix",
  "notificationSoundMatrix", "openP0Defects", "openP1Defects",
];
const errors = [];
for (const key of requiredChecks) {
  const item = evidence?.checks?.[key];
  if (!item || !allowed.has(item.status)) errors.push(`${key}: missing or invalid status`);
  if (item && ["passed", "waived"].includes(item.status) && !String(item.evidence || "").trim()) {
    errors.push(`${key}: evidence is required for ${item.status}`);
  }
  if (item?.status === "waived") {
    if (!waivableChecks.has(key)) errors.push(`${key}: this release check cannot be waived`);
    if (!String(item.reason || "").trim()) errors.push(`${key}: waiver reason is required`);
  }
}
if (!/^[a-f0-9]{64}$/i.test(String(evidence.artifactSha256 || ""))) errors.push("artifactSha256 must be a 64-character SHA-256 digest");
if (!String(evidence.releaseVersion || "").trim()) errors.push("releaseVersion is required");
if (!String(evidence.releaseCommitSha || "").match(/^[a-f0-9]{7,64}$/i)) errors.push("releaseCommitSha must contain 7 to 64 hexadecimal characters");
for (const key of ["engineering", "qa", "product", "operations"]) {
  if (!String(evidence?.approvals?.[key] || "").trim()) errors.push(`approvals.${key} is required`);
}
if (errors.length) {
  console.error("RC2 evidence is invalid:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(2);
}

const failed = requiredChecks.filter((key) => evidence.checks[key].status === "failed");
const pending = requiredChecks.filter((key) => evidence.checks[key].status === "pending");
const waived = requiredChecks.filter((key) => evidence.checks[key].status === "waived");
const p0 = Number(evidence.checks.openP0Defects?.count || 0);
const p1 = Number(evidence.checks.openP1Defects?.count || 0);
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
  schemaVersion: 2,
  decision,
  releaseVersion: evidence.releaseVersion,
  releaseCommitSha: evidence.releaseCommitSha,
  artifactSha256: evidence.artifactSha256,
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
fs.writeFileSync(output, JSON.stringify(result, null, 2) + "\n", { mode: 0o600 });
console.log(JSON.stringify(result, null, 2));
console.log(`RC2 decision evidence written: ${path.relative(root, output)}`);
process.exit(exitCode);
