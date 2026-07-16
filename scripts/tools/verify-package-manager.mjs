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

const expectedNodeMajor = Number(fs.readFileSync(".nvmrc", "utf8").trim());
const currentNodeMajor = Number(process.versions.node.split(".")[0]);
if (!Number.isInteger(expectedNodeMajor) || currentNodeMajor !== expectedNodeMajor) {
  console.error(
    `Athoo requires the current Node ${expectedNodeMajor}.x LTS line; found ${process.versions.node}. ` +
      `Install/use Node ${expectedNodeMajor} and rerun pnpm install.`,
  );
  process.exit(1);
}

const userAgent = process.env.npm_config_user_agent ?? "";
const pnpmMatch = userAgent.match(/^pnpm\/(\d+)\.(\d+)\.(\d+)/);
if (!pnpmMatch) {
  console.error("Use pnpm instead of npm or yarn.");
  process.exit(1);
}

const pnpmVersion = pnpmMatch.slice(1).map(Number);
const minimum = [10, 33, 2];
const belowMinimum = pnpmVersion.some((value, index) => {
  if (value !== minimum[index]) {
    return value < minimum[index] && pnpmVersion.slice(0, index).every((part, i) => part === minimum[i]);
  }
  return false;
});
if (pnpmVersion[0] !== 10 || belowMinimum) {
  console.error(
    `Athoo requires pnpm >=10.33.2 <11; found ${pnpmVersion.join(".")}. ` +
      "Update pnpm within the supported major line.",
  );
  process.exit(1);
}
