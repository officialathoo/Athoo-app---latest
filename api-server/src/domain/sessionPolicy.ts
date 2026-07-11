export const ACCESS_TOKEN_SECONDS = 15 * 60;
export const REFRESH_SESSION_SECONDS = 30 * 24 * 60 * 60;
export function isRefreshSessionUsable(input: { expiresAt: Date; revokedAt?: Date | null }, now = new Date()) {
  return !input.revokedAt && input.expiresAt.getTime() > now.getTime();
}
export function shouldInvalidateSessions(event: string) {
  return ["password_changed", "password_reset", "account_blocked", "account_deleted", "logout_all"].includes(event);
}
