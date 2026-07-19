import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "../..");
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), "utf8");
const json = (relativePath: string) => JSON.parse(read(relativePath));
const candidate = "ATHOO_PHASE24_8_DEVICE_ACCEPTANCE_INTEGRITY_READY.zip";

function runScript(relativePath: string, args: string[]) {
  return spawnSync(process.execPath, [path.join(root, relativePath), ...args], {
    cwd: root,
    encoding: "utf8",
  });
}

function completeDeviceEvidence() {
  const evidence = json("docs/qa/device-acceptance-evidence-template.json");
  evidence.releaseVersion = "24.8.0-test";
  evidence.releaseCommitSha = "a".repeat(40);
  evidence.artifactSha256 = "b".repeat(64);
  evidence.builds.android = {
    buildId: "android-build-24-8",
    sourceCommitSha: evidence.releaseCommitSha,
    artifactUrl: "https://example.invalid/builds/android-24-8",
    createdAt: "2026-01-01T00:00:00.000Z",
  };
  evidence.builds.ios = {
    buildId: "ios-build-24-8",
    sourceCommitSha: evidence.releaseCommitSha,
    artifactUrl: "https://example.invalid/builds/ios-24-8",
    createdAt: "2026-01-01T00:00:00.000Z",
  };
  for (const platform of ["android", "ios"] as const) {
    for (const [caseId, item] of Object.entries<any>(evidence.platforms[platform])) {
      Object.assign(item, {
        status: "passed",
        testedAt: "2026-01-02T00:00:00.000Z",
        buildId: evidence.builds[platform].buildId,
        device: platform === "android" ? "Android acceptance phone" : "iPhone acceptance phone",
        osVersion: platform === "android" ? "Android acceptance OS" : "iOS acceptance OS",
        evidence: `https://example.invalid/evidence/${platform}/${caseId}`,
        notes: `Verified the complete ${caseId} acceptance behavior on the exact release build.`,
      });
    }
  }
  for (const [caseId, item] of Object.entries<any>(evidence.crossRole)) {
    Object.assign(item, {
      status: "passed",
      testedAt: "2026-01-02T00:00:00.000Z",
      evidence: `https://example.invalid/evidence/cross-role/${caseId}`,
      notes: `Verified the complete ${caseId} cross-role behavior using both physical release builds.`,
      devices: {
        android: {
          buildId: evidence.builds.android.buildId,
          device: "Android acceptance phone",
          osVersion: "Android acceptance OS",
        },
        ios: {
          buildId: evidence.builds.ios.buildId,
          device: "iPhone acceptance phone",
          osVersion: "iOS acceptance OS",
        },
      },
    });
  }
  return evidence;
}

test("Phase 24.8 checklist explicitly covers every reported release blocker", () => {
  const checklist = json("docs/qa/device-acceptance-checklist.json");
  const template = json("docs/qa/device-acceptance-evidence-template.json");
  const platformCases = [
    "map-renders-full-tiles-not-white",
    "provider-location-refresh-on-open-and-foreground",
    "provider-radius-persists-after-restart",
    "bottom-navigation-safe-area",
    "availability-time-picker-no-overlap",
    "availability-toggle-animation-and-server-state",
    "biometric-enable-unlock-disable",
    "invoice-has-no-tax",
  ];
  const crossRoleCases = [
    "live-provider-radius-matching-after-app-open",
    "broadcast-delivery-after-location-radius-change",
    "single-device-revocation-immediate-old-device",
    "call-no-crash-two-way-audio-with-turn-or-fallback",
    "invoice-no-tax-customer-provider-admin-consistency",
  ];

  assert.equal(checklist.schemaVersion, 4);
  assert.equal(template.schemaVersion, 4);
  assert.equal(template.candidateArtifactName, candidate);
  for (const platform of ["android", "ios"] as const) {
    for (const caseId of platformCases) assert.ok(checklist.platforms[platform].includes(caseId));
    assert.deepEqual(Object.keys(template.platforms[platform]), checklist.platforms[platform]);
  }
  for (const caseId of crossRoleCases) assert.ok(checklist.crossRole.includes(caseId));
  assert.deepEqual(Object.keys(template.crossRole), checklist.crossRole);
  for (const item of Object.values<any>(template.crossRole)) {
    assert.ok(item.devices.android);
    assert.ok(item.devices.ios);
  }
});

test("device evidence initialization binds the exact candidate and computes its checksum", () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "athoo-device-init-"));
  try {
    const artifact = path.join(temp, candidate);
    const output = path.join(temp, "device-evidence.json");
    fs.writeFileSync(artifact, "phase-24.8-test-artifact");
    const result = runScript("scripts/tools/init-device-evidence.mjs", [
      "--artifact", artifact,
      "--release-version", "24.8.0-test",
      "--commit", "c".repeat(40),
      "--output", output,
    ]);
    assert.equal(result.status, 0, result.stderr);
    const generated = JSON.parse(fs.readFileSync(output, "utf8"));
    assert.equal(generated.candidateArtifactName, candidate);
    assert.equal(generated.artifactSha256, crypto.createHash("sha256").update("phase-24.8-test-artifact").digest("hex"));
    assert.deepEqual(Object.keys(generated.platforms.android), json("docs/qa/device-acceptance-checklist.json").platforms.android);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test("strict device evidence accepts complete exact-build proof and rejects build drift", () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "athoo-device-validate-"));
  const evidencePath = path.join(temp, "device-evidence.json");
  const artifactPath = path.join(temp, candidate);
  const summaryPath = path.join(root, "release-evidence/device-24.8.0-test-summary.json");
  try {
    const artifactBytes = "phase-24.8-validation-artifact";
    fs.writeFileSync(artifactPath, artifactBytes);
    const evidence = completeDeviceEvidence();
    evidence.artifactSha256 = crypto.createHash("sha256").update(artifactBytes).digest("hex");
    fs.writeFileSync(evidencePath, JSON.stringify(evidence, null, 2));
    const passed = runScript("scripts/tools/validate-device-evidence.mjs", [evidencePath, artifactPath]);
    assert.equal(passed.status, 0, passed.stderr);
    const summary = JSON.parse(fs.readFileSync(summaryPath, "utf8"));
    assert.equal(summary.status, "passed");
    assert.equal(summary.candidateArtifactName, candidate);
    assert.equal(summary.pendingCases, 0);

    fs.writeFileSync(artifactPath, "tampered-artifact");
    const tampered = runScript("scripts/tools/validate-device-evidence.mjs", [evidencePath, artifactPath]);
    assert.equal(tampered.status, 2);
    assert.match(tampered.stderr, /artifactSha256 does not match the supplied candidate ZIP bytes/);

    fs.writeFileSync(artifactPath, artifactBytes);
    evidence.platforms.android["map-renders-full-tiles-not-white"].buildId = "older-android-build";
    fs.writeFileSync(evidencePath, JSON.stringify(evidence, null, 2));
    const rejected = runScript("scripts/tools/validate-device-evidence.mjs", [evidencePath, artifactPath]);
    assert.equal(rejected.status, 2);
    assert.match(rejected.stderr, /buildId must match builds\.android\.buildId/);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
    fs.rmSync(summaryPath, { force: true });
  }
});

test("final RC2 GO is bound to a passed matching Phase 24.8 device summary", () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "athoo-rc2-decision-"));
  const evidencePath = path.join(temp, "rc2-evidence.json");
  const summaryPath = path.join(temp, "device-summary.json");
  const decisionPath = path.join(root, "release-evidence/rc2-24.8.0-test-decision.json");
  try {
    const evidence = json("docs/qa/rc2-evidence-template.json");
    evidence.releaseVersion = "24.8.0-test";
    evidence.releaseCommitSha = "d".repeat(40);
    evidence.artifactSha256 = "e".repeat(64);
    evidence.deviceEvidenceSummary = "device-summary.json";
    for (const item of Object.values<any>(evidence.checks)) {
      item.status = "passed";
      item.evidence = "https://example.invalid/evidence/release-gate";
      if ("count" in item) item.count = 0;
    }
    evidence.approvals = {
      engineering: "Engineering approver",
      qa: "QA approver",
      product: "Product approver",
      operations: "Operations approver",
    };
    const summary = {
      schemaVersion: 4,
      status: "passed",
      candidateArtifactName: candidate,
      releaseVersion: evidence.releaseVersion,
      releaseCommitSha: evidence.releaseCommitSha,
      artifactSha256: evidence.artifactSha256,
    };
    fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
    fs.writeFileSync(evidencePath, JSON.stringify(evidence, null, 2));

    const passed = runScript("scripts/tools/rc2-decision.mjs", [evidencePath]);
    assert.equal(passed.status, 0, passed.stderr);
    assert.equal(JSON.parse(fs.readFileSync(decisionPath, "utf8")).decision, "GO");

    summary.status = "pending";
    fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
    const rejected = runScript("scripts/tools/rc2-decision.mjs", [evidencePath]);
    assert.equal(rejected.status, 2);
    assert.match(rejected.stderr, /deviceEvidenceSummary\.status must be passed/);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
    fs.rmSync(decisionPath, { force: true });
  }
});
