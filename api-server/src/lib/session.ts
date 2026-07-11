import crypto from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db } from "@workspace/db";
import { authSessionsTable, usersTable } from "@workspace/db/schema";
import { signAccessToken } from "../middlewares/auth";

export const ACCESS_TOKEN_TTL = "15m";
export const REFRESH_SESSION_DAYS = 30;

const refreshTokenSecret = process.env.REFRESH_TOKEN_SECRET;
if (!refreshTokenSecret) throw new Error("FATAL: REFRESH_TOKEN_SECRET is required.");
const REFRESH_TOKEN_SECRET: string = refreshTokenSecret;
function hashToken(token: string): string {
  return crypto.createHmac("sha256", REFRESH_TOKEN_SECRET).update(token).digest("hex");
}

function newRefreshToken(): string {
  return crypto.randomBytes(48).toString("base64url");
}

export async function createSession(user: any, meta: { userAgent?: string | null; ipAddress?: string | null } = {}, refreshDays = REFRESH_SESSION_DAYS) {
  const sessionId = crypto.randomUUID();
  const refreshToken = newRefreshToken();
  const expiresAt = new Date(Date.now() + refreshDays * 24 * 60 * 60 * 1000);
  await db.insert(authSessionsTable).values({
    id: sessionId,
    userId: user.id,
    refreshTokenHash: hashToken(refreshToken),
    userAgent: meta.userAgent ?? null,
    ipAddress: meta.ipAddress ?? null,
    expiresAt,
  });
  return {
    token: signAccessToken(user, sessionId),
    refreshToken,
    expiresInSeconds: 15 * 60,
    refreshExpiresAt: expiresAt.toISOString(),
  };
}

export async function rotateSession(refreshToken: string, meta: { userAgent?: string | null; ipAddress?: string | null } = {}) {
  const now = new Date();
  const currentHash = hashToken(refreshToken);
  const nextRefreshToken = newRefreshToken();
  const [session] = await db.update(authSessionsTable).set({
    refreshTokenHash: hashToken(nextRefreshToken), lastUsedAt: now, userAgent: meta.userAgent ?? null, ipAddress: meta.ipAddress ?? null,
  }).where(and(eq(authSessionsTable.refreshTokenHash, currentHash), isNull(authSessionsTable.revokedAt), gt(authSessionsTable.expiresAt, now))).returning();
  if (!session) return null;
  const user = await db.query.usersTable.findFirst({ where: eq(usersTable.id, session.userId) });
  if (!user || user.isBlocked || user.isDeactivated || user.accountStatus === "deleted") { await revokeSession(session.id, "account_unavailable"); return null; }
  return { token: signAccessToken(user, session.id), refreshToken: nextRefreshToken, expiresInSeconds: 15 * 60, refreshExpiresAt: session.expiresAt.toISOString(), user };
}

export async function isSessionActive(sessionId: string, userId: string): Promise<boolean> {
  const row = await db.query.authSessionsTable.findFirst({
    where: and(
      eq(authSessionsTable.id, sessionId),
      eq(authSessionsTable.userId, userId),
      isNull(authSessionsTable.revokedAt),
      gt(authSessionsTable.expiresAt, new Date()),
    ),
  });
  return Boolean(row);
}

export async function revokeSession(sessionId: string, reason = "logout") {
  await db.update(authSessionsTable).set({ revokedAt: new Date(), revokeReason: reason }).where(eq(authSessionsTable.id, sessionId));
}

export async function revokeAllUserSessions(userId: string, reason: string) {
  await db.update(authSessionsTable).set({ revokedAt: new Date(), revokeReason: reason }).where(and(eq(authSessionsTable.userId, userId), isNull(authSessionsTable.revokedAt)));
}
