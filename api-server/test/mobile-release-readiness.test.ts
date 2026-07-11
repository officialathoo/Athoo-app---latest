import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "../..");
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

test("EAS defines development, preview and production profiles", () => {
  const eas = JSON.parse(read("eas.json"));
  assert.ok(eas.build.development);
  assert.ok(eas.build.preview);
  assert.ok(eas.build.production);
  assert.equal(eas.build.production.distribution, "store");
  assert.equal(eas.build.production.android.buildType, "app-bundle");
});

test("mobile config uses environment-driven release identity and no public TURN credentials", () => {
  const config = read("athoo-app/app.config.js");
  assert.match(config, /EAS_PROJECT_ID/);
  assert.match(config, /ANDROID_VERSION_CODE/);
  assert.match(config, /IOS_BUILD_NUMBER/);
  assert.doesNotMatch(config, /EXPO_PUBLIC_TURN_CREDENTIAL/);
  assert.doesNotMatch(config, /TURN_USERNAME/);
});

test("mobile release validator blocks insecure beta configuration", () => {
  const validator = read("scripts/tools/validate-mobile-release.mjs");
  assert.match(validator, /Release mobile API URL must use HTTPS/);
  assert.match(validator, /must not be embedded in a public mobile bundle/);
  assert.match(validator, /EAS_PROJECT_ID is required/);
});

test("root scripts include mobile validation and export gates", () => {
  const pkg = JSON.parse(read("package.json"));
  assert.ok(pkg.scripts["mobile:validate"]);
  assert.ok(pkg.scripts["mobile:export"]);
  assert.ok(pkg.scripts["mobile:verify"]);
});
