import { apiErrorToMessage } from "./apiError";

/**
 * Converts unknown failures into short, user-facing messages.
 *
 * This function intentionally never returns raw stack traces, XML, SQL,
 * credentials, request IDs, internal routes, source paths, or provider errors.
 */
export function toUserFriendlyError(
  error: unknown,
  fallback = "Something went wrong. Please try again.",
): string {
  const raw = String((error as any)?.message || error || "").replace(/\s+/g, " ").trim();
  if (!raw) return fallback;

  if (/wrong password|invalid password|incorrect password/i.test(raw)) {
    return "The current password is incorrect. Please try again.";
  }
  if (/otp.*expired|expired.*otp/i.test(raw)) {
    return "The OTP has expired. Please request a new code.";
  }
  if (/invalid otp|wrong otp|incorrect otp/i.test(raw)) {
    return "The OTP is incorrect. Please check the code and try again.";
  }
  if (/permission/i.test(raw)) {
    return "Permission is required to continue. Please allow access from your phone settings.";
  }
  if (/active job|ACTIVE_BOOKING/i.test(raw)) {
    return "You already have an active job. Please complete or close it before starting a new one.";
  }
  if (/expired/i.test(raw) && !/password/i.test(raw)) {
    return "This request has expired. Please create a new request.";
  }

  return apiErrorToMessage(error, fallback);
}
