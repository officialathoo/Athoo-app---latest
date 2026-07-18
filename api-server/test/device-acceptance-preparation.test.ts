import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path: string) => fs.readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

test("notification response navigation has one owner", () => {
  const layout = read("athoo-app/app/_layout.tsx");
  const context = read("athoo-app/context/NotificationContext.tsx");
  assert.doesNotMatch(layout, /addNotificationResponseReceivedListener/);
  assert.match(context, /addNotificationResponseReceivedListener/);
});

test("mobile permissions match foreground-only tracking", () => {
  const config = read("athoo-app/app.config.js");
  assert.doesNotMatch(config, /ACCESS_BACKGROUND_LOCATION/);
  assert.doesNotMatch(config, /NSLocationAlwaysUsageDescription/);
  assert.match(config, /isAndroidBackgroundLocationEnabled:\s*false/);
  assert.match(config, /expo-local-authentication/);
});

test("device acceptance package includes both platforms and cross-role evidence", () => {
  const checklist = JSON.parse(read("docs/qa/device-acceptance-checklist.json"));
  assert.ok(checklist.platforms.android.length >= 10);
  assert.ok(checklist.platforms.ios.length >= 10);
  assert.ok(checklist.crossRole.length >= 8);
  assert.ok(checklist.evidenceRequired.includes("screenshot-or-video"));
  assert.match(read("package.json"), /device:prepare/);
});
