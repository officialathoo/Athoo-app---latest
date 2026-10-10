#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const errors = [];
const warnings = [];

function exists(file) {
  return fs.existsSync(path.join(root, file));
}

function read(file) {
  const fullPath = path.join(root, file);
  if (!fs.existsSync(fullPath)) {
    errors.push(`Missing required file: ${file}`);
    return "";
  }
  return fs.readFileSync(fullPath, "utf8");
}

function requireFiles(label, files) {
  for (const file of files) {
    if (!exists(file)) errors.push(`${label}: missing ${file}`);
  }
}

function requireText(file, checks) {
  const text = read(file);
  for (const [label, needle] of checks) {
    if (typeof needle === "string") {
      if (!text.includes(needle)) errors.push(`${file}: missing ${label}`);
    } else if (!needle.test(text)) {
      errors.push(`${file}: missing ${label}`);
    }
  }
  return text;
}

function requireOrder(file, first, second, label) {
  const text = read(file);
  const firstIndex = text.indexOf(first);
  const secondIndex = text.indexOf(second);
  if (firstIndex === -1 || secondIndex === -1 || firstIndex > secondIndex) {
    errors.push(`${file}: invalid order for ${label}`);
  }
}

function listFiles(dir, suffixes, out = []) {
  const full = path.join(root, dir);
  if (!fs.existsSync(full)) return out;
  for (const entry of fs.readdirSync(full, { withFileTypes: true })) {
    if (["node_modules", ".git", "dist", "build", "coverage", ".expo", ".cache", ".next"].includes(entry.name)) continue;
    const rel = path.join(dir, entry.name).replace(/\\/g, "/");
    if (entry.isDirectory()) listFiles(rel, suffixes, out);
    else if (suffixes.some((suffix) => rel.endsWith(suffix))) out.push(rel);
  }
  return out;
}

requireFiles("workspace", [
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "tsconfig.base.json",
  "render.yaml",
  "vercel.json",
  "eas.json",
  "athoo-app/eas.json",
]);

requireFiles("api domains", [
  "api-server/src/app.ts",
  "api-server/src/routes/index.ts",
  "api-server/src/routes/auth.ts",
  "api-server/src/routes/authSelectedRecovery.ts",
  "api-server/src/routes/bookings.ts",
  "api-server/src/routes/negotiations.ts",
  "api-server/src/routes/broadcast.ts",
  "api-server/src/routes/chat.ts",
  "api-server/src/routes/calls.ts",
  "api-server/src/routes/invoices.ts",
  "api-server/src/routes/payments.ts",
  "api-server/src/routes/refunds.ts",
  "api-server/src/routes/withdrawals.ts",
  "api-server/src/routes/providers.ts",
  "api-server/src/routes/categories.ts",
  "api-server/src/routes/service-areas.ts",
  "api-server/src/routes/geo.ts",
  "api-server/src/routes/storage.ts",
  "api-server/src/routes/admin.ts",
  "api-server/src/routes/support.ts",
  "api-server/src/middlewares/auth.ts",
  "api-server/src/lib/otpDelivery.ts",
  "api-server/src/lib/businessRules.ts",
  "api-server/src/lib/providerAvailability.ts",
  "api-server/src/lib/locationIntegrity.ts",
  "api-server/src/lib/storageSecurity.ts",
  "api-server/src/lib/verifiedUploads.ts",
  "api-server/src/lib/uploadScanner.ts",
  "api-server/src/domain/booking-status.ts",
  "api-server/src/domain/invoiceCalculation.ts",
]);

requireFiles("mobile app", [
  "athoo-app/app/_layout.tsx",
  "athoo-app/app/auth/welcome.tsx",
  "athoo-app/app/auth/login.tsx",
  "athoo-app/app/auth/register.tsx",
  "athoo-app/app/auth/provider-register.tsx",
  "athoo-app/app/auth/forgot-password.tsx",
  "athoo-app/app/auth/email-verification.tsx",
  "athoo-app/app/(customer)/(tabs)/home.tsx",
  "athoo-app/app/(customer)/(tabs)/search.tsx",
  "athoo-app/app/(customer)/(tabs)/bookings.tsx",
  "athoo-app/app/(customer)/(tabs)/chat.tsx",
  "athoo-app/app/(customer)/(tabs)/profile.tsx",
  "athoo-app/app/(provider)/(tabs)/dashboard.tsx",
  "athoo-app/app/(provider)/(tabs)/jobs.tsx",
  "athoo-app/app/(provider)/(tabs)/chat.tsx",
  "athoo-app/app/(provider)/(tabs)/earnings.tsx",
  "athoo-app/app/(provider)/(tabs)/profile.tsx",
  "athoo-app/context/AuthContext.tsx",
  "athoo-app/context/NotificationContext.tsx",
  "athoo-app/context/BookingContext.tsx",
  "athoo-app/context/BroadcastContext.tsx",
  "athoo-app/context/CallContext.tsx",
  "athoo-app/context/ChatContext.tsx",
  "athoo-app/context/NegotiationContext.tsx",
  "athoo-app/services/api.ts",
  "athoo-app/services/NotificationService.ts",
  "athoo-app/services/location.ts",
  "athoo-app/services/biometric.ts",
  "athoo-app/app.config.js",
]);

requireFiles("admin and release gates", [
  "admin-panel/src/App.tsx",
  "admin-panel/src/main.tsx",
  "admin-panel/src/lib/api.ts",
  "scripts/tools/project-check.mjs",
  "scripts/tools/release-check.mjs",
  "scripts/tools/validate-operations-readiness.mjs",
  "scripts/tools/validate-release-blueprints.mjs",
  "scripts/tools/security-scan.mjs",
  "scripts/tools/connected-runtime-verify.mjs",
  "scripts/tools/performance-smoke.mjs",
  "scripts/tools/validate-mobile-release.mjs",
  "scripts/tools/validate-beta-qa.mjs",
  "scripts/tools/validate-device-acceptance.mjs",
  "scripts/tools/postdeploy-verify.mjs",
  "docs/runbooks/DEVICE_ACCEPTANCE_RUNBOOK.md",
  "docs/qa/device-acceptance-checklist.json",
  "docs/qa/device-acceptance-evidence-template.json",
]);

const routeIndex = requireText("api-server/src/routes/index.ts", [
  ["selected recovery router import", "authSelectedRecoveryRouter"],
  ["auth routes", "router.use(\"/auth\", authRouter)"],
  ["bookings routes", "router.use(\"/bookings\", bookingsRouter)"],
  ["negotiations routes", "router.use(\"/negotiations\", negotiationsRouter)"],
  ["broadcast routes", "router.use(\"/broadcast\", broadcastRouter)"],
  ["chat routes", "router.use(\"/chat\", chatRouter)"],
  ["calls routes", "router.use(\"/calls\", callsRouter)"],
  ["payments routes", "router.use(\"/payments\", paymentsRouter)"],
  ["refunds routes", "router.use(\"/refunds\", refundsRouter)"],
  ["withdrawals routes", "router.use(\"/withdrawals\", withdrawalsRouter)"],
  ["invoices routes", "router.use(\"/invoices\", invoicesRouter)"],
  ["storage routes", "router.use(storageRouter)"],
  ["geo routes", "router.use(\"/geo\", geoRouter)"],
  ["service areas routes", "router.use(\"/service-areas\", serviceAreasPublicRouter)"],
  ["admin routes", "router.use(\"/admin\", adminRouter)"],
]);

if (!routeIndex.includes("router.use(\"/auth\", authSelectedRecoveryRouter);\nrouter.use(\"/auth\", authRouter);")) {
  errors.push("api-server/src/routes/index.ts: selected password recovery router must mount before auth router");
}
requireOrder("api-server/src/routes/index.ts", "router.use(\"/me/account\", accountRouter)", "router.use(\"/me\", meRouter)", "specific /me/account before generic /me");

requireText("api-server/src/app.ts", [
  ["production HTTPS gate", "HTTPS_REQUIRED"],
  ["helmet enabled", "app.use(helmet"],
  ["CORS allowlist", "CORS_ORIGINS"],
  ["response no-store", "Cache-Control"],
  ["global rate limit", "GLOBAL_RATE_LIMIT"],
  ["auth token rate limit", "AUTH_TOKEN_RATE_LIMIT"],
  ["OTP rate limit", "/api/auth/send-otp"],
  ["unsafe JSON guard", "FORBIDDEN_KEYS"],
  ["request id header", "X-Request-Id"],
]);

requireText("api-server/src/middlewares/auth.ts", [
  ["JWT secret required", "FATAL:"],
  ["issuer configured", "JWT_ISSUER"],
  ["audience configured", "JWT_AUDIENCE"],
  ["access token type guard", "decoded.tokenType !== \"access\""],
  ["session active guard", "isSessionActive"],
  ["session revoked response", "SESSION_REVOKED"],
  ["blocked account guard", "isBlocked"],
  ["deleted account guard", "accountStatus === \"deleted\""],
]);

requireText("api-server/src/routes/authSelectedRecovery.ts", [
  ["forgot password selected send route", "/forgot-password/send-otp"],
  ["email selected channel", "selectedContact === \"email\""],
  ["Evolution WhatsApp reset delivery", "evolution_whatsapp"],
  ["email reset delivery", "deliveryChannels: selectedContact === \"email\""],
  ["opaque challenge token", "password_reset_challenge"],
  ["production code hidden", "...(isDev && user ? { code"],
]);

requireText("api-server/src/lib/otpDelivery.ts", [
  ["Evolution WhatsApp channel", "evolution_whatsapp"],
  ["canonical Evolution base URL", "EVOLUTION_API_BASE_URL"],
  ["legacy Evolution base URL fallback", "EVOLUTION_API_URL"],
  ["registration phone-only channel guard", "args.purpose === \"registration\""],
  ["delivery channel configuration", "OTP_DELIVERY_CHANNELS"],
]);

requireText("api-server/src/routes/bookings.ts", [
  ["start PIN lifetime", /PIN_TTL_MS\s*=\s*3\s*\*\s*60\s*\*\s*1000/],
  ["start PIN field", "startPin"],
  ["completion PIN field", "completePin"],
  ["invoice creation", "tx.insert(invoicesTable)"],
  ["commission calculation", "commissionAmount"],
  ["provider location radius", "providerWithinRadius"],
  ["active work block", "getCustomerActiveWorkBlock"],
  ["booking status transition guard", "canTransitionBookingStatus"],
]);

requireText("api-server/src/routes/storage.ts", [
  ["upload policy", "validateUploadPolicy"],
  ["upload scanner", "scanStoredUpload"],
  ["verified upload serving", "isUploadReadyForServing"],
  ["object authorization", "canReadStoredUploadObject"],
  ["purpose token read", "verifyActivePurposeToken"],
]);

requireText("api-server/src/lib/providerAvailability.ts", [
  ["distance calculation", "distanceKm"],
  ["radius check", "providerWithinRadius"],
  ["schedule check", "providerScheduleAllows"],
]);

requireText("athoo-app/app/_layout.tsx", [
  ["single session route guard", "SessionRouteGuard"],
  ["customer home destination", "/(customer)/(tabs)/home"],
  ["provider dashboard destination", "/(provider)/(tabs)/dashboard"],
  ["password reset auth path allowed", "/auth/forgot-password"],
  ["guarded replace navigation", "router.replace(destination"],
]);
const rootLayout = read("athoo-app/app/_layout.tsx");
if (rootLayout.includes("addNotificationResponseReceivedListener")) {
  errors.push("athoo-app/app/_layout.tsx: notification response listener must remain owned by NotificationContext");
}

requireText("athoo-app/context/NotificationContext.tsx", [
  ["notification tap navigation owner", "addNotificationResponseReceivedListener"],
]);

requireText("athoo-app/app.config.js", [
  ["local authentication plugin", "expo-local-authentication"],
  ["foreground location plugin", "expo-location"],
]);
const appConfig = read("athoo-app/app.config.js");
if (appConfig.includes("ACCESS_BACKGROUND_LOCATION") || appConfig.includes("NSLocationAlwaysUsageDescription")) {
  errors.push("athoo-app/app.config.js: background/always location permission must not be declared for foreground-only tracking");
}

requireText("athoo-app/services/api.ts", [
  ["configured API base URL", "EXPO_PUBLIC_API_BASE_URL"],
  ["device id header support", /X-Athoo-Device-Id/i],
]);

const easRoot = requireText("eas.json", [
  ["preview profile", "\"preview\""],
  ["preview apk", "\"buildType\": \"apk\""],
  ["production app bundle", "\"buildType\": \"app-bundle\""],
  ["require committed source", "\"requireCommit\": true"],
]);
const easMobile = read("athoo-app/eas.json");
if (easRoot !== easMobile) warnings.push("Root eas.json and athoo-app/eas.json are not identical; verify local build uses intended profile.");

const packageJson = JSON.parse(read("package.json"));
for (const script of [
  "release:verify:code",
  "security:scan",
  "mobile:validate",
  "beta:validate",
  "device:validate",
  "runtime:verify:connected",
  "launch:postdeploy",
  "performance:smoke",
]) {
  if (!packageJson.scripts?.[script]) errors.push(`package.json: missing script ${script}`);
}

const schema = requireText("lib/db/src/schema/index.ts", [
  ["users table", "usersTable"],
  ["verified email uniqueness", "users_verified_email_lower_uidx"],
  ["provider geo index", "users_provider_geo_idx"],
  ["bookings table", "bookingsTable"],
  ["invoices table", "invoicesTable"],
  ["commission payments table", "commissionPaymentsTable"],
  ["subscription plans table", "subscriptionPlansTable"],
  ["account deletion table", "accountDeletionRequestsTable"],
]);
if (!schema.includes("uniqueIndex")) errors.push("lib/db/src/schema/index.ts: schema must declare uniqueness guards");

const tsFiles = listFiles("api-server/src", [".ts"])
  .concat(listFiles("athoo-app", [".ts", ".tsx"]))
  .concat(listFiles("admin-panel/src", [".ts", ".tsx"]));
for (const file of tsFiles) {
  const text = read(file);
  if (/row_to_json\(\s*u\s*\)/i.test(text)) errors.push(`${file}: unsafe raw user row JSON projection`);
  if (/[?&]token=\$\{encodeURIComponent\((?:getToken\(\)|accessToken)\)\}/.test(text)) {
    errors.push(`${file}: long-lived access token must not be embedded in URL`);
  }
}

const checklist = JSON.parse(read("docs/qa/device-acceptance-checklist.json"));
for (const platform of ["android", "ios"]) {
  const count = Array.isArray(checklist?.platforms?.[platform]) ? checklist.platforms[platform].length : 0;
  if (count < 35) errors.push(`docs/qa/device-acceptance-checklist.json: ${platform} must contain at least 35 cases`);
}
const crossRoleCount = Array.isArray(checklist?.crossRole) ? checklist.crossRole.length : 0;
if (crossRoleCount < 24) errors.push("docs/qa/device-acceptance-checklist.json: crossRole must contain at least 24 cases");

if (errors.length) {
  console.error(`Launch 360 audit failed:\n- ${errors.join("\n- ")}`);
  process.exit(1);
}

console.log(`Launch 360 audit gate passed (${tsFiles.length} source files inspected, ${warnings.length} warning${warnings.length === 1 ? "" : "s"}).`);
for (const warning of warnings) console.warn(`Warning: ${warning}`);
