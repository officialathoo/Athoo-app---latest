#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const errors = [];

function requireText(file, pattern, message) {
  if (!pattern.test(read(file))) errors.push(`${file}: ${message}`);
}

const envLines = read(".env.production.example").split(/\r?\n/);
const seen = new Set();
for (const [index, raw] of envLines.entries()) {
  const match = raw.trim().match(/^([A-Z][A-Z0-9_]*)=/);
  if (!match) continue;
  if (seen.has(match[1])) errors.push(`.env.production.example:${index + 1}: duplicate ${match[1]}`);
  seen.add(match[1]);
}

for (const key of [
  "RELEASE_VERSION", "VITE_RELEASE_VERSION", "EXPO_PUBLIC_RELEASE_VERSION", "DATABASE_URL", "JWT_SECRET", "REFRESH_TOKEN_SECRET", "SESSION_SECRET",
  "CORS_ORIGINS", "STORAGE_PROVIDER", "QUEUE_PROVIDER", "CACHE_PROVIDER", "PUSH_PROVIDER", "EMAIL_PROVIDER",
  "OTP_DELIVERY_CHANNELS", "MAP_PROVIDER", "TURN_URLS", "TURN_USERNAME", "TURN_CREDENTIAL",
  "INCIDENT_COMMANDER_CONTACT", "SUPPORT_ESCALATION_EMAIL", "USER_ACTIVITY_WRITE_INTERVAL_MS",
  "INACTIVITY_SWEEP_MIN_INTERVAL_MS", "SERVER_REQUEST_TIMEOUT_MS", "SERVER_HEADERS_TIMEOUT_MS",
  "SERVER_KEEP_ALIVE_TIMEOUT_MS", "WS_MAX_PAYLOAD_BYTES", "WS_MAX_CONNECTIONS_PER_SESSION",
  "DB_POOL_MAX", "QUEUE_CONCURRENCY", "BROADCAST_DELIVERY_CONCURRENCY",
  "BROADCAST_RESPONSE_PROVIDER_BATCH_SIZE", "MAX_UPLOAD_BYTES", "SIGNED_UPLOAD_TTL_SECONDS",
  "SIGNED_READ_TTL_SECONDS", "MICRO_CACHE_TTL_MS", "BOOKING_TIME_ZONE",
  "BOOKING_NO_SHOW_AUTO_CANCEL_ENABLED", "BOOKING_NO_SHOW_GRACE_MINUTES",
  "BOOKING_NO_SHOW_SWEEP_BATCH_SIZE", "BOOKING_ARRIVAL_RADIUS_KM",
  "BOOKING_ARRIVAL_MAX_ACCURACY_METERS", "SERVICE_COUNTRY_CODE", "SERVICE_COUNTRY_MIN_LAT", "SERVICE_COUNTRY_MAX_LAT",
  "SERVICE_COUNTRY_MIN_LNG", "SERVICE_COUNTRY_MAX_LNG", "LOCATION_MAX_ACCURACY_METERS",
  "LOCATION_CONFIRMATION_MAX_AGE_MS", "UPLOAD_SCAN_MODE", "UPLOAD_SCANNER_URL",
  "UPLOAD_SCANNER_TOKEN", "UPLOAD_LEGACY_READ_POLICY", "UPLOAD_SECURITY_MAINTENANCE_ENABLED",
  "INVOICE_VERIFICATION_SECRET", "AUTH_TOKEN_RATE_LIMIT_WINDOW_MS", "AUTH_TOKEN_RATE_LIMIT_MAX",
  "INVOICE_VERIFY_RATE_LIMIT_MAX",
]) {
  if (!seen.has(key)) errors.push(`.env.production.example: missing ${key}`);
}

const render = read("render.yaml");
for (const key of [
  "RELEASE_VERSION", "DATABASE_URL", "JWT_SECRET", "REFRESH_TOKEN_SECRET", "SESSION_SECRET",
  "JWT_ISSUER", "JWT_AUDIENCE", "TRUST_PROXY", "STORAGE_PROVIDER", "QUEUE_PROVIDER", "CACHE_PROVIDER",
  "PUSH_PROVIDER", "EMAIL_PROVIDER", "OTP_DELIVERY_CHANNELS", "MAP_PROVIDER",
  "CALL_PROVIDER", "TURN_URLS", "TURN_USERNAME", "TURN_CREDENTIAL",
  "INCIDENT_COMMANDER_CONTACT", "SUPPORT_ESCALATION_EMAIL", "USER_ACTIVITY_WRITE_INTERVAL_MS",
  "INACTIVITY_SWEEP_MIN_INTERVAL_MS", "SERVER_REQUEST_TIMEOUT_MS", "SERVER_HEADERS_TIMEOUT_MS",
  "SERVER_KEEP_ALIVE_TIMEOUT_MS", "WS_MAX_PAYLOAD_BYTES", "WS_MAX_CONNECTIONS_PER_SESSION",
  "BOOKING_TIME_ZONE", "BOOKING_NO_SHOW_AUTO_CANCEL_ENABLED", "BOOKING_NO_SHOW_GRACE_MINUTES",
  "BOOKING_NO_SHOW_SWEEP_BATCH_SIZE", "BOOKING_ARRIVAL_RADIUS_KM",
  "BOOKING_ARRIVAL_MAX_ACCURACY_METERS", "SERVICE_COUNTRY_CODE", "SERVICE_COUNTRY_MIN_LAT", "SERVICE_COUNTRY_MAX_LAT",
  "SERVICE_COUNTRY_MIN_LNG", "SERVICE_COUNTRY_MAX_LNG", "LOCATION_MAX_ACCURACY_METERS",
  "LOCATION_CONFIRMATION_MAX_AGE_MS", "UPLOAD_SCAN_MODE", "UPLOAD_SCANNER_URL",
  "UPLOAD_SCANNER_TOKEN", "UPLOAD_LEGACY_READ_POLICY", "INVOICE_VERIFICATION_SECRET",
  "AUTH_TOKEN_RATE_LIMIT_WINDOW_MS", "AUTH_TOKEN_RATE_LIMIT_MAX", "INVOICE_VERIFY_RATE_LIMIT_MAX",
]) {
  if (!new RegExp(`- key: ${key}(?:\\n|\\r\\n)`).test(render)) errors.push(`render.yaml: missing ${key}`);
}
if (!/pnpm install --frozen-lockfile/.test(render)) errors.push("render.yaml: build must use the frozen lockfile");
if (!/startCommand: pnpm env:validate -- --process && pnpm db:migrate && pnpm --filter @workspace\/api-server start/.test(render)) errors.push("render.yaml: environment-validation/migration/start command is not the certified sequence");
if (!/healthCheckPath: \/api\/healthz\/deep/.test(render)) errors.push("render.yaml: deep production readiness health check is required");

const rootEas = JSON.parse(read("eas.json"));
const appEas = JSON.parse(read("athoo-app/eas.json"));
if (JSON.stringify(rootEas) !== JSON.stringify(appEas)) errors.push("eas.json and athoo-app/eas.json are not synchronized");
if (rootEas.build?.production?.android?.buildType !== "app-bundle") errors.push("eas.json: production Android build must be app-bundle");
if (rootEas.build?.production?.channel !== "production") errors.push("eas.json: production update channel is missing");
const easSerialized = JSON.stringify(rootEas);
for (const forbidden of ["EXPO_PUBLIC_API_BASE_URL", "EXPO_PUBLIC_MAP_PROVIDER", "EAS_PROJECT_ID", "athoo-api.onrender.com"]) {
  if (easSerialized.includes(forbidden)) errors.push(`eas.json: deployment-specific ${forbidden} must be supplied through EAS environment/secrets, not committed profiles`);
}
const appConfig = read("athoo-app/app.config.js");
if (!/readEnv\(\s*"EAS_PROJECT_ID"/.test(appConfig)) errors.push("athoo-app/app.config.js: EAS project ID must come from the environment");
if (/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i.test(appConfig)) errors.push("athoo-app/app.config.js: hard-coded EAS project UUID is not allowed");
requireText("athoo-app/app.config.js", /RELEASE_IDENTITY/, "mobile release identity is not exposed through safe Expo constants");
requireText("athoo-app/app.config.js", /EAS_BUILD_GIT_COMMIT_HASH/, "mobile build does not consume EAS Git provenance");

requireText("admin-panel/vite.config.ts", /athoo-admin-release-manifest/, "admin build does not generate a release manifest");
requireText("admin-panel/vite.config.ts", /fileName:\s*["']release\.json["']/, "admin release manifest asset is missing");
requireText("admin-panel/vite.config.ts", /VERCEL_GIT_COMMIT_SHA/, "admin release manifest does not consume Vercel Git provenance");
requireText("vercel.json", /X-Content-Type-Options/, "security headers are incomplete");
requireText("vercel.json", /Permissions-Policy/, "permissions policy is missing");
requireText("vercel.json", /Content-Security-Policy/, "content security policy is missing");
requireText("vercel.json", /release\.json/, "admin release manifest route is not configured");
requireText("vercel.json", /no-store, max-age=0/, "admin release manifest must not be cached");
requireText("deploy/nginx/admin.conf", /Content-Security-Policy/, "nginx content security policy is missing");
requireText("docker-compose.yml", /127\.0\.0\.1:/, "local database and services must bind to loopback only");
if (/redis:\s*\n/.test(read("docker-compose.yml"))) errors.push("docker-compose.yml: unused Redis service should not be exposed by the certified local stack");
requireText(".github/workflows/connected-runtime.yml", /CONNECTED_PROVIDER_IDENTIFIER/, "controlled provider credentials are not wired");
requireText(".github/workflows/connected-runtime.yml", /CONNECTED_DATABASE_URL/, "connected Neon database secret is not wired");
requireText(".github/workflows/connected-runtime.yml", /pnpm db:status[\s\S]*pnpm db:verify[\s\S]*pnpm db:integrity/, "connected database verification sequence is incomplete");
requireText(".github/workflows/connected-runtime.yml", /CONNECTED_ADMIN_ORIGIN/, "deployed admin verification is not wired");
requireText(".github/workflows/connected-runtime.yml", /CONNECTED_VERIFY_UPLOAD_SCANNER: "true"/, "connected malware-scanner verification is not enabled");
requireText(".github/workflows/connected-runtime.yml", /pnpm\/action-setup@v6[\s\S]*actions\/setup-node@v6[\s\S]*cache: pnpm/, "connected workflow must install pnpm before enabling the pnpm dependency cache");
requireText("scripts/tools/connected-runtime-verify.mjs", /admin release manifest/, "connected verification does not compare admin release identity");
requireText("scripts/tools/connected-runtime-verify.mjs", /storage provider connectivity/, "connected verification does not test object storage");
requireText("scripts/tools/connected-runtime-verify.mjs", /upload malware scanner connectivity/, "connected verification does not test the real malware scanner");
requireText("docs/runbooks/FINAL_CONNECTED_DEPLOYMENT.md", /ATHOO_APP_V2_1_CONNECTED_CERTIFICATION_HARDENED\.zip/, "current Athoo App V2 baseline is not documented");
requireText("docs/runbooks/FINAL_CONNECTED_DEPLOYMENT.md", /20260802_athoo_v2_location_pagination_integrity\.sql/, "latest Athoo App V2 migration is not documented");
requireText("docs/runbooks/PRODUCTION_LAUNCH_RUNBOOK.md", /calls\.productionReady=true|TURN/, "TURN production gate is not documented");
requireText("docs/runbooks/PRODUCTION_LAUNCH_RUNBOOK.md", /malware scanner|UPLOAD_SCANNER_URL/i, "external malware scanner gate is not documented");
requireText("docs/runbooks/PRODUCTION_LAUNCH_RUNBOOK.md", /legacy media|backfill|existing media/i, "existing-media security migration is not documented");

if (errors.length) {
  console.error("Release blueprint validation failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}
console.log("Release blueprint validation passed.");
