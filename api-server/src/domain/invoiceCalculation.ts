export type TimedInvoiceInput = {
  ratePerHour: unknown;
  visitCharge: unknown;
  fallbackServiceAmount: unknown;
  jobStartedAt: Date | string | null | undefined;
  jobCompletedAt: Date | string;
  commissionRate: unknown;
  commissionIncludesVisitCharge?: boolean;
};

export type TimedInvoiceCalculation = {
  ratePerHour: number | null;
  durationMinutes: number | null;
  serviceAmount: number;
  visitCharge: number;
  totalAmount: number;
  commissionBase: number;
  commissionRate: number;
  commissionAmount: number;
  providerAmount: number;
};

function finiteNonNegative(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function validDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

/**
 * Calculates the immutable final job invoice from the agreed hourly-rate
 * snapshot and authoritative server timestamps. Partial minutes are rounded up
 * so a provider is never underpaid for work already performed.
 */
export function calculateTimedInvoice(input: TimedInvoiceInput): TimedInvoiceCalculation {
  const rate = finiteNonNegative(input.ratePerHour);
  const visitCharge = Math.round(finiteNonNegative(input.visitCharge));
  const fallbackServiceAmount = Math.round(finiteNonNegative(input.fallbackServiceAmount));
  const startedAt = validDate(input.jobStartedAt);
  const completedAt = validDate(input.jobCompletedAt);

  let durationMinutes: number | null = null;
  let serviceAmount = fallbackServiceAmount;

  if (rate > 0 && startedAt && completedAt && completedAt.getTime() >= startedAt.getTime()) {
    durationMinutes = Math.max(1, Math.ceil((completedAt.getTime() - startedAt.getTime()) / 60_000));
    serviceAmount = Math.max(0, Math.round((rate / 60) * durationMinutes));
  }

  const totalAmount = serviceAmount + visitCharge;
  const rawRate = finiteNonNegative(input.commissionRate);
  const commissionRate = Math.min(100, rawRate);
  const commissionBase = input.commissionIncludesVisitCharge === false ? serviceAmount : totalAmount;
  const commissionAmount = Math.max(0, Math.round((commissionBase * commissionRate) / 100));
  const providerAmount = Math.max(0, totalAmount - commissionAmount);

  return {
    ratePerHour: rate > 0 ? Math.round(rate) : null,
    durationMinutes,
    serviceAmount,
    visitCharge,
    totalAmount,
    commissionBase,
    commissionRate,
    commissionAmount,
    providerAmount,
  };
}
