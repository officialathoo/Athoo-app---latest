import test from "node:test";
import assert from "node:assert/strict";
import { readRepo } from "./helpers/repo.ts";
import { validateDocumentValidity } from "../src/lib/documentValidity.ts";

test("document validity accepts exact certificate dates and lifetime CNICs without inventing police validity", () => {
  const police = validateDocumentValidity({
    documentType: "police",
    issuedAt: "2026-01-01",
    expiresAt: "2099-01-01",
  });
  assert.equal(police.issuedAt?.toISOString().slice(0, 10), "2026-01-01");
  assert.equal(police.expiresAt?.toISOString().slice(0, 10), "2099-01-01");
  assert.equal(police.expiryNotApplicable, false);

  const lifetime = validateDocumentValidity({
    documentType: "cnic_front",
    expiryNotApplicable: true,
  });
  assert.equal(lifetime.expiresAt, null);
  assert.equal(lifetime.expiryNotApplicable, true);

  assert.throws(
    () => validateDocumentValidity({ documentType: "police", expiryNotApplicable: true }),
    /requires a valid-until date/,
  );
  assert.throws(
    () => validateDocumentValidity({ documentType: "cnic_back", expiryNotApplicable: true, expiresAt: "2099-01-01" }),
    /Do not enter a valid-until date/,
  );
  assert.throws(
    () => validateDocumentValidity({ documentType: "police", issuedAt: "2000-01-01", expiresAt: "2000-06-01" }),
    /today or later/,
  );
});

test("migration and schema implement provider document expiry, renewal requests, and bounded lifecycle state", () => {
  const migration = readRepo("deploy/migrations/20260720_provider_document_expiry_lifecycle.sql");
  const migrations = readRepo("lib/db/src/migrations.ts");
  const schema = readRepo("lib/db/src/schema/index.ts");

  assert.match(migrations, /20260720_release_phase28_professional_workflow_integrity\.sql/);
  assert.match(migration, /provider_document_update_requests/);
  assert.match(migration, /provider_document_updates_one_pending_uidx/);
  assert.match(migration, /document_compliance_status IN \('active','action_required','warning','grace','renewal_pending','suspended'\)/);
  assert.match(migration, /document_type IN \('cnic_front','cnic_back','police'\)/);
  assert.match(migration, /\^\[0-9\]\{4\}-\[0-9\]\{2\}-\[0-9\]\{2\}\$/);
  assert.doesNotMatch(migration, /INTERVAL\s+'6 months'/i);

  assert.match(schema, /documentComplianceStatus: text\("document_compliance_status"\)/);
  assert.match(schema, /documentSuspendedAt: timestamp\("document_suspended_at"\)/);
  assert.match(schema, /providerDocumentUpdateRequestsTable/);
  assert.match(schema, /expiryReminder30SentAt/);
  assert.match(schema, /expiryReminder7SentAt/);
  assert.match(schema, /expiryReminder1SentAt/);
});

test("provider compliance uses configurable seven-day grace, reminders, restricted suspension, and review reactivation", () => {
  const lifecycle = readRepo("api-server/src/lib/documentCompliance.ts");
  const sweeper = readRepo("api-server/src/lib/bookingSweeper.ts");

  assert.match(lifecycle, /DOCUMENT_EXPIRY_GRACE_DAYS \|\| 7/);
  assert.match(lifecycle, /threshold: 30 \| 7 \| 1/);
  assert.match(lifecycle, /threshold: 1[\s\S]*threshold: 7[\s\S]*threshold: 30/);
  assert.match(lifecycle, /remainingDays === 0[\s\S]*expires today/);
  assert.match(lifecycle, /sendExpiryReminder\(provider, group, item\.expiry, candidate\.threshold, remaining, item\.docs\)/);
  assert.match(lifecycle, /expiryReminder30SentAt: reminderSentAt, expiryReminder7SentAt: reminderSentAt/);
  assert.match(lifecycle, /expiryReminder1SentAt: reminderSentAt/);
  assert.match(lifecycle, /documentComplianceStatus: summary\.status/);
  assert.match(lifecycle, /patch\.isAvailable = false/);
  assert.match(lifecycle, /patch\.isVerified = false/);
  assert.match(lifecycle, /patch\.verificationStatus = "in_process"/);
  assert.doesNotMatch(lifecycle, /isDeactivated\s*=\s*true/);
  assert.match(lifecycle, /!summary\.pendingTypes\.length/);
  assert.match(lifecycle, /patch\.verificationStatus = "approved"/);
  assert.match(lifecycle, /DOCUMENT_EXPIRY_SWEEP_BATCH_SIZE/);
  assert.match(lifecycle, /DOCUMENT_EXPIRY_SWEEP_MAX_BATCHES/);
  assert.match(lifecycle, /sweepCursor/);
  assert.match(lifecycle, /restoreProviderAvailabilityIfCompliant/);
  assert.match(lifecycle, /isNull\(usersTable\.documentSuspendedAt\)/);
  assert.match(lifecycle, /eq\(usersTable\.verificationStatus, "approved"\)/);
  assert.match(sweeper, /sweepProviderDocumentCompliance\(\)/);
  assert.match(sweeper, /restoreProviderAvailabilityIfCompliant\(booking\.providerId, "auto_cancelled"\)/);
  const productionEnv = readRepo(".env.production.example");
  const renderBlueprint = readRepo("render.yaml");
  assert.match(productionEnv, /DOCUMENT_EXPIRY_GRACE_DAYS=7/);
  assert.match(productionEnv, /DOCUMENT_EXPIRY_SWEEP_BATCH_SIZE=250/);
  assert.match(renderBlueprint, /key: DOCUMENT_EXPIRY_GRACE_DAYS[\s\S]*value: "7"/);
  assert.match(renderBlueprint, /key: DOCUMENT_EXPIRY_SWEEP_BATCH_SIZE[\s\S]*value: "250"/);

  const bookings = readRepo("api-server/src/routes/bookings.ts");
  const adminRoutes = readRepo("api-server/src/routes/admin.ts");
  assert.match(bookings, /restoreProviderAvailabilityIfCompliant\(existing\.providerId, "cancelled"\)/);
  assert.match(bookings, /restoreProviderAvailabilityIfCompliant\(updated\.providerId, "completed"\)/);
  assert.match(adminRoutes, /restoreProviderAvailabilityIfCompliant\(existing\.providerId, "admin_cancelled"\)/);
  assert.match(adminRoutes, /provider\.documentSuspendedAt/);
  assert.match(adminRoutes, /target\.documentSuspendedAt \|\| target\.documentComplianceStatus === "suspended"/);
  const providers = readRepo("api-server/src/routes/providers.ts");
  assert.match(providers, /me\.documentSuspendedAt \|\| me\.documentComplianceStatus === "suspended"/);
  assert.match(providers, /DOCUMENT_RENEWAL_REQUIRED/);
});

test("provider and admin renewal workflows are secure, routed, counted, and deep-linked", () => {
  const route = readRepo("api-server/src/routes/document-renewals.ts");
  const routes = readRepo("api-server/src/routes/index.ts");
  const admin = readRepo("admin-panel/src/pages/DocumentRenewalsPage.tsx");
  const sidebar = readRepo("admin-panel/src/components/layout/Sidebar.tsx");
  const app = readRepo("admin-panel/src/App.tsx");
  const routing = readRepo("admin-panel/src/lib/adminNotificationRouting.ts");
  const provider = readRepo("athoo-app/app/(provider)/verification-documents.tsx");
  const layout = readRepo("athoo-app/app/(provider)/_layout.tsx");

  assert.match(route, /providerRouter\.use\(requireAuth\)/);
  assert.doesNotMatch(route, /providerRouter\.use\(requireAuthAllowDeactivated\)/);
  assert.match(route, /isOwnedUploadObjectPath\(url, provider\.id, \["private"\]\)/);
  assert.match(route, /postgresErrorCode\(error\) === "23505"/);
  assert.match(route, /requirePermission\("verification\.write"\)/);
  assert.match(route, /cleanupReplacedOwnedMedia/);
  const me = readRepo("api-server/src/routes/me.ts");
  assert.match(me, /Boolean\(existing && \(existing\.status === "approved" \|\| user\.verificationStatus === "approved"\)\)/);
  assert.match(me, /Approved identity documents cannot be removed/);
  assert.match(me, /cleanupReplacedOwnedMedia\(document\.url, null, req\.user!\.userId\)/);
  assert.match(routes, /router\.use\("\/me\/document-renewals", documentRenewalsRouter\);[\s\S]*router\.use\("\/me", meRouter\)/);
  assert.match(routes, /router\.use\("\/admin\/document-renewals", documentRenewalsAdminRouter\)/);
  const auth = readRepo("api-server/src/routes/auth.ts");
  assert.match(auth, /isAvailable: normalizedRole !== "provider"/);

  assert.match(admin, /Approve & Apply/);
  assert.match(admin, /Rejection reason/);
  assert.match(admin, /const requestedStatus = searchParams\.get\("status"\)/);
  assert.match(sidebar, /pendingDocumentRenewals/);
  assert.match(sidebar, /Document Renewals[\s\S]*verification\.write/);
  assert.match(app, /Guard perm="verification\.write"><DocumentRenewalsPage/);
  assert.match(routing, /admin\\\/document-renewals/);
  assert.match(routing, /"\/document-renewals"/);
  assert.match(provider, /createDocumentRenewal/);
  assert.match(provider, /existing && \(existing\.status === "approved" \|\| user\?\.verificationStatus === "approved"\)/);
  assert.match(provider, /expiryNotApplicable/);
  assert.match(layout, /provider-document-expiry-wall/);
  assert.match(layout, /Manage Document Updates/);
});

test("biometric login detects enrolled native methods, avoids app-info permissions, and permits OS fallback", () => {
  const service = readRepo("athoo-app/services/biometric.ts");
  const setting = readRepo("athoo-app/components/security/BiometricLoginSetting.tsx");
  const config = readRepo("athoo-app/app.config.js");

  assert.match(service, /hasHardwareAsync\(\)/);
  assert.match(service, /supportedAuthenticationTypesAsync\(\)/);
  assert.match(service, /isEnrolledAsync\(\)/);
  assert.match(service, /getEnrolledLevelAsync\(\)/);
  assert.match(service, /FACIAL_RECOGNITION/);
  assert.match(service, /FINGERPRINT/);
  assert.match(service, /IRIS/);
  assert.match(service, /disableDeviceFallback: false/);
  assert.match(service, /biometricsSecurityLevel: "weak"/);

  assert.doesNotMatch(setting, /Linking\.openSettings\(\)/);
  assert.match(setting, /android\.settings\.BIOMETRIC_ENROLL/);
  assert.match(setting, /android\.settings\.SECURITY_SETTINGS/);
  assert.match(setting, /text: "Open Settings"/);
  assert.match(setting, /AppState\.addEventListener/);
  assert.match(config, /expo-local-authentication/);
  assert.match(config, /NSFaceIDUsageDescription|faceIDPermission/);
});
