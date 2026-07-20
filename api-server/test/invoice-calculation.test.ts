import assert from "node:assert/strict";
import test from "node:test";
import { calculateTimedInvoice } from "../src/domain/invoiceCalculation.ts";

test("calculates the agreed hourly rate by authoritative worked minutes", () => {
  const invoice = calculateTimedInvoice({
    ratePerHour: 5_000,
    visitCharge: 500,
    fallbackServiceAmount: 5_000,
    jobStartedAt: "2026-07-20T10:00:00.000Z",
    jobCompletedAt: "2026-07-20T10:20:00.000Z",
    commissionRate: 10,
  });

  assert.deepEqual(invoice, {
    ratePerHour: 5_000,
    durationMinutes: 20,
    serviceAmount: 1_667,
    visitCharge: 500,
    totalAmount: 2_167,
    commissionBase: 2_167,
    commissionRate: 10,
    commissionAmount: 217,
    providerAmount: 1_950,
  });
});

test("falls back to the agreed service snapshot when no reliable start time exists", () => {
  const invoice = calculateTimedInvoice({
    ratePerHour: 5_000,
    visitCharge: 500,
    fallbackServiceAmount: 5_000,
    jobStartedAt: null,
    jobCompletedAt: "2026-07-20T10:20:00.000Z",
    commissionRate: 10,
  });

  assert.equal(invoice.durationMinutes, null);
  assert.equal(invoice.serviceAmount, 5_000);
  assert.equal(invoice.totalAmount, 5_500);
});

test("commission base can exclude visit charges through deployment policy", () => {
  const invoice = calculateTimedInvoice({
    ratePerHour: 6_000,
    visitCharge: 500,
    fallbackServiceAmount: 6_000,
    jobStartedAt: "2026-07-20T10:00:00.000Z",
    jobCompletedAt: "2026-07-20T10:30:00.000Z",
    commissionRate: 10,
    commissionIncludesVisitCharge: false,
  });

  assert.equal(invoice.serviceAmount, 3_000);
  assert.equal(invoice.totalAmount, 3_500);
  assert.equal(invoice.commissionBase, 3_000);
  assert.equal(invoice.commissionAmount, 300);
  assert.equal(invoice.providerAmount, 3_200);
});
