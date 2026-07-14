import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const auth = fs.readFileSync(new URL("../src/routes/auth.ts", import.meta.url), "utf8");
const me = fs.readFileSync(new URL("../src/routes/me.ts", import.meta.url), "utf8");
const admin = fs.readFileSync(new URL("../src/routes/admin.ts", import.meta.url), "utf8");
const mobile = fs.readFileSync(new URL("../../athoo-app/app/auth/provider-register.tsx", import.meta.url), "utf8");
const wall = fs.readFileSync(new URL("../../athoo-app/app/(provider)/_layout.tsx", import.meta.url), "utf8");
const resubmit = fs.readFileSync(new URL("../../athoo-app/app/(provider)/verification-documents.tsx", import.meta.url), "utf8");
const migration = fs.readFileSync(new URL("../../deploy/migrations/20260711_provider_identity_verification_integrity.sql", import.meta.url), "utf8");

test("provider registration persists and uniquely validates identity", () => {
  assert.match(auth, /valid 13-digit CNIC/);
  assert.match(auth, /eq\(usersTable\.cnicNumber, normalizedCnic\)/);
  assert.match(auth, /fatherName:/);
  assert.match(auth, /cnicNumber: normalizedCnic/);
  assert.match(migration, /users_cnic_number_uidx/);
});

test("verification documents are owner-private, typed and replaceable", () => {
  assert.match(me, /Provider account required/);
  assert.match(me, /isOwnedUploadObjectPath\(normalizedUrl, req\.user!\.userId, \["private"\]\)/);
  assert.match(me, /normalizeStoredObjectPath/);
  assert.match(me, /providerDocumentsTable\.type, normalizedType/);
  assert.match(me, /verificationStatus = complete \? "in_process" : "pending"/);
  assert.match(migration, /provider_documents_provider_type_uidx/);
});

test("admin approval requires every required document to be approved", () => {
  assert.match(admin, /Required documents are missing or not approved/);
  assert.match(admin, /doc\.status === "approved"/);
  assert.match(admin, /A rejection reason is required/);
  assert.match(admin, /A document rejection reason is required/);
});

test("mobile registration and rejection flow support document recovery", () => {
  assert.match(mobile, /fatherName: form\.fatherName\.trim\(\)/);
  assert.match(mobile, /cnicNumber: form\.cnic/);
  assert.match(mobile, /documents need attention/);
  assert.match(wall, /Fix Documents/);
  assert.match(resubmit, /provider-verification-documents/);
  assert.match(resubmit, /Refresh review status/);
});
