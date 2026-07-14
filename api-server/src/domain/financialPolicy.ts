export type CommissionPaymentStatus = "pending" | "approved" | "rejected";
export type RefundStatus = "pending" | "approved" | "rejected" | "paid";
export type WithdrawalStatus = "pending" | "approved" | "rejected" | "paid";

export function canReviewCommissionPayment(current: string, next: "approved" | "rejected"): boolean {
  return current === "pending" && (next === "approved" || next === "rejected");
}

export function canResolveRefund(current: string, next: "approved" | "rejected" | "paid"): boolean {
  if (current === "pending") return next === "approved" || next === "rejected";
  if (current === "approved") return next === "paid";
  return false;
}

export function validateRefundPaymentReference(status: "approved" | "rejected" | "paid", reference: string | null): string | null {
  if (status === "paid" && !reference) return "Payment reference is required when marking a refund as paid";
  return null;
}

export function canTransitionWithdrawal(current: string, next: "approved" | "rejected" | "paid"): boolean {
  if (current === "pending") return next === "approved" || next === "rejected";
  if (current === "approved") return next === "paid";
  return false;
}

export function validateRefundAmount(amount: number, bookingTotal: number): string | null {
  if (!Number.isInteger(amount) || amount <= 0) return "Refund amount must be a positive whole rupee amount";
  if (!Number.isFinite(bookingTotal) || bookingTotal <= 0) return "Booking does not have a refundable amount";
  if (amount > Math.round(bookingTotal)) return `Refund amount cannot exceed booking total of Rs. ${Math.round(bookingTotal)}`;
  return null;
}

export function validateWithdrawalPaymentReference(status: "approved" | "rejected" | "paid", reference: string | null): string | null {
  if (status === "paid" && !reference) return "Payment reference is required when marking a withdrawal as paid";
  return null;
}
