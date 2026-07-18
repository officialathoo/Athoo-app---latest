#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const errors = [];
const warnings = [];
const required = [
  "eas.json",
  "athoo-app/app.config.js",
  "athoo-app/context/NotificationContext.tsx",
  "athoo-app/services/NotificationService.ts",
  "docs/runbooks/DEVICE_ACCEPTANCE_RUNBOOK.md",
  "docs/qa/device-acceptance-checklist.json",
  "docs/qa/device-acceptance-evidence-template.json",
  "docs/qa/rc2-evidence-template.json",
  "api-server/src/lib/otpDelivery.ts",
  "api-server/src/lib/releaseIdentity.ts",
  ".maestro/customer-login.yaml",
  ".maestro/provider-login.yaml",
  ".maestro/customer-device-smoke.yaml",
  ".maestro/provider-device-smoke.yaml",
];
for (const file of required) if (!fs.existsSync(path.join(root, file))) errors.push(`Missing ${file}`);

const config = fs.readFileSync(path.join(root, "athoo-app/app.config.js"), "utf8");
const layout = fs.readFileSync(path.join(root, "athoo-app/app/_layout.tsx"), "utf8");
const notifications = fs.readFileSync(path.join(root, "athoo-app/context/NotificationContext.tsx"), "utf8");
if (config.includes("ACCESS_BACKGROUND_LOCATION")) errors.push("Background location permission must not be declared while tracking is foreground-only");
if (config.includes("NSLocationAlwaysUsageDescription")) errors.push("iOS Always Location description must not be present while tracking is foreground-only");
if (!config.includes("expo-local-authentication")) errors.push("expo-local-authentication config plugin is required");
if (!config.includes("expo-location")) errors.push("expo-location config plugin is required");
if (layout.includes("addNotificationResponseReceivedListener")) errors.push("Root layout must not register a second notification response listener");
if (!notifications.includes("addNotificationResponseReceivedListener")) errors.push("NotificationContext must own notification response navigation");

const checklist = JSON.parse(fs.readFileSync(path.join(root, "docs/qa/device-acceptance-checklist.json"), "utf8"));
for (const platform of ["android", "ios"]) {
  if (!Array.isArray(checklist?.platforms?.[platform]) || checklist.platforms[platform].length < 10) errors.push(`${platform} checklist must contain at least 10 acceptance cases`);
}
if (!Array.isArray(checklist?.crossRole) || checklist.crossRole.length < 12) errors.push("Cross-role checklist must contain at least 12 cases");
for (const platform of ["android", "ios"]) {
  const cases = new Set(checklist?.platforms?.[platform] || []);
  for (const requiredCase of [
    "customer-phone-otp-login",
    "customer-email-otp-login",
    "dark-theme-all-primary-flows",
    "map-tiles-search-reverse-geocoding",
    "incoming-call-sound-and-controls",
    "push-notification-tap-from-killed-state",
  ]) {
    if (!cases.has(requiredCase)) errors.push(`${platform} checklist is missing ${requiredCase}`);
  }
}
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
for (const script of ["device:evidence:validate", "rc2:source-verify", "rc2:connected-verify", "rc2:decision"]) {
  if (!packageJson.scripts?.[script]) errors.push(`Missing package script ${script}`);
}

if (errors.length) {
  console.error("Device acceptance validation failed:\n" + errors.map((e) => `- ${e}`).join("\n"));
  process.exit(1);
}
console.log("Device acceptance preparation validated.");
for (const warning of warnings) console.warn(`Warning: ${warning}`);
