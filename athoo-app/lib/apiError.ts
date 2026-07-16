/**
 * Converts any thrown value into short, user-safe copy.
 *
 * Rules:
 * - Never display stack traces, SQL, cloud-storage XML, credentials, request IDs,
 *   internal file paths, raw JSON/HTML, or transport diagnostics.
 * - Preserve concise business validation messages returned by the API.
 * - Map connectivity, authentication, throttling, and server failures to copy a
 *   customer can understand and act on.
 */
export function apiErrorToMessage(
  err: unknown,
  fallback = "Something went wrong. Please try again.",
): string {
  if (!err) return fallback;

  const extracted =
    err instanceof Error
      ? err.message
      : typeof err === "string"
        ? err
        : typeof err === "object" && err !== null && "message" in err && typeof (err as { message: unknown }).message === "string"
          ? (err as { message: string }).message
          : "";

  const raw = extracted.replace(/\u0000/g, "").trim();
  if (!raw) return fallback;
  const lower = raw.toLowerCase();

  if (
    lower.includes("network request failed") ||
    lower.includes("failed to fetch") ||
    lower.includes("load failed") ||
    lower.includes("network error") ||
    lower.includes("econnreset") ||
    lower.includes("econnrefused") ||
    lower.includes("enotfound") ||
    lower.includes("socket hang up")
  ) {
    return "No internet connection. Please check your network and try again.";
  }

  if (lower.includes("timed out") || lower.includes("timeout") || lower.includes("aborted")) {
    return "The request took too long. Please check your connection and try again.";
  }

  if (lower.includes("verification code delivery is temporarily unavailable") || lower.includes("otp_delivery_unavailable")) {
    return "Verification code delivery is temporarily unavailable. Please try again shortly.";
  }

  if ((lower.includes("no active athoo account") && lower.includes("email")) || lower.includes("email_account_not_found")) {
    return "No active Athoo account was found with this email address.";
  }
  if (lower.includes("no active athoo account") || lower.includes("account_not_found")) {
    return "No active Athoo account was found with these details.";
  }
  if (lower.includes("email_not_verified") || (lower.includes("email") && lower.includes("not verified"))) {
    return "This email address is not verified yet. Verify it from your profile before using email sign-in.";
  }
  if (lower.includes("email_in_use") || (lower.includes("email") && lower.includes("already") && lower.includes("account"))) {
    return "This email address is already connected to another account.";
  }
  if (lower.includes("email_otp_expired") || (lower.includes("email") && lower.includes("code has expired"))) {
    return "The email verification code has expired. Please request a new code.";
  }
  if (lower.includes("email_otp_attempt_limit")) {
    return "Too many incorrect email-code attempts. Please request a new code.";
  }
  if (lower.includes("email_otp_incorrect") || (lower.includes("email") && lower.includes("code is incorrect"))) {
    return "The email verification code is incorrect.";
  }
  if (lower.includes("email_delivery_failed") || lower.includes("smtp_not_configured") || lower.includes("email_otp_send_failed")) {
    return "Email delivery is temporarily unavailable. Please use another sign-in method or try again later.";
  }
  if (lower.includes("account is blocked") || lower.includes("account_blocked")) {
    return "This account is blocked. Please contact Athoo Support.";
  }
  if (lower.includes("account is suspended") || lower.includes("account_suspended")) {
    return "This account is suspended. Please contact Athoo Support.";
  }
  if (lower.includes("account has been deactivated") || lower.includes("account_deactivated")) {
    return "This account has been deactivated. Please contact Athoo Support.";
  }
  if (lower.includes("scheduled for deletion") || lower.includes("account_pending_deletion")) {
    return "This account is scheduled for deletion. Please contact Athoo Support to restore access.";
  }
  if (lower.includes("account has been deleted") || lower.includes("account_deleted")) {
    return "This account has been deleted and cannot be used to sign in.";
  }
  if (lower.includes("registered as a provider") || lower.includes("registered as a customer") || lower.includes("account_role_mismatch")) {
    const match = raw.match(/This phone number is registered as a (provider|customer)\.[^\[]*/i);
    return match?.[0]?.trim() || "This phone number is registered under a different account type. Choose the correct sign-in option.";
  }
  if (lower.includes("already registered") || lower.includes("account_already_exists")) {
    return "This phone number is already registered. Please sign in instead.";
  }
  if (lower.includes("please wait") && lower.includes("seconds before requesting another code")) {
    const match = raw.match(/Please wait \d+ seconds before requesting another code\./i);
    return match?.[0] || "Please wait before requesting another verification code.";
  }
  if (lower.includes("too many incorrect attempts") || lower.includes("otp_attempt_limit")) {
    return "Too many incorrect attempts. Please request a new verification code.";
  }
  if (lower.includes("verification code is incorrect") || lower.includes("otp_incorrect")) {
    return "The verification code is incorrect.";
  }

  const statusMatch = raw.match(/\[(\d{3})\b/) || raw.match(/\bstatus(?:code)?[\s:=]+(\d{3})\b/i);
  const status = statusMatch ? Number(statusMatch[1]) : 0;

  if (status === 401) return "Your session has expired. Please sign in again.";
  if (status === 403) return "You don't have permission to complete this action.";
  if (status === 404) return "We couldn't find what you were looking for.";
  if (status === 409) return "This request is already completed or no longer available. Please refresh and try again.";
  if (status === 413) return "This file is too large. Please choose a smaller file and try again.";
  if (status === 415) return "This file type is not supported. Please choose another file.";
  if (status === 422) return "Please check the information you entered and try again.";
  if (status === 429) return "Too many attempts. Please wait a moment and try again.";
  if (status >= 500) return "Athoo is temporarily unavailable. Please try again shortly.";

  // Remove the diagnostic suffix produced by services/api.ts and common HTTP clients.
  let message = raw
    .replace(/\s*\[\d{3}[^\]]*\]\s*(?:\{[\s\S]*|<[\s\S]*)?$/i, "")
    .replace(/\s*\((?:request|trace|correlation)[-_ ]?id[^)]*\)\s*$/i, "")
    .replace(/\s*request[-_ ]?id\s*[:=].*$/i, "")
    .trim();

  const technicalPatterns = [
    /(?:error|exception):\s*at\s+/i,
    /\bat\s+[A-Za-z0-9_$<>.]+\s*\([^)]*:\d+:\d+\)/,
    /\b(?:select|insert|update|delete)\s+.+\b(?:from|into|where)\b/i,
    /\b(?:postgres|postgresql|drizzle|sqlstate|constraint|relation|column)\b/i,
    /\b(?:aws|s3|cloudflare|r2|bucket|access key|secret key|credential|signaturedoesnotmatch|invalidargument)\b/i,
    /<\?xml|<Error>|<html|<!doctype/i,
    /\{\s*"(?:error|message|stack|code|name)"\s*:/i,
    /\b(?:node_modules|\/src\/|\\src\\|\.tsx?:\d+|\.mjs:\d+|\.js:\d+)\b/i,
    /\b(?:typeerror|referenceerror|syntaxerror|rangeerror)\b/i,
    /\b(?:ECONN|ENOTFOUND|ETIMEDOUT|EAI_AGAIN)\b/i,
    /\b(?:hostid|requestid|x-amz-|cf-ray|stack trace)\b/i,
  ];

  if (!message || /^request failed\b/i.test(message) || technicalPatterns.some((pattern) => pattern.test(raw))) {
    return fallback;
  }

  // Only allow a compact, sentence-like business message through.
  message = message.replace(/\s+/g, " ").trim();
  if (message.length > 180) return fallback;
  if ((message.match(/[{}<>\[\]\\]/g) || []).length >= 2) return fallback;

  return message;
}
