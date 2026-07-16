import crypto from "node:crypto";
import { db, pool } from "@workspace/db";
import { emailVerificationChallengesTable, usersTable } from "@workspace/db/schema";
import { and, desc, eq, isNull } from "drizzle-orm";
import { deliverEmailNow, queueEmail } from "./emailDelivery";

export type EmailChallengePurpose = "verify_email" | "login" | "email_change";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmailAddress(value: unknown): string {
  const email = String(value || "").trim().toLowerCase();
  return EMAIL_PATTERN.test(email) && email.length <= 254 ? email : "";
}

function secret(): string {
  const value = String(process.env.EMAIL_OTP_HASH_SECRET || process.env.OTP_HASH_SECRET || process.env.JWT_SECRET || "").trim();
  if (!value) throw new Error("EMAIL_OTP_HASH_SECRET, OTP_HASH_SECRET, or JWT_SECRET is required");
  return value;
}

function hashCode(userId: string, email: string, purpose: EmailChallengePurpose, code: string): string {
  return crypto.createHmac("sha256", secret()).update(`${userId}|${email}|${purpose}|${code}`).digest("hex");
}

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left, "hex");
  const b = Buffer.from(right, "hex");
  return a.length > 0 && a.length === b.length && crypto.timingSafeEqual(a, b);
}

function generateCode(): string {
  return crypto.randomInt(100000, 1_000_000).toString();
}

export function getEmailOtpPolicy() {
  const ttlSeconds = Math.max(120, Math.min(1800, Number(process.env.EMAIL_OTP_TTL_SECONDS || 600)));
  const resendAfterSeconds = Math.max(20, Math.min(300, Number(process.env.EMAIL_OTP_RESEND_COOLDOWN_SECONDS || 45)));
  const maxAttempts = Math.max(3, Math.min(10, Number(process.env.EMAIL_OTP_MAX_ATTEMPTS || 5)));
  return { ttlSeconds, resendAfterSeconds, maxAttempts };
}

export async function sendEmailChallenge(args: {
  userId: string;
  email: string;
  name: string;
  role?: string | null;
  purpose: EmailChallengePurpose;
}): Promise<{
  success: boolean;
  expiresInSeconds: number;
  resendAfterSeconds: number;
  deliveryId?: string;
  code?: string;
  errorCode?: string;
}> {
  const email = normalizeEmailAddress(args.email);
  if (!email) return { success: false, expiresInSeconds: 0, resendAfterSeconds: 0, errorCode: "INVALID_EMAIL" };
  const policy = getEmailOtpPolicy();
  const latest = await db.query.emailVerificationChallengesTable.findFirst({
    where: and(
      eq(emailVerificationChallengesTable.userId, args.userId),
      eq(emailVerificationChallengesTable.purpose, args.purpose),
    ),
    orderBy: desc(emailVerificationChallengesTable.createdAt),
  });
  const latestCreatedAt = latest?.createdAt ? new Date(latest.createdAt).getTime() : 0;
  const retryMs = latestCreatedAt + policy.resendAfterSeconds * 1000 - Date.now();
  if (latest && retryMs > 0) {
    return {
      success: false,
      expiresInSeconds: Math.max(0, Math.ceil((new Date(latest.expiresAt).getTime() - Date.now()) / 1000)),
      resendAfterSeconds: Math.ceil(retryMs / 1000),
      errorCode: "EMAIL_OTP_RESEND_COOLDOWN",
    };
  }

  const now = new Date();
  await db.update(emailVerificationChallengesTable).set({
    usedAt: now,
    invalidatedReason: "replaced_by_new_code",
  }).where(and(
    eq(emailVerificationChallengesTable.userId, args.userId),
    eq(emailVerificationChallengesTable.purpose, args.purpose),
    isNull(emailVerificationChallengesTable.usedAt),
  ));

  const code = generateCode();
  const id = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + policy.ttlSeconds * 1000);
  try {
    await db.insert(emailVerificationChallengesTable).values({
      id,
      userId: args.userId,
      email,
      purpose: args.purpose,
      role: args.role || null,
      codeHash: hashCode(args.userId, email, args.purpose, code),
      attempts: 0,
      maxAttempts: policy.maxAttempts,
      expiresAt,
    });
  } catch (error: any) {
    if (String(error?.code || "") === "23505") {
      return {
        success: false,
        expiresInSeconds: policy.ttlSeconds,
        resendAfterSeconds: policy.resendAfterSeconds,
        errorCode: "EMAIL_OTP_RESEND_COOLDOWN",
      };
    }
    throw error;
  }

  const templateKey = args.purpose === "login" ? "email_login_otp" : "email_verification";
  const delivery = await deliverEmailNow({
    userId: args.userId,
    to: email,
    templateKey,
    category: "security",
    dedupeKey: `email-challenge:${id}`,
    variables: {
      name: args.name,
      code,
      expiresMinutes: Math.ceil(policy.ttlSeconds / 60),
      category: "security",
    },
    metadata: {
      challengeId: id,
      purpose: args.purpose,
      ...(args.purpose === "email_change" ? { allowPendingAddress: true } : {}),
    },
  });
  if (!delivery.ok) {
    await db.update(emailVerificationChallengesTable).set({ usedAt: new Date(), invalidatedReason: "delivery_failed" })
      .where(eq(emailVerificationChallengesTable.id, id));
    return {
      success: false,
      expiresInSeconds: policy.ttlSeconds,
      resendAfterSeconds: policy.resendAfterSeconds,
      deliveryId: delivery.deliveryId,
      errorCode: delivery.errorCode || "EMAIL_DELIVERY_FAILED",
    };
  }

  const exposeCode = process.env.NODE_ENV === "development" && process.env.ALLOW_DEV_OTP_RESPONSE === "true";
  return {
    success: true,
    expiresInSeconds: policy.ttlSeconds,
    resendAfterSeconds: policy.resendAfterSeconds,
    deliveryId: delivery.deliveryId,
    ...(exposeCode ? { code } : {}),
  };
}

export async function verifyEmailChallenge(args: {
  userId: string;
  email: string;
  purpose: EmailChallengePurpose;
  code: string;
  role?: string | null;
}): Promise<{ success: boolean; code?: string; attemptsRemaining?: number }> {
  const email = normalizeEmailAddress(args.email);
  const inputCode = String(args.code || "").trim();
  if (!email || !/^\d{6}$/.test(inputCode)) return { success: false, code: "EMAIL_OTP_INVALID" };
  const challenge = await db.query.emailVerificationChallengesTable.findFirst({
    where: and(
      eq(emailVerificationChallengesTable.userId, args.userId),
      eq(emailVerificationChallengesTable.email, email),
      eq(emailVerificationChallengesTable.purpose, args.purpose),
      isNull(emailVerificationChallengesTable.usedAt),
    ),
    orderBy: desc(emailVerificationChallengesTable.createdAt),
  });
  if (!challenge) return { success: false, code: "EMAIL_OTP_INVALID" };
  if (args.role && challenge.role && challenge.role !== args.role) return { success: false, code: "ROLE_MISMATCH" };
  if (new Date(challenge.expiresAt).getTime() <= Date.now()) {
    await db.update(emailVerificationChallengesTable).set({ usedAt: new Date(), invalidatedReason: "expired" })
      .where(eq(emailVerificationChallengesTable.id, challenge.id));
    return { success: false, code: "EMAIL_OTP_EXPIRED" };
  }
  if ((challenge.attempts || 0) >= (challenge.maxAttempts || 5)) {
    await db.update(emailVerificationChallengesTable).set({ usedAt: new Date(), invalidatedReason: "attempt_limit" })
      .where(eq(emailVerificationChallengesTable.id, challenge.id));
    return { success: false, code: "EMAIL_OTP_ATTEMPT_LIMIT", attemptsRemaining: 0 };
  }
  const valid = safeEqual(challenge.codeHash, hashCode(args.userId, email, args.purpose, inputCode));
  if (!valid) {
    const attemptResult = await pool.query<{ attempts: number; max_attempts: number; used_at: Date | null }>(
      `UPDATE email_verification_challenges
       SET attempts = attempts + 1,
           used_at = CASE WHEN attempts + 1 >= max_attempts THEN now() ELSE used_at END,
           invalidated_reason = CASE WHEN attempts + 1 >= max_attempts THEN 'attempt_limit' ELSE invalidated_reason END
       WHERE id = $1 AND used_at IS NULL
       RETURNING attempts, max_attempts, used_at`,
      [challenge.id],
    );
    const updated = attemptResult.rows[0];
    if (!updated) return { success: false, code: "EMAIL_OTP_INVALID", attemptsRemaining: 0 };
    const exhausted = Boolean(updated.used_at) || updated.attempts >= updated.max_attempts;
    return {
      success: false,
      code: exhausted ? "EMAIL_OTP_ATTEMPT_LIMIT" : "EMAIL_OTP_INCORRECT",
      attemptsRemaining: Math.max(0, updated.max_attempts - updated.attempts),
    };
  }
  const consumed = await pool.query<{ id: string }>(
    `UPDATE email_verification_challenges
     SET used_at = now(), invalidated_reason = 'verified'
     WHERE id = $1 AND used_at IS NULL
     RETURNING id`,
    [challenge.id],
  );
  return consumed.rows[0] ? { success: true } : { success: false, code: "EMAIL_OTP_INVALID" };
}

export async function queueWelcomeEmail(user: { id: string; email?: string | null; name: string; role: string }) {
  const email = normalizeEmailAddress(user.email);
  if (!email) return null;
  return queueEmail({
    userId: user.id,
    to: email,
    templateKey: "welcome",
    category: "security",
    dedupeKey: `welcome:${user.id}`,
    variables: { name: user.name, role: user.role, category: "security" },
  });
}

export async function queuePasswordChangedEmail(user: { id: string; email?: string | null; name: string }, reason: "changed" | "reset") {
  const email = normalizeEmailAddress(user.email);
  if (!email) return null;
  return queueEmail({
    userId: user.id,
    to: email,
    templateKey: "password_changed",
    category: "security",
    dedupeKey: `password-${reason}:${user.id}:${Date.now()}`,
    variables: { name: user.name, timestamp: new Date().toISOString(), category: "security" },
    metadata: { reason },
  });
}

export async function queueNewDeviceEmail(user: { id: string; email?: string | null; name: string }, details: { device?: string | null; ip?: string | null }) {
  const email = normalizeEmailAddress(user.email);
  if (!email || user.id.length === 0) return null;
  if (String(process.env.EMAIL_NEW_DEVICE_ALERTS_ENABLED || "true").toLowerCase() === "false") return null;
  const device = String(details.device || "Unknown device").slice(0, 250);
  const ip = String(details.ip || "Unknown IP").slice(0, 80);
  const digest = crypto.createHash("sha256").update(`${user.id}|${device}`).digest("hex").slice(0, 20);
  return queueEmail({
    userId: user.id,
    to: email,
    templateKey: "new_device_login",
    category: "security",
    dedupeKey: `new-device:${user.id}:${digest}`,
    variables: { name: user.name, timestamp: new Date().toISOString(), device, ip, category: "security" },
  });
}

export async function hasSeenDevice(userId: string, userAgent: string | undefined): Promise<boolean> {
  const clean = String(userAgent || "").trim();
  if (!clean) return true;
  const user = await db.query.usersTable.findFirst({ where: eq(usersTable.id, userId) });
  if (!user) return true;
  const result = await pool.query<{ exists: boolean }>(
    "SELECT EXISTS(SELECT 1 FROM login_history WHERE user_id = $1 AND success = true AND user_agent = $2) AS exists",
    [userId, clean],
  ).catch(() => null);
  return Boolean(result?.rows?.[0]?.exists);
}
