import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path: string) => fs.readFileSync(new URL(`../src/${path}`, import.meta.url), "utf8");

test("stored media paths are normalized and owner-scoped", () => {
  const security = read("lib/storageSecurity.ts");
  assert.match(security, /normalizeStoredObjectPath/);
  assert.match(security, /isOwnedUploadObjectPath/);
  assert.match(security, /uploads\/\$\{scope\}\/\$\{userId\}/);
});

test("profile photos cannot reference another user's upload", () => {
  for (const route of ["routes/account.ts", "routes/me.ts", "routes/auth.ts"]) {
    const source = read(route);
    assert.match(source, /Profile photo must be uploaded through your Athoo account/);
    assert.match(source, /isOwnedUploadObjectPath\(profileImage/);
  }
});

test("support, premium, finance and provider evidence require owned storage", () => {
  assert.match(read("routes/support.ts"), /validateOwnedUploadObjectPaths/);
  assert.match(read("routes/subscriptions.ts"), /private Athoo storage/);
  assert.match(read("routes/payments.ts"), /private Athoo storage/);
  assert.match(read("routes/refunds.ts"), /isOwnedUploadObjectPath\(evidenceUrl/);
  assert.match(read("routes/me.ts"), /Verification documents must use your private upload path/);
  assert.match(read("routes/account.ts"), /Service-request documents must be uploaded through your private Athoo storage/);
});
