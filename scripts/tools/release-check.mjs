import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const errors = [];
const warnings = [];
const required = [
  "pnpm-lock.yaml",
  "deploy/migrations/20260710_durable_background_jobs.sql",
  ".env.production.example",
  "api-server/src/index.ts",
  "admin-panel/package.json",
  "athoo-app/app.config.js",
];
for (const file of required) if (!fs.existsSync(path.join(root, file))) errors.push(`Missing release file: ${file}`);

const productionEnv = fs.readFileSync(path.join(root, ".env.production.example"), "utf8");
const duplicateKeys = new Map();
for (const line of productionEnv.split(/\r?\n/)) {
  const match = line.match(/^([A-Z][A-Z0-9_]*)=/);
  if (!match) continue;
  duplicateKeys.set(match[1], (duplicateKeys.get(match[1]) || 0) + 1);
}
for (const [key, count] of duplicateKeys) if (count > 1) errors.push(`Duplicate production environment key: ${key} (${count} occurrences)`);
for (const forbidden of ["QUEUE_PROVIDER=memory", "Admin@123", "DISABLE_SCHEMA_COMPATIBILITY_PATCH=0"]) {
  if (productionEnv.includes(forbidden)) errors.push(`Unsafe production example value: ${forbidden}`);
}

const seed = fs.readFileSync(path.join(root, "scripts/src/seed.ts"), "utf8");
if (/Admin@123/.test(seed)) errors.push("Fixed Super Admin password remains in seed source");
if (!seed.includes('NODE_ENV === "production"')) errors.push("Seed script is not blocked in production");
if (!seed.includes("SEED_ADMIN_PASSWORD")) errors.push("Seed script does not require an explicit admin password");

const forbiddenFiles = ["package-lock.json", "yarn.lock"];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (["node_modules", ".git", "dist", ".expo"].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (forbiddenFiles.includes(entry.name)) errors.push(`Conflicting lockfile: ${path.relative(root, full)}`);
  }
}
walk(root);

if (!process.env.CI && !fs.existsSync(path.join(root, "pnpm-lock.yaml"))) warnings.push("pnpm-lock.yaml must be generated in a network-enabled environment before release.");

if (warnings.length) console.warn("Release warnings:\n- " + warnings.join("\n- "));
if (errors.length) {
  console.error("Release check failed:\n- " + errors.join("\n- "));
  process.exit(1);
}
console.log("Release check passed.");
