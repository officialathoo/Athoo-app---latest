#!/usr/bin/env node
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const configPath = path.join(root, "athoo-app", "metro.config.js");
const requireFromApp = createRequire(path.join(root, "athoo-app", "package.json"));

try {
  const config = requireFromApp(configPath);
  if (!config || typeof config !== "object" || !config.resolver || !config.transformer) {
    throw new Error("Metro config did not return a complete Expo Metro configuration.");
  }
  requireFromApp.resolve("expo/package.json");
  requireFromApp.resolve("expo/metro-config");
  console.log("Metro configuration and app-local Expo resolution passed.");
} catch (error) {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
}
