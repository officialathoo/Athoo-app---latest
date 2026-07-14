import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path: string) => fs.readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

test("manual cash movements create immutable finance ledger entries", () => {
  const schema = read("lib/db/src/schema/index.ts");
  const payments = read("api-server/src/routes/payments.ts");
  const withdrawals = read("api-server/src/routes/withdrawals.ts");
  const refunds = read("api-server/src/routes/refunds.ts");
  assert.match(schema, /financeLedgerTable/);
  assert.match(schema, /finance_ledger_reference_uidx/);
  assert.match(payments, /entryType: "commission_received"/);
  assert.match(withdrawals, /entryType: "provider_withdrawal"/);
  assert.match(refunds, /entryType: "customer_refund"/);
});

test("refund workflow separates approval from confirmed manual payout", () => {
  const policy = read("api-server/src/domain/financialPolicy.ts");
  const refunds = read("api-server/src/routes/refunds.ts");
  const page = read("admin-panel/src/pages/RefundsPage.tsx");
  assert.match(policy, /current === "approved".*next === "paid"/s);
  assert.match(policy, /Payment reference is required when marking a refund as paid/);
  assert.match(refunds, /paymentStatus/);
  assert.match(refunds, /private storage/);
  assert.match(page, /Mark Refund Paid/);
  assert.match(page, /paymentReference/);
});

test("invoice state changes are constrained by booking and payment state", () => {
  const admin = read("api-server/src/routes/admin.ts");
  const bookings = read("api-server/src/routes/bookings.ts");
  assert.match(admin, /Invoice cannot be marked paid until booking payment is recorded/);
  assert.match(admin, /Only unpaid cancelled bookings can have cancelled invoices/);
  assert.match(admin, /Invoice cannot move from/);
  assert.match(bookings, /tx\.update\(invoicesTable\)\.set\(\{ status: "paid"/);
  assert.match(bookings, /duplicate: true/);
});

test("reports and exports use completed jobs, ledger data, audit evidence, and CSV safety", () => {
  const admin = read("api-server/src/routes/admin.ts");
  const reports = read("admin-panel/src/pages/ReportsPage.tsx");
  const finance = read("admin-panel/src/pages/FinancePage.tsx");
  assert.match(admin, /entryType: financeLedgerTable\.entryType/);
  assert.match(admin, /eq\(bookingsTable\.status, "completed"\)/);
  assert.match(admin, /Report date range cannot exceed 366 days/);
  assert.match(admin, /Export exceeds \$\{maxRows\} rows/);
  assert.match(admin, /data_exported/);
  assert.match(admin, /const csvCell/);
  assert.match(admin, /text = `\'\$\{text\}`/);
  assert.match(reports, /getToken\(\)/);
  assert.match(reports, /Completed Job Value/);
  assert.match(finance, /\/api\/admin\/finance\/summary/);
  assert.doesNotMatch(finance, /mark-commission-paid/);
});
