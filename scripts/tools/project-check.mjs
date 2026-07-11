import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const requiredFiles = [
  "package.json", "pnpm-workspace.yaml", "tsconfig.base.json", "tsconfig.json",
  "api-server/package.json", "admin-panel/package.json", "athoo-app/package.json",
  "athoo-app/app.config.js", "lib/db/package.json",
  "lib/api-zod/package.json", "lib/api-client-react/package.json",
  "api-server/src/domain/booking-status.ts", "api-server/test/booking-status.test.ts",
  "scripts/src/db-migrate.ts", "deploy/migrations/20260710_database_operability.sql",
  "api-server/src/lib/databaseMigrations.ts", "api-server/test/database-operations.test.ts",
  "scripts/tools/release-check.mjs", "api-server/test/release-candidate.test.ts"
];
const failures = [];
for (const file of requiredFiles) {
  if (!fs.existsSync(path.join(root, file))) failures.push(`Missing required file: ${file}`);
}

const jsonFiles = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (["node_modules", ".git", "dist", ".expo"].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.name.endsWith(".json")) jsonFiles.push(full);
  }
}
walk(root);
for (const file of jsonFiles) {
  try { JSON.parse(fs.readFileSync(file, "utf8")); }
  catch (error) { failures.push(`Invalid JSON: ${path.relative(root, file)} (${error.message})`); }
}

const rootPackage = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
if (rootPackage.packageManager !== "pnpm@10.33.2") failures.push("packageManager must be pnpm@10.33.2");
if (!rootPackage.engines?.node) failures.push("Root package.json must declare a Node engine");

const forbidden = ["package-lock.json", "yarn.lock"];
function findNamed(dir, names) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (["node_modules", ".git"].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) findNamed(full, names);
    else if (names.includes(entry.name)) failures.push(`Conflicting package manager file: ${path.relative(root, full)}`);
  }
}
findNamed(root, forbidden);

if (!fs.existsSync(path.join(root, "pnpm-lock.yaml"))) {
  console.warn("WARNING: pnpm-lock.yaml is not present. Generate it with `corepack pnpm install` before production deployment.");
}

if (failures.length) {
  console.error("Project validation failed:\n- " + failures.join("\n- "));
  process.exit(1);
}
console.log(`Project validation passed (${jsonFiles.length} JSON files checked).`);
