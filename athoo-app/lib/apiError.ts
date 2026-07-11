/**
 * apiErrorToMessage — branded, user-friendly conversion of any thrown error
 * (from services/api.ts or otherwise) to a short, plain-English message that
 * is safe to show in a Toast or inline ErrorView.
 *
 * The api.ts request() helper throws Error("<server message> [<status> <statusText>] <body>")
 * — this helper strips the noisy diagnostic suffix and maps common network/timeout
 * conditions to friendly copy.
 *
 * Pair with showError(title, apiErrorToMessage(e)) for consistent UX.
 */
export function apiErrorToMessage(err: unknown, fallback = "Something went wrong. Please try again."): string {
  if (!err) return fallback;
  const extracted =
    err instanceof Error
      ? err.message
      : typeof err === "string"
      ? err
      : typeof err === "object" && err !== null && "message" in err && typeof (err as { message: unknown }).message === "string"
      ? (err as { message: string }).message
      : "";
  const raw = extracted.trim();
  if (!raw) return fallback;

  const lower = raw.toLowerCase();

  // Network / connectivity
  if (
    lower.includes("network request failed") ||
    lower.includes("failed to fetch") ||
    lower.includes("load failed") ||
    lower.includes("network error")
  ) {
    return "No internet connection. Please check your network and try again.";
  }
  if (lower.includes("timed out") || lower.includes("timeout") || lower.includes("aborted")) {
    return "The request took too long. Please check your connection and try again.";
  }

  // Strip the "[<status> <statusText>] {json...}" tail added by api.ts
  const stripped = raw.replace(/\s*\[\d{3}[^\]]*\]\s*\{.*$/s, "").trim();
  const message = stripped || raw;

  // Map common HTTP status to friendly copy when no server message survives
  const statusMatch = raw.match(/\[(\d{3})/);
  const status = statusMatch ? Number(statusMatch[1]) : 0;
  if (!stripped || /^request failed/i.test(stripped)) {
    if (status === 401) return "Your session has expired. Please sign in again.";
    if (status === 403) return "You don't have permission to do that.";
    if (status === 404) return "We couldn't find what you were looking for.";
    if (status === 409) return "That action conflicts with the current state. Please refresh and try again.";
    if (status === 429) return "Too many requests. Please slow down and try again in a moment.";
    if (status >= 500) return "Our servers are having trouble. Please try again shortly.";
  }

  // Cap length so it fits in a toast
  return message.length > 180 ? message.slice(0, 177) + "…" : message;
}
