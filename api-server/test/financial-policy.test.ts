import assert from "node:assert/strict";
import test from "node:test";
import {
  canResolveRefund,
  canReviewCommissionPayment,
  canTransitionWithdrawal,
  validateRefundAmount,
  validateWithdrawalPaymentReference,
} from "../src/domain/financialPolicy.ts";

test("commission payments can only be reviewed once from pending", () => {
  assert.equal(canReviewCommissionPayment("pending", "approved"), true);
  assert.equal(canReviewCommissionPayment("pending", "rejected"), true);
  assert.equal(canReviewCommissionPayment("approved", "rejected"), false);
  assert.equal(canReviewCommissionPayment("rejected", "approved"), false);
});

test("refunds can only be resolved once from pending", () => {
  assert.equal(canResolveRefund("pending", "approved"), true);
  assert.equal(canResolveRefund("pending", "rejected"), true);
  assert.equal(canResolveRefund("approved", "rejected"), false);
});

test("withdrawals follow pending to approved/rejected and approved to paid", () => {
  assert.equal(canTransitionWithdrawal("pending", "approved"), true);
  assert.equal(canTransitionWithdrawal("pending", "rejected"), true);
  assert.equal(canTransitionWithdrawal("pending", "paid"), false);
  assert.equal(canTransitionWithdrawal("approved", "paid"), true);
  assert.equal(canTransitionWithdrawal("approved", "rejected"), false);
  assert.equal(canTransitionWithdrawal("paid", "approved"), false);
});

test("refund amount cannot exceed the booking total", () => {
  assert.equal(validateRefundAmount(500, 1000), null);
  assert.match(validateRefundAmount(1001, 1000) ?? "", /cannot exceed/);
  assert.match(validateRefundAmount(0, 1000) ?? "", /positive/);
});

test("paid withdrawals require a payment reference", () => {
  assert.match(validateWithdrawalPaymentReference("paid", null) ?? "", /required/);
  assert.equal(validateWithdrawalPaymentReference("paid", "TX-123"), null);
  assert.equal(validateWithdrawalPaymentReference("approved", null), null);
});
