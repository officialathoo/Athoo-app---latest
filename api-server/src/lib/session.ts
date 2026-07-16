import crypto from "node:crypto";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { authSessionsTable, usersTable } from "@workspace/db/schema";
import { signAccessToken } from "../middlewares/auth";
import { disconnectSessions, disconnectUserSessions } from "./sessionConnections";

export const ACCESS_TOKEN_TTL = "15m";
export const REFRESH_SESSION_DAYS = 30;

const refreshTokenSecret = process.env.REFRESH_TOKEN_SECRET;
if (!refreshTokenSecret) throw new Error("FATAL: REFRESH_TOKEN_SECRET is required.");
const REFRESH_TOKEN_SECRET: string = refreshTokenSecret;

// Athoo's security policy is intentionally non-optional: one account may have
// exactly one active login session at a time. The database partial unique index
// enforces the same invariant, so application behavior cannot drift by env.
const singleDeviceEnforced = true;

export type SessionMeta = {
  userAgent?: string | null;
  ipAddress?: string | null;
  deviceId?: string | null;
};

function hashToken(token: string): string {
  return crypto.createHmac("sha256", REFRESH_TOKEN_SECRET).update(token).digest("hex");
}

function newRefreshToken(): string {
  return crypto.randomBytes(48).toString("base64url");
}

export function normalizeSessionDeviceId(value: unknown): string | null {
  const normalized = String(value || "").trim().toLowerCase();
  return /^[a-z0-9][a-z0-9._:-]{15,127}$/.test(normalized) ? normalized : null;
}

export async function createSession(user: any, meta: SessionMeta = {}, refreshDays = REFRESH_SESSION_DAYS) {
  const sessionId = crypto.randomUUID();
  const refreshToken = newRefreshToken();
  const expiresAt = new Date(Date.now() + refreshDays * 24 * 60 * 60 * 1000);
  const deviceId = normalizeSessionDeviceId(meta.deviceId);
  const now = new Date();

  const replacedSessionIds = await db.transaction(async (tx) => {
    // Serialize concurrent logins for the same account. Together with the
    // partial unique index, this guarantees exactly one active session even
    // when two devices submit credentials at nearly the same moment.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${String(user.id)}, 0))`);
    let replacedIds: string[] = [];
    if (singleDeviceEnforced) {
      const revoked = await tx
        .update(authSessionsTable)
        .set({ revokedAt: now, revokeReason: "replaced_by_new_login" })
        .where(and(eq(authSessionsTable.userId, user.id), isNull(authSessionsTable.revokedAt)))
        .returning({ id: authSessionsTable.id });
      replacedIds = revoked.map((row) => row.id);

      // Until the newly signed-in app instance registers its own Expo token,
      // never keep delivering private notifications to the previous device.
      await tx
        .update(usersTable)
        .set({ expoPushToken: null, updatedAt: now })
        .where(eq(usersTable.id, user.id));
    }

    await tx.insert(authSessionsTable).values({
      id: sessionId,
      userId: user.id,
      refreshTokenHash: hashToken(refreshToken),
      userAgent: meta.userAgent ?? null,
      ipAddress: meta.ipAddress ?? null,
      deviceId,
      expiresAt,
    });
    return replacedIds;
  });

  if (singleDeviceEnforced) {
    disconnectUserSessions(user.id, sessionId, "replaced_by_new_login");
  }

  return {
    token: signAccessToken(user, sessionId),
    refreshToken,
    expiresInSeconds: 15 * 60,
    refreshExpiresAt: expiresAt.toISOString(),
    replacedSessionCount: replacedSessionIds.length,
    singleDeviceEnforced,
  };
}

export async function rotateSession(refreshToken: string, meta: SessionMeta = {}) {
  const now = new Date();
  const currentHash = hashToken(refreshToken);
  const requestedDeviceId = normalizeSessionDeviceId(meta.deviceId);
  const current = await db.query.authSessionsTable.findFirst({
    where: and(
      eq(authSessionsTable.refreshTokenHash, currentHash),
      isNull(authSessionsTable.revokedAt),
      gt(authSessionsTable.expiresAt, now),
    ),
  });
  if (!current) return null;

  if (current.deviceId && current.deviceId !== requestedDeviceId) {
    await revokeSession(current.id, "device_identity_mismatch");
    return null;
  }

  const nextRefreshToken = newRefreshToken();
  const [session] = await db
    .update(authSessionsTable)
    .set({
      refreshTokenHash: hashToken(nextRefreshToken),
      lastUsedAt: now,
      userAgent: meta.userAgent ?? null,
      ipAddress: meta.ipAddress ?? null,
      deviceId: current.deviceId || requestedDeviceId,
    })
    .where(and(
      eq(authSessionsTable.id, current.id),
      eq(authSessionsTable.refreshTokenHash, currentHash),
      isNull(authSessionsTable.revokedAt),
      gt(authSessionsTable.expiresAt, now),
    ))
    .returning();
  if (!session) return null;

  const user = await db.query.usersTable.findFirst({ where: eq(usersTable.id, session.userId) });
  if (!user || user.isBlocked || user.isDeactivated || user.accountStatus === "deleted") {
    await revokeSession(session.id, "account_unavailable");
    return null;
  }
  return {
    token: signAccessToken(user, session.id),
    refreshToken: nextRefreshToken,
    expiresInSeconds: 15 * 60,
    refreshExpiresAt: session.expiresAt.toISOString(),
    user,
  };
}

export async function isSessionActive(sessionId: string, userId: string, deviceId?: unknown): Promise<boolean> {
  const row = await db.query.authSessionsTable.findFirst({
    where: and(
      eq(authSessionsTable.id, sessionId),
      eq(authSessionsTable.userId, userId),
      isNull(authSessionsTable.revokedAt),
      gt(authSessionsTable.expiresAt, new Date()),
    ),
  });
  if (!row) return false;
  if (!row.deviceId) return true;
  return row.deviceId === normalizeSessionDeviceId(deviceId);
}

export async function revokeSession(sessionId: string, reason = "logout") {
  await db
    .update(authSessionsTable)
    .set({ revokedAt: new Date(), revokeReason: reason })
    .where(and(eq(authSessionsTable.id, sessionId), isNull(authSessionsTable.revokedAt)));
  disconnectSessions([sessionId], reason);
}

export async function revokeAllUserSessions(userId: string, reason: string) {
  await db
    .update(authSessionsTable)
    .set({ revokedAt: new Date(), revokeReason: reason })
    .where(and(eq(authSessionsTable.userId, userId), isNull(authSessionsTable.revokedAt)));
  disconnectUserSessions(userId, undefined, reason);
}
