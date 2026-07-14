import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const payments = fs.readFileSync(new URL("../src/routes/payments.ts", import.meta.url), "utf8");
const withdrawals = fs.readFileSync(new URL("../src/routes/withdrawals.ts", import.meta.url), "utf8");
const schema = fs.readFileSync(new URL("../../lib/db/src/schema/index.ts", import.meta.url), "utf8");
const migration = fs.readFileSync(new URL("../../deploy/migrations/20260712_provider_finance_integrity.sql", import.meta.url), "utf8");
const admin = fs.readFileSync(new URL("../src/routes/admin.ts", import.meta.url), "utf8");

 test("commission submissions reserve outstanding dues and require private evidence", () => {
  assert.match(payments, /availableToSubmit/);
  assert.match(payments, /SUM\(\$\{commissionPaymentsTable\.amount\}\)/);
  assert.match(payments, /isOwnedUploadObjectPath\(screenshotUrl, providerId, \["private"\]\)/);
  assert.match(payments, /normalizeStoredObjectPath/);
  assert.match(payments, /Selected payment account is not active/);
  assert.match(payments, /clientRequestId/);
});

test("withdrawals are retry-safe and serialized against provider balance", () => {
  assert.match(withdrawals, /clientRequestId/);
  assert.match(withdrawals, /FOR UPDATE/);
  assert.match(withdrawals, /duplicate: Boolean\(result\.existing\)/);
  assert.match(withdrawals, /A rejection reason is required/);
});

test("database protects finance request and payment uniqueness", () => {
  assert.match(schema, /commission_payments_provider_request_uidx/);
  assert.match(schema, /withdrawal_requests_provider_request_uidx/);
  assert.match(migration, /withdrawal_requests_one_pending_uidx/);
  assert.match(migration, /commission_payments_reference_uidx/);
  assert.match(migration, /withdrawal_requests_payment_reference_uidx/);
});

test("legacy direct commission clearing is disabled", () => {
  assert.match(admin, /Direct commission clearing is disabled/);
  assert.match(admin, /status\(410\)/);
});
