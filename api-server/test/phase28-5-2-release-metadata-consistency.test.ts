import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "../..");
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), "utf8");
const json = (relativePath: string) => JSON.parse(read(relativePath));
const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

test("Phase 28.5.2 keeps the active candidate synchronized across release gates", () => {
  const status = json("docs/qa/current-release-status.json");
  const candidate = String(status.candidate);
  const candidatePattern = new RegExp(escapeRegex(candidate));

  assert.equal(candidate, "ATHOO_PHASE28_5_2_RELEASE_METADATA_FIXED.zip");
  assert.equal(status.baseline, "ATHOO_PHASE28_5_1_MAP_PROVIDER_TYPECHECK_FIXED.zip");
  assert.equal(json("docs/qa/device-acceptance-evidence-template.json").candidateArtifactName, candidate);
  assert.equal(json("docs/qa/rc2-evidence-template.json").candidateArtifactName, candidate);
  for (const runbook of [
    "docs/runbooks/DEVICE_ACCEPTANCE_RUNBOOK.md",
    "docs/runbooks/FINAL_CONNECTED_DEPLOYMENT.md",
    "docs/runbooks/PRODUCTION_LAUNCH_RUNBOOK.md",
  ]) {
    assert.match(read(runbook), candidatePattern);
  }
});

test("release validators and evidence tests derive the candidate from authoritative metadata", () => {
  const evidenceTest = read("api-server/test/phase24-8-device-acceptance-integrity.test.ts");
  const blueprintValidator = read("scripts/tools/validate-release-blueprints.mjs");
  assert.match(evidenceTest, /const releaseStatus = json\("docs\/qa\/current-release-status\.json"\)/);
  assert.match(evidenceTest, /const candidate = String\(releaseStatus\.candidate\)/);
  assert.doesNotMatch(evidenceTest, /const candidate = "ATHOO_PHASE/);
  assert.match(blueprintValidator, /releaseStatus = JSON\.parse\(read\("docs\/qa\/current-release-status\.json"\)\)/);
  assert.match(blueprintValidator, /activeCandidatePattern/);
  assert.doesNotMatch(blueprintValidator, /ATHOO_PHASE28_5_RELEASE_HARDENED/);
});
