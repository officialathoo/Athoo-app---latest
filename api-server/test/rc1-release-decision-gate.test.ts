import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const script = fs.readFileSync(new URL("../../scripts/tools/rc1-decision.mjs", import.meta.url), "utf8");
const template = JSON.parse(fs.readFileSync(new URL("../../docs/qa/rc1-evidence-template.json", import.meta.url), "utf8"));
const pkg = JSON.parse(fs.readFileSync(new URL("../../package.json", import.meta.url), "utf8"));

test("RC1 decision gate requires all live and device evidence", () => {
  for (const key of ["databaseRecoveryRehearsal", "performanceSmoke", "androidDeviceAcceptance", "iosDeviceAcceptance", "crossRoleDeviceAcceptance"]) {
    assert.equal(template.checks[key].status, "pending");
    assert.match(script, new RegExp(key));
  }
});

test("RC1 decision blocks pending checks and P0/P1 defects", () => {
  assert.match(script, /CONDITIONAL-NO-GO/);
  assert.match(script, /openP0Defects/);
  assert.match(script, /openP1Defects/);
  assert.equal(pkg.scripts["rc1:decision"], "node .\/scripts\/tools\/rc1-decision.mjs");
});
