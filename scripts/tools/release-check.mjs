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
  "api-server/src/lib/releaseIdentity.ts",
  "api-server/src/lib/otpDelivery.ts",
  "docs/qa/device-acceptance-evidence-template.json",
  "docs/qa/rc2-evidence-template.json",
  ".github/workflows/connected-runtime.yml",
];
for (const file of required) if (!fs.existsSync(path.join(root, file))) errors.push(`Missing release file: ${file}`);

const productionEnvPath = path.join(root, ".env.production.example");
const productionEnv = fs.existsSync(productionEnvPath)
  ? fs.readFileSync(productionEnvPath, "utf8")
  : "";
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

for (const requiredSetting of ["RELEASE_VERSION=", "OTP_DELIVERY_CHANNELS=", "OTP_DELIVERY_MODE=", "WHATSAPP_GRAPH_BASE_URL="]) {
  if (!productionEnv.includes(requiredSetting)) errors.push(`Missing production configuration: ${requiredSetting}`);
}
const rootEasPath = path.join(root, "eas.json");
const appEasPath = path.join(root, "athoo-app/eas.json");
if (fs.existsSync(rootEasPath) && fs.existsSync(appEasPath)) {
  const rootEas = JSON.parse(fs.readFileSync(rootEasPath, "utf8"));
  const appEas = JSON.parse(fs.readFileSync(appEasPath, "utf8"));
  if (JSON.stringify(rootEas) !== JSON.stringify(appEas)) errors.push("Root eas.json and athoo-app/eas.json are not synchronized");
}
const authSourcePath = path.join(root, "api-server/src/routes/auth.ts");
if (fs.existsSync(authSourcePath)) {
  const authSource = fs.readFileSync(authSourcePath, "utf8");
  if (!authSource.includes("deliverAuthenticationOtp")) errors.push("Authentication routes are not using the portable OTP delivery adapter");
  if (authSource.includes("graph.facebook.com")) errors.push("Authentication route contains a direct WhatsApp provider URL");
}
const ciPath = path.join(root, ".github/workflows/ci.yml");
if (fs.existsSync(ciPath)) {
  const ci = fs.readFileSync(ciPath, "utf8");
  if (!ci.includes("release:verify:code")) errors.push("CI does not execute the release verification gate");
} else if (process.env.CI) {
  errors.push("Missing release file in CI checkout: .github/workflows/ci.yml");
} else {
  warnings.push(".github/workflows/ci.yml is not present in this extracted local package; repository CI verification was skipped locally.");
}

const seedPath = path.join(root, "scripts/src/seed.ts");
if (fs.existsSync(seedPath)) {
  const seed = fs.readFileSync(seedPath, "utf8");
  if (/Admin@123/.test(seed)) errors.push("Fixed Super Admin password remains in seed source");
  if (!seed.includes('NODE_ENV === "production"')) errors.push("Seed script is not blocked in production");
  if (!seed.includes("SEED_ADMIN_PASSWORD")) errors.push("Seed script does not require an explicit admin password");
}

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
