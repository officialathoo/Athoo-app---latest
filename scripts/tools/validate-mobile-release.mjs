#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const appDir = path.join(root, "athoo-app");
const errors = [];
const warnings = [];
const requiredFiles = [
  "eas.json",
  "athoo-app/app.config.js",
  "athoo-app/assets/images/icon.png",
  "athoo-app/assets/images/adaptive-icon.png",
  "athoo-app/assets/images/splash.png",
  "athoo-app/assets/images/favicon.png",
];

for (const file of requiredFiles) {
  if (!fs.existsSync(path.join(root, file))) errors.push(`Missing required mobile release file: ${file}`);
}

const apiUrl = String(process.env.EXPO_PUBLIC_API_BASE_URL || process.env.API_BASE_URL || "").trim();
const environment = String(process.env.APP_ENV || "development").toLowerCase();
const isRelease = environment === "staging" || environment === "production";

if (isRelease && !apiUrl) errors.push("EXPO_PUBLIC_API_BASE_URL is required for staging and production mobile builds");
if (isRelease && apiUrl && !apiUrl.startsWith("https://")) errors.push("Release mobile API URL must use HTTPS");
if (/localhost|127\.0\.0\.1|10\.0\.2\.2/i.test(apiUrl) && isRelease) errors.push("Release mobile API URL cannot point to a local development host");

for (const key of ["EXPO_PUBLIC_TURN_URLS", "EXPO_PUBLIC_TURN_USERNAME", "EXPO_PUBLIC_TURN_CREDENTIAL"]) {
  if (process.env[key]) errors.push(`${key} must not be embedded in a public mobile bundle; TURN credentials are issued by the authenticated API`);
}

if (!process.env.EAS_PROJECT_ID) {
  if (isRelease) errors.push("EAS_PROJECT_ID is required for staging and production builds");
  else warnings.push("EAS_PROJECT_ID is not set; local development is allowed, but EAS builds require it");
}

if (fs.existsSync(path.join(root, "eas.json"))) {
  const eas = JSON.parse(fs.readFileSync(path.join(root, "eas.json"), "utf8"));
  for (const profile of ["development", "preview", "production"]) {
    if (!eas?.build?.[profile]) errors.push(`Missing EAS build profile: ${profile}`);
  }
  if (eas?.build?.production?.android?.buildType !== "app-bundle") errors.push("Production Android build must use app-bundle");
  if (eas?.build?.production?.distribution !== "store") errors.push("Production build distribution must be store");
}

if (fs.existsSync(path.join(appDir, "app.json"))) errors.push("athoo-app/app.json must not coexist with app.config.js");

if (errors.length) {
  console.error("Mobile release validation failed:\n" + errors.map((e) => `- ${e}`).join("\n"));
  process.exit(1);
}
console.log("Mobile release validation passed");
for (const warning of warnings) console.warn(`Warning: ${warning}`);
