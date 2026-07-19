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
  "scripts/tools/init-device-evidence.mjs",
  ".maestro/customer-login.yaml",
  ".maestro/provider-login.yaml",
  ".maestro/customer-device-smoke.yaml",
  ".maestro/provider-device-smoke.yaml",
];
for (const file of required) if (!fs.existsSync(path.join(root, file))) errors.push(`Missing ${file}`);

function read(file) {
  return fs.readFileSync(path.join(root, file), "utf8");
}

function exactCaseSet(label, checklistCases, templateCases) {
  const expected = new Set(checklistCases);
  const actual = new Set(Object.keys(templateCases || {}));
  for (const caseId of expected) if (!actual.has(caseId)) errors.push(`${label} template is missing ${caseId}`);
  for (const caseId of actual) if (!expected.has(caseId)) errors.push(`${label} template contains unknown case ${caseId}`);
  if (expected.size !== checklistCases.length) errors.push(`${label} checklist contains duplicate case identifiers`);
}

const config = read("athoo-app/app.config.js");
const layout = read("athoo-app/app/_layout.tsx");
const notifications = read("athoo-app/context/NotificationContext.tsx");
if (config.includes("ACCESS_BACKGROUND_LOCATION")) errors.push("Background location permission must not be declared while tracking is foreground-only");
if (config.includes("NSLocationAlwaysUsageDescription")) errors.push("iOS Always Location description must not be present while tracking is foreground-only");
if (!config.includes("expo-local-authentication")) errors.push("expo-local-authentication config plugin is required");
if (!config.includes("expo-location")) errors.push("expo-location config plugin is required");
if (layout.includes("addNotificationResponseReceivedListener")) errors.push("Root layout must not register a second notification response listener");
if (!notifications.includes("addNotificationResponseReceivedListener")) errors.push("NotificationContext must own notification response navigation");

const checklist = JSON.parse(read("docs/qa/device-acceptance-checklist.json"));
const template = JSON.parse(read("docs/qa/device-acceptance-evidence-template.json"));
if (checklist.schemaVersion !== 4) errors.push("Device acceptance checklist schemaVersion must be 4");
if (template.schemaVersion !== checklist.schemaVersion) errors.push("Device acceptance template schemaVersion must match the checklist");
if (!String(template.candidateArtifactName || "").endsWith(".zip")) errors.push("Device acceptance template must bind evidence to a named ZIP candidate");

for (const platform of ["android", "ios"]) {
  if (!Array.isArray(checklist?.platforms?.[platform]) || checklist.platforms[platform].length < 35) {
    errors.push(`${platform} checklist must contain at least 35 acceptance cases`);
  }
  exactCaseSet(`platforms.${platform}`, checklist.platforms?.[platform] || [], template.platforms?.[platform]);
}
if (!Array.isArray(checklist?.crossRole) || checklist.crossRole.length < 24) errors.push("Cross-role checklist must contain at least 24 cases");
exactCaseSet("crossRole", checklist.crossRole || [], template.crossRole);

const requiredPlatformCases = [
  "customer-phone-otp-login",
  "customer-email-otp-login",
  "dark-theme-all-primary-flows",
  "map-tiles-search-reverse-geocoding",
  "map-renders-full-tiles-not-white",
  "provider-location-refresh-on-open-and-foreground",
  "provider-radius-persists-after-restart",
  "bottom-navigation-safe-area",
  "availability-time-picker-no-overlap",
  "availability-toggle-animation-and-server-state",
  "biometric-enable-unlock-disable",
  "invoice-has-no-tax",
  "incoming-call-sound-and-controls",
  "push-notification-tap-from-killed-state",
];
for (const platform of ["android", "ios"]) {
  const cases = new Set(checklist?.platforms?.[platform] || []);
  for (const requiredCase of requiredPlatformCases) {
    if (!cases.has(requiredCase)) errors.push(`${platform} checklist is missing ${requiredCase}`);
  }
}

for (const requiredCase of [
  "customer-job-broadcast-provider-receipt",
  "live-provider-radius-matching-after-app-open",
  "broadcast-delivery-after-location-radius-change",
  "single-device-revocation-immediate-old-device",
  "call-no-crash-two-way-audio-with-turn-or-fallback",
  "invoice-no-tax-customer-provider-admin-consistency",
]) {
  if (!new Set(checklist.crossRole || []).has(requiredCase)) errors.push(`Cross-role checklist is missing ${requiredCase}`);
}

for (const caseId of checklist.crossRole || []) {
  const item = template.crossRole?.[caseId];
  if (!item?.devices?.android || !item?.devices?.ios) {
    errors.push(`crossRole.${caseId} template must record both Android and iOS devices`);
  }
}

const packageJson = JSON.parse(read("package.json"));
for (const script of ["device:evidence:init", "device:evidence:validate", "rc2:source-verify", "rc2:connected-verify", "rc2:decision"]) {
  if (!packageJson.scripts?.[script]) errors.push(`Missing package script ${script}`);
}

if (errors.length) {
  console.error(`Device acceptance validation failed:\n${errors.map((error) => `- ${error}`).join("\n")}`);
  process.exit(1);
}
console.log("Device acceptance preparation validated with strict Phase 24.8 evidence coverage.");
for (const warning of warnings) console.warn(`Warning: ${warning}`);
