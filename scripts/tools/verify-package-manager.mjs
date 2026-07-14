#!/usr/bin/env node
import fs from "node:fs";
import process from "node:process";

for (const file of ["package-lock.json", "yarn.lock"]) {
  try {
    fs.rmSync(file, { force: true });
  } catch (error) {
    console.error(`Unable to remove ${file}:`, error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

const userAgent = process.env.npm_config_user_agent ?? "";
if (!userAgent.startsWith("pnpm/")) {
  console.error("Use pnpm instead of npm or yarn.");
  process.exit(1);
}
