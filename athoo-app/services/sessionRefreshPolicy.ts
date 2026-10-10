export type SessionRefreshStatus = "renewed" | "rejected" | "unavailable" | "missing";

export type SessionRefreshResult = {
  status: SessionRefreshStatus;
  token?: string;
};

/**
 * Only an explicit client/authentication rejection proves that a saved
 * refresh session can no longer be used. Throttling, provider outages,
 * malformed success responses, and server failures are temporary states and
 * must never destroy locally persisted credentials.
 */
export function classifyRefreshResponse(
  status: number,
  hasAccessToken: boolean,
  hasRefreshToken: boolean,
): SessionRefreshStatus {
  if (status >= 200 && status < 300) {
    return hasAccessToken && hasRefreshToken ? "renewed" : "unavailable";
  }
  if (status === 400 || status === 401 || status === 403) return "rejected";
  return "unavailable";
}

export function isAuthoritativeRefreshFailure(result: SessionRefreshResult): boolean {
  return result.status === "rejected" || result.status === "missing";
}
