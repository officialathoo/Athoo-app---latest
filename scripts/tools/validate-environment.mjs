import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";

const envPath = path.resolve(process.argv[2] || ".env");
const text = await fs.readFile(envPath, "utf8").catch(() => { throw new Error(`Environment file not found: ${envPath}`); });
const values = new Map();
const duplicates = new Set();
for (const [index, raw] of text.split(/\r?\n/).entries()) {
  const line = raw.trim();
  if (!line || line.startsWith("#")) continue;
  const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
  if (!match) throw new Error(`Invalid environment line ${index + 1}: ${raw}`);
  if (values.has(match[1])) duplicates.add(match[1]);
  values.set(match[1], match[2].trim().replace(/^['"]|['"]$/g, ""));
}

const errors = [];
const warnings = [];
const required = [
  "NODE_ENV", "DATABASE_URL", "JWT_SECRET", "REFRESH_TOKEN_SECRET", "SESSION_SECRET",
  "API_BASE_URL", "ADMIN_BASE_URL", "CORS_ORIGINS", "STORAGE_PROVIDER", "QUEUE_PROVIDER", "JWT_ISSUER", "JWT_AUDIENCE", "TRUST_PROXY",
];
for (const key of required) if (!values.get(key)) errors.push(`${key} is required`);
for (const key of duplicates) errors.push(`${key} is defined more than once`);
for (const key of ["JWT_SECRET", "REFRESH_TOKEN_SECRET", "SESSION_SECRET"]) {
  const value = values.get(key) || "";
  if (value.length < 32 || /CHANGE_ME|example|password/i.test(value)) errors.push(`${key} must be a non-placeholder secret of at least 32 characters`);
}
if (values.get("NODE_ENV") !== "production" && values.get("NODE_ENV") !== "staging") errors.push("NODE_ENV must be production or staging for deployment validation");
for (const key of ["API_BASE_URL", "ADMIN_BASE_URL"]) {
  const value = values.get(key) || "";
  if (!value.startsWith("https://")) errors.push(`${key} must use HTTPS`);
}
if ((values.get("CORS_ORIGINS") || "").includes("*")) errors.push("CORS_ORIGINS must not contain wildcard origins");
if (values.get("STORAGE_PROVIDER") === "local") errors.push("STORAGE_PROVIDER=local is not allowed for staging or production");
if (values.get("QUEUE_PROVIDER") !== "postgres") errors.push("QUEUE_PROVIDER must be postgres for the current Athoo release");
if (!values.get("METRICS_TOKEN")) warnings.push("METRICS_TOKEN is not set; protected operational metrics will be unavailable");
if (!values.get("SENTRY_DSN") && !values.get("ERROR_TRACKING_DSN")) warnings.push("No error-tracking DSN is configured");
if (!values.get("SMTP_HOST")) warnings.push("SMTP is not configured; email delivery will be unavailable");

if (errors.length) {
  console.error(JSON.stringify({ valid: false, file: envPath, errors, warnings }, null, 2));
  process.exit(1);
}
console.log(JSON.stringify({ valid: true, file: envPath, warnings }, null, 2));

if (values.get("ALLOW_DEV_OTP_RESPONSE") === "true") errors.push("ALLOW_DEV_OTP_RESPONSE must not be true in staging or production");
