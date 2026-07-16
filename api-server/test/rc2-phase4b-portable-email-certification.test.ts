import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (relativePath: string) =>
  fs.readFileSync(new URL(`../../${relativePath}`, import.meta.url), "utf8");

const paths = {
  schema: "lib/db/src/schema/index.ts",
  migration: "deploy/migrations/20260715_portable_email_delivery_verification.sql",
  migrations: "lib/db/src/migrations.ts",
  email: "api-server/src/lib/email.ts",
  templates: "api-server/src/lib/emailTemplates.ts",
  delivery: "api-server/src/lib/emailDelivery.ts",
  emailAuth: "api-server/src/lib/emailAuth.ts",
  auth: "api-server/src/routes/auth.ts",
  account: "api-server/src/routes/account.ts",
  emailRoutes: "api-server/src/routes/email.ts",
  adminRoutes: "api-server/src/routes/admin.ts",
  routes: "api-server/src/routes/index.ts",
  notifications: "api-server/src/lib/notifications.ts",
  app: "api-server/src/app.ts",
  validator: "scripts/tools/validate-environment.mjs",
  render: "render.yaml",
  envExample: ".env.production.example",
  mobileApi: "athoo-app/services/api.ts",
  authContext: "athoo-app/context/AuthContext.tsx",
  login: "athoo-app/app/auth/login.tsx",
  emailVerification: "athoo-app/app/auth/email-verification.tsx",
  emailPreferences: "athoo-app/app/email-preferences.tsx",
  language: "athoo-app/context/LanguageContext.tsx",
  adminPage: "admin-panel/src/pages/EmailCenterPage.tsx",
  adminApp: "admin-panel/src/App.tsx",
  sidebar: "admin-panel/src/components/layout/Sidebar.tsx",
};

test("portable email migration and schema preserve provider-neutral durable state", () => {
  const schema = read(paths.schema);
  const migration = read(paths.migration);
  const migrations = read(paths.migrations);
  for (const table of [
    "email_verification_challenges",
    "email_preferences",
    "email_campaigns",
    "email_deliveries",
  ]) {
    assert.match(schema, new RegExp(`pgTable\\("${table}"`));
    assert.match(migration, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
  }
  assert.match(schema, /users_verified_email_lower_uidx/);
  assert.match(schema, /lower\(trim\(/);
  assert.match(migration, /duplicate_verified_emails/);
  assert.match(migration, /ON users \(lower\(trim\(email\)\)\)/);
  assert.match(migration, /email_challenges_purpose_check/);
  assert.match(migration, /email_campaigns_status_check/);
  assert.match(migration, /email_deliveries_status_check/);
  assert.match(migrations, /20260716_workflow_inactivity_policy_governance\.sql/);
});

test("email provider is a portable SMTP adapter with safe operational status", () => {
  const email = read(paths.email);
  assert.match(email, /type EmailProviderKind = "smtp" \| "console" \| "disabled"/);
  assert.match(email, /Any SMTP-compatible vendor name/);
  assert.match(email, /configuredProvider/);
  assert.match(email, /SMTP_TLS_REJECT_UNAUTHORIZED/);
  assert.match(email, /SMTP_CONNECTION_TIMEOUT_MS/);
  assert.match(email, /verifyEmailTransport/);
  assert.match(email, /headers: args\.headers/);
  assert.doesNotMatch(email, /smtp\.gmail\.com|smtp\.zoho\.|api\.sendgrid\.|api\.mailgun\./i);
  assert.doesNotMatch(email, /const subject = `\$\{purpose\} code: \$\{code\}`/);
  assert.match(email, /EMAIL_BRAND_NAME/);
  const templates = read(paths.templates);
  assert.match(templates, /EMAIL_BRAND_DESCRIPTOR/);
  assert.match(templates, /replace\(\/\[\\r\\n\]\+\/g, " "\)/);
});

test("email challenges use HMAC hashes, cooldown, expiry, and bounded attempts", () => {
  const emailAuth = read(paths.emailAuth);
  const schema = read(paths.schema);
  assert.match(emailAuth, /createHmac\("sha256"/);
  assert.match(emailAuth, /timingSafeEqual/);
  assert.match(emailAuth, /crypto\.randomInt\(100000, 1_000_000\)/);
  assert.match(emailAuth, /EMAIL_OTP_TTL_SECONDS/);
  assert.match(emailAuth, /EMAIL_OTP_RESEND_COOLDOWN_SECONDS/);
  assert.match(emailAuth, /EMAIL_OTP_MAX_ATTEMPTS/);
  assert.match(emailAuth, /replaced_by_new_code/);
  assert.match(emailAuth, /delivery_failed/);
  assert.match(emailAuth, /attempt_limit/);
  assert.match(emailAuth, /SET attempts = attempts \+ 1/);
  assert.match(emailAuth, /WHERE id = \$1 AND used_at IS NULL/);
  assert.match(emailAuth, /allowPendingAddress/);
  assert.match(schema, /codeHash: text\("code_hash"\)/);
  assert.doesNotMatch(schema, /emailVerificationChallengesTable[\s\S]{0,1000}\bcode:\s*text\(/);
});

test("email OTP login validates role, account state, and verified ownership before sending", () => {
  const auth = read(paths.auth);
  const sendStart = auth.indexOf('router.post("/email/send-otp"');
  const sendEnd = auth.indexOf('router.post("/email/verify-otp"', sendStart);
  const block = auth.slice(sendStart, sendEnd);
  const accountCheck = block.indexOf("accountUnavailableResponse(user, expectedRole)");
  const verifiedCheck = block.indexOf("!user.emailVerified");
  const challenge = block.indexOf("sendEmailChallenge");
  assert.ok(sendStart >= 0 && sendEnd > sendStart);
  assert.match(block, /findEmailLoginUser\(email, expectedRole\)/);
  assert.match(auth, /matches\.find\(\(candidate\) => candidate\.role === expectedRole\)/);
  assert.match(auth, /lower\(trim\(\$\{usersTable\.email\}\)\)/);
  assert.ok(accountCheck >= 0 && verifiedCheck > accountCheck && challenge > verifiedCheck);
  assert.match(block, /isAuthIdentityBlacklisted/);
  assert.match(block, /purpose: "login"/);
  assert.match(auth, /method: "email_otp"/);
  assert.match(auth, /queueNewDeviceEmail/);
});

test("registration verification, email change, recovery, and security alerts are wired", () => {
  const auth = read(paths.auth);
  const account = read(paths.account);
  const routes = read(paths.emailRoutes);
  const adminRoutes = read(paths.adminRoutes);
  assert.match(auth, /emailVerificationRequired/);
  assert.match(auth, /purpose: "verify_email"/);
  assert.match(auth, /queueWelcomeEmail/);
  assert.match(auth, /password_reset/);
  assert.match(auth, /queuePasswordChangedEmail/);
  assert.match(auth, /endpoint cannot be used to discover whether an account exists/);
  assert.match(auth, /isDev && user \? \{ code, maskedPhone, emailSent, whatsappSent, smsSent, deliveryChannel \} : \{\}/);
  assert.match(account, /purpose: "email_change"/);
  assert.match(account, /EMAIL_IN_USE/);
  assert.match(account, /revokeAllUserSessions\(req\.user!\.userId, "email_changed"\)/);
  assert.match(routes, /userRouter\.post\("\/verification\/send"/);
  assert.match(routes, /userRouter\.post\("\/verification\/verify"/);
  assert.match(routes, /userRouter\.get\("\/preferences"/);
  assert.match(routes, /userRouter\.patch\("\/preferences"/);
  assert.match(adminRoutes, /templateKey: "account_status"/);
  assert.match(adminRoutes, /status: "blocked"/);
  assert.match(adminRoutes, /status: "deactivated"/);
});

test("durable email delivery provides retries, dedupe, suppression, consent, and unsubscribe", () => {
  const delivery = read(paths.delivery);
  const routes = read(paths.emailRoutes);
  assert.match(delivery, /registerJobHandler<\{ deliveryId: string \}>\(EMAIL_JOB_NAME/);
  assert.match(delivery, /registerJobHandler<\{ campaignId: string \}>\(EMAIL_CAMPAIGN_JOB_NAME/);
  assert.match(delivery, /EMAIL_QUEUE_MAX_ATTEMPTS/);
  assert.match(delivery, /startEmailMaintenance/);
  assert.match(delivery, /EMAIL_CHALLENGE_RETENTION_DAYS/);
  assert.match(delivery, /EMAIL_DELIVERY_RETENTION_DAYS/);
  assert.match(delivery, /dedupeKey: `email-delivery:/);
  assert.match(delivery, /marketing_unsubscribed/);
  assert.match(delivery, /email_not_verified/);
  assert.match(delivery, /pendingAddressAllowed/);
  assert.match(delivery, /metadata: \(delivery\.metadata \|\| \{\}\)/);
  assert.match(delivery, /EMAIL_QUEUE_ENQUEUE_FAILED/);
  assert.match(delivery, /emailMaintenanceInitialTimer/);
  assert.match(delivery, /List-Unsubscribe/);
  assert.match(delivery, /List-Unsubscribe-Post/);
  assert.match(delivery, /List-Unsubscribe=One-Click/);
  assert.match(delivery, /EMAIL_MARKETING_ENABLED/);
  assert.match(delivery, /marketingEmails === false \|\| preferences\.unsubscribedAt/);
  assert.match(routes, /marketing_unsubscribe/);
  assert.match(routes, /publicRouter\.get\("\/unsubscribe", showUnsubscribePage\)/);
  assert.match(routes, /publicRouter\.post\("\/unsubscribe", performUnsubscribe\)/);
  assert.match(routes, /link scanners cannot silently unsubscribe users/);
  assert.match(routes, /unsubscribedAt: new Date\(\)/);
  assert.match(routes, /marketingEmails: false/);
});

test("campaign delivery is permissioned, bounded, cancellable, and filters inactive accounts", () => {
  const delivery = read(paths.delivery);
  const routes = read(paths.emailRoutes);
  assert.match(delivery, /EMAIL_MARKETING_MAX_RECIPIENTS/);
  assert.match(delivery, /eq\(usersTable\.emailVerified, true\)/);
  assert.match(delivery, /eq\(usersTable\.accountStatus, "active"\)/);
  assert.match(delivery, /eq\(usersTable\.isBlocked, false\)/);
  assert.match(delivery, /eq\(usersTable\.isDeactivated, false\)/);
  assert.match(delivery, /campaign\.status === "cancelled" \|\| campaign\.status === "completed"/);
  assert.match(delivery, /dedupeKey: `email-campaign:\$\{campaignId\}:\$\{dispatchKey\}`/);
  assert.match(delivery, /set\(\{ status: "failed"/);
  assert.match(routes, /requirePermission\("marketing\.read"\)/);
  assert.match(routes, /requirePermission\("marketing\.write"\)/);
  assert.match(routes, /status} in \('draft', 'queued'\)/);
  assert.match(routes, /EMAIL_MARKETING_ENABLED=true/);
  assert.match(routes, /status} in \('draft', 'failed'\)/);
  assert.match(routes, /dispatchKey = crypto\.randomUUID\(\)/);
});

test("transactional and booking notifications can queue email without coupling push delivery", () => {
  const notifications = read(paths.notifications);
  assert.match(notifications, /email\?: NotificationEmailOptions \| false/);
  assert.match(notifications, /queueEmail\(/);
  assert.match(notifications, /notification-email:/);
  assert.match(notifications, /notification email queue failed/);
  for (const route of ["bookings", "negotiations"]) {
    const source = read(`api-server/src/routes/${route}.ts`);
    assert.match(source, /email: \{ category: "booking" \}/);
  }
  for (const route of ["payments", "refunds", "subscriptions", "withdrawals", "rate-requests"]) {
    const source = read(`api-server/src/routes/${route}.ts`);
    assert.match(source, /email: \{ category: "transactional" \}/);
  }
});

test("mobile supports email OTP, verification, and user-controlled preferences", () => {
  const api = read(paths.mobileApi);
  const context = read(paths.authContext);
  const login = read(paths.login);
  const verification = read(paths.emailVerification);
  const preferences = read(paths.emailPreferences);
  const apiErrors = read("athoo-app/lib/apiError.ts");
  const language = read(paths.language);
  assert.match(api, /sendEmailOtp\(/);
  assert.match(api, /verifyEmailOtp\(/);
  assert.match(api, /getEmailVerificationStatus/);
  assert.match(api, /getEmailPreferences/);
  assert.match(api, /updateEmailPreferences/);
  assert.match(context, /verifyEmailOtpAndLogin/);
  assert.match(login, /otpChannel.*"phone" \| "email"/);
  assert.match(login, /expectedLength = otpChannel === "email" \? 6 : 4/);
  assert.match(verification, /sendEmailVerification/);
  assert.match(verification, /verifyEmailVerification/);
  assert.match(preferences, /marketingEmails/);
  assert.match(preferences, /bookingUpdates/);
  assert.match(preferences, /productUpdates/);
  assert.match(apiErrors, /EMAIL address is not verified|email address is not verified/i);
  assert.match(apiErrors, /Email delivery is temporarily unavailable/);
  assert.match(language, /"Verify Email": "ای میل کی تصدیق کریں"/);
  assert.match(language, /"Offers and promotions": "آفرز اور تشہیری پیغامات"/);
});

test("admin email center exposes configuration diagnostics, delivery audit, and campaigns", () => {
  const page = read(paths.adminPage);
  const app = read(paths.adminApp);
  const sidebar = read(paths.sidebar);
  const routes = read(paths.routes);
  assert.match(page, /verify-transport/);
  assert.match(page, /deliveries/);
  assert.match(page, /campaigns/);
  assert.match(page, /marketingMaxRecipients/);
  assert.match(app, /EmailCenterPage/);
  assert.match(app, /path="\/email-center"/);
  assert.match(sidebar, /to: "\/email-center"/);
  assert.match(routes, /router\.use\("\/email", emailPublicRouter\)/);
  assert.match(routes, /router\.use\("\/me\/email", emailUserRouter\)/);
  assert.match(routes, /router\.use\("\/admin\/email", emailAdminRouter\)/);
});

test("deployment configuration remains provider-neutral and validates unsafe settings", () => {
  const validator = read(paths.validator);
  const render = read(paths.render);
  const example = read(paths.envExample);
  assert.match(render, /key: EMAIL_PROVIDER[\s\S]{0,80}value: smtp/);
  assert.match(render, /key: SMTP_HOST[\s\S]{0,80}sync: false/);
  assert.match(render, /key: SMTP_PASS[\s\S]{0,80}sync: false/);
  assert.doesNotMatch(render, /smtp\.zoho\.|zoho_smtp/i);
  assert.match(example, /EMAIL_PROVIDER=smtp/);
  assert.match(example, /SMTP_HOST=/);
  assert.match(example, /EMAIL_MARKETING_ENABLED=false/);
  assert.match(validator, /EMAIL_PROVIDER=console is not allowed/);
  assert.match(validator, /SMTP_TLS_REJECT_UNAUTHORIZED=false is not allowed/);
  assert.match(validator, /EMAIL_MARKETING_ENABLED=true requires/);
  assert.match(validator, /EMAIL_OTP_HASH_SECRET/);
  assert.match(validator, /EMAIL_CHALLENGE_RETENTION_DAYS/);
  assert.match(validator, /EMAIL_DELIVERY_RETENTION_DAYS/);
  assert.match(validator, /EMAIL_CHANGE_VERIFY_RATE_LIMIT_MAX/);
  const app = read(paths.app);
  assert.match(app, /\/api\/me\/account\/email\/request/);
  assert.match(app, /\/api\/me\/account\/email\/verify/);
  assert.match(app, /EMAIL_ADMIN_TEST_RATE_LIMIT_MAX/);
});

test("email secrets are server-only and are not embedded in mobile or admin bundles", () => {
  const mobileFiles = [paths.mobileApi, paths.authContext, paths.login, paths.emailVerification, paths.emailPreferences]
    .map(read).join("\n");
  const adminFiles = [paths.adminPage, paths.adminApp, paths.sidebar].map(read).join("\n");
  for (const source of [mobileFiles, adminFiles]) {
    assert.doesNotMatch(source, /SMTP_PASS|EMAIL_OTP_HASH_SECRET|SMTP_USER|smtp\.zoho\.|smtp\.gmail\./i);
  }
});
