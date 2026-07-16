#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const appPackage = JSON.parse(readFileSync(path.join(root, "athoo-app/package.json"), "utf8"));
const workspace = readFileSync(path.join(root, "pnpm-workspace.yaml"), "utf8");
const npmrc = readFileSync(path.join(root, ".npmrc"), "utf8");
const errors = [];

if (!/^nodeLinker:\s*isolated\s*$/m.test(workspace)) {
  errors.push("pnpm-workspace.yaml must use nodeLinker: isolated for Expo SDK 54+.");
}
if (/node-linker\s*=\s*hoisted/i.test(npmrc) || /shamefully-hoist\s*=\s*true/i.test(npmrc)) {
  errors.push(".npmrc must not force hoisted/shameful dependency layout.");
}
if (/@esbuild-kit\/esm-loader/.test(workspace)) {
  errors.push("Remove the global @esbuild-kit/esm-loader override; it can break Metro config loading.");
}
if (appPackage.devDependencies?.["@expo/cli"]) {
  errors.push("Remove direct @expo/cli; the expo package provides the matching CLI.");
}
for (const name of ["expo", "expo-updates"]) {
  const value = appPackage.dependencies?.[name];
  if (typeof value !== "string" || !/^[~^]/.test(value)) {
    errors.push(`${name} must use a compatible semver range, not an unbounded or exact release.`);
  }
}
if (!existsSync(path.join(root, "athoo-app/metro.config.js"))) {
  errors.push("athoo-app/metro.config.js is missing.");
}

if (errors.length) {
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}
console.log("Expo workspace configuration validation passed.");
