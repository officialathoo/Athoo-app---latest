export function toUserFriendlyError(error: unknown): string {
  const raw = String((error as any)?.message || error || '').replace(/\s+/g, ' ').trim();
  if (!raw) return 'Something went wrong. Please try again.';
  if (/wrong password|invalid password|incorrect password/i.test(raw)) return 'Wrong password. Please try again.';
  if (/otp.*expired|expired.*otp/i.test(raw)) return 'OTP expired. Please request a new code.';
  if (/invalid otp|wrong otp|incorrect otp/i.test(raw)) return 'Wrong OTP. Please check the code and try again.';
  if (/permission/i.test(raw)) return 'Permission is required to continue. Please allow access from phone settings.';
  if (/network|fetch|internet/i.test(raw)) return 'Network issue. Please check your internet connection and try again.';
  if (/timeout|timed out|aborted/i.test(raw)) return 'The server is taking longer than expected. Please try again.';
  if (/active job|ACTIVE_BOOKING/i.test(raw)) return 'You already have an active job. Please complete or close it before starting a new one.';
  if (/expired/i.test(raw)) return 'This request has expired. Please create a new request.';
  if (/unauthorized|jwt|token/i.test(raw)) return 'Your session expired. Please log in again.';
  if (/api\//i.test(raw) || /line \d+/i.test(raw) || /stack|syntax|referenceerror|typeerror/i.test(raw)) return 'Something went wrong. Please try again.';
  return raw.slice(0, 180);
}
