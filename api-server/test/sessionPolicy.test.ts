import test from "node:test";
import assert from "node:assert/strict";
import { ACCESS_TOKEN_SECONDS, REFRESH_SESSION_SECONDS, isRefreshSessionUsable, shouldInvalidateSessions } from "../src/domain/sessionPolicy.ts";

test("access tokens are short-lived", () => assert.equal(ACCESS_TOKEN_SECONDS, 900));
test("refresh sessions last 30 days", () => assert.equal(REFRESH_SESSION_SECONDS, 2592000));
test("expired or revoked sessions cannot refresh", () => {
  const now = new Date("2026-07-10T12:00:00Z");
  assert.equal(isRefreshSessionUsable({ expiresAt: new Date("2026-07-10T12:01:00Z") }, now), true);
  assert.equal(isRefreshSessionUsable({ expiresAt: new Date("2026-07-10T11:59:00Z") }, now), false);
  assert.equal(isRefreshSessionUsable({ expiresAt: new Date("2026-07-10T12:01:00Z"), revokedAt: now }, now), false);
});
test("security-sensitive account events invalidate sessions", () => {
  assert.equal(shouldInvalidateSessions("password_changed"), true);
  assert.equal(shouldInvalidateSessions("password_reset"), true);
  assert.equal(shouldInvalidateSessions("profile_updated"), false);
});
