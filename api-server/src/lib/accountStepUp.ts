import crypto from "node:crypto";
import { db, pool } from "@workspace/db";
import { otpsTable } from "@workspace/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { normalizeEmailAddress, sendEmailChallenge, verifyEmailChallenge } from "./emailAuth";
import { otpHashMatches } from "./authOtpPolicy";
import { deliverAuthenticationOtp } from "./otpDelivery";
import { getOtpDeliveryConfigurationStatus } from "./otpDelivery";
import { getEmailConfigurationStatus } from "./email";

export type AccountAction = "deactivate" | "delete";
export type AccountStepUpChannel = "phone" | "email";

type AccountUser = {
  id: string;
  name: string;
  role: string;
  phone: string;
  email?: string | null;
  emailVerified?: boolean | null;
  password?: string | null;
};

const TTL_SECONDS = Math.max(120, Math.min(900, Number(process.env.ACCOUNT_STEP_UP_OTP_TTL_SECONDS || 600)));
const RESEND_SECONDS = Math.max(30, Math.min(300, Number(process.env.ACCOUNT_STEP_UP_RESEND_COOLDOWN_SECONDS || 45)));
const MAX_ATTEMPTS = Math.max(3, Math.min(10, Number(process.env.ACCOUNT_STEP_UP_MAX_ATTEMPTS || 5)));

export function cleanAccountAction(value: unknown): AccountAction | null {
  return value === "deactivate" || value === "delete" ? value : null;
}

export function cleanAccountStepUpChannel(value: unknown): AccountStepUpChannel | null {
  return value === "phone" || value === "email" ? value : null;
}

export function accountActionPurpose(action: AccountAction): "account_deactivate" | "account_delete" {
  return action === "deactivate" ? "account_deactivate" : "account_delete";
}

function hashPhoneCode(phone: string, purpose: string, code: string): string {
  const secret = String(process.env.OTP_HASH_SECRET || process.env.JWT_SECRET || "").trim();
  if (!secret) throw new Error("OTP_HASH_SECRET or JWT_SECRET is required");
  return crypto.createHmac("sha256", secret).update(`${purpose}:${phone}:${code}`).digest("hex");
}

function postgresErrorCode(error: unknown): string {
  const candidate = error as { code?: unknown; cause?: { code?: unknown } } | null;
  return String(candidate?.cause?.code || candidate?.code || "");
}

function maskPhone(phone: string): string {
  const normalized = String(phone || "").replace(/\s+/g, "");
  return normalized.length > 4 ? `${"*".repeat(Math.min(7, normalized.length - 4))}${normalized.slice(-4)}` : "****";
}

function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!local || !domain) return "***";
  const shown = local.slice(0, Math.min(2, local.length));
  return `${shown}${"*".repeat(Math.max(2, Math.min(6, local.length - shown.length)))}@${domain}`;
}

export async function getAccountStepUpOptions(user: AccountUser) {
  const email = normalizeEmailAddress(user.email);
  const developmentDelivery = process.env.NODE_ENV === "development" && process.env.ALLOW_DEV_OTP_RESPONSE === "true";
  const otpDeliveryStatus = await getOtpDeliveryConfigurationStatus();
  const phoneDeliveryAvailable = otpDeliveryStatus.phoneRegistrationConfigured || developmentDelivery;
  const emailDeliveryAvailable = getEmailConfigurationStatus().configured || developmentDelivery;
  return {
    passwordAvailable: Boolean(user.password),
    phoneAvailable: Boolean(user.phone && phoneDeliveryAvailable),
    maskedPhone: user.phone && phoneDeliveryAvailable ? maskPhone(user.phone) : null,
    emailAvailable: Boolean(email && user.emailVerified === true && emailDeliveryAvailable),
    maskedEmail: email && user.emailVerified === true && emailDeliveryAvailable ? maskEmail(email) : null,
  };
}

export async function requestAccountStepUpCode(args: {
  user: AccountUser;
  action: AccountAction;
  channel: AccountStepUpChannel;
}): Promise<{
  success: boolean;
  expiresInSeconds: number;
  resendAfterSeconds: number;
  destination?: string | null;
  code?: string;
  errorCode?: string;
}> {
  const purpose = accountActionPurpose(args.action);
  if (args.channel === "email") {
    const email = normalizeEmailAddress(args.user.email);
    if (!email || args.user.emailVerified !== true) {
      return { success: false, expiresInSeconds: 0, resendAfterSeconds: 0, errorCode: "VERIFIED_EMAIL_UNAVAILABLE" };
    }
    const result = await sendEmailChallenge({
      userId: args.user.id,
      email,
      name: args.user.name,
      role: args.user.role,
      purpose,
    });
    return { ...result, destination: maskEmail(email) };
  }

  const phone = String(args.user.phone || "").trim();
  if (!phone) return { success: false, expiresInSeconds: 0, resendAfterSeconds: 0, errorCode: "PHONE_UNAVAILABLE" };
  const latest = await db.query.otpsTable.findFirst({
    where: and(eq(otpsTable.phone, phone), eq(otpsTable.purpose, purpose), eq(otpsTable.role, args.user.role)),
    orderBy: desc(otpsTable.createdAt),
  });
  const remainingMs = (latest?.createdAt ? new Date(latest.createdAt).getTime() : 0) + RESEND_SECONDS * 1000 - Date.now();
  if (latest && !latest.used && remainingMs > 0) {
    return {
      success: false,
      expiresInSeconds: Math.max(0, Math.ceil((new Date(latest.expiresAt).getTime() - Date.now()) / 1000)),
      resendAfterSeconds: Math.ceil(remainingMs / 1000),
      destination: maskPhone(phone),
      errorCode: "OTP_RESEND_COOLDOWN",
    };
  }

  await db.update(otpsTable).set({ used: true, invalidatedReason: "replaced_by_new_code" }).where(and(
    eq(otpsTable.phone, phone),
    eq(otpsTable.purpose, purpose),
    eq(otpsTable.role, args.user.role),
    eq(otpsTable.used, false),
  ));

  const code = crypto.randomInt(100000, 1_000_000).toString();
  const otpId = crypto.randomUUID();
  try {
    await db.insert(otpsTable).values({
      id: otpId,
      phone,
      code: hashPhoneCode(phone, purpose, code),
      purpose,
      role: args.user.role,
      attempts: 0,
      maxAttempts: MAX_ATTEMPTS,
      expiresAt: new Date(Date.now() + TTL_SECONDS * 1000),
      used: false,
    });
  } catch (error) {
    if (postgresErrorCode(error) === "23505") {
      return { success: false, expiresInSeconds: TTL_SECONDS, resendAfterSeconds: RESEND_SECONDS, errorCode: "OTP_REQUEST_IN_PROGRESS" };
    }
    throw error;
  }

  const delivery = await deliverAuthenticationOtp({
    otpId,
    phone,
    code,
    purpose,
    role: args.user.role === "provider" ? "provider" : "customer",
    expiresMinutes: Math.ceil(TTL_SECONDS / 60),
    userId: args.user.id,
    userName: args.user.name,
    deliveryChannels: ["whatsapp_cloud", "http_sms"],
  });
  const exposeCode = process.env.NODE_ENV === "development" && process.env.ALLOW_DEV_OTP_RESPONSE === "true";
  if (!delivery.delivered && !exposeCode) {
    await db.update(otpsTable).set({ used: true, invalidatedReason: "delivery_failed" }).where(eq(otpsTable.id, otpId));
    return { success: false, expiresInSeconds: TTL_SECONDS, resendAfterSeconds: RESEND_SECONDS, errorCode: "OTP_DELIVERY_UNAVAILABLE" };
  }
  await db.update(otpsTable).set({
    deliveryChannel: delivery.delivered ? delivery.deliveryChannel : "development",
    deliveredAt: new Date(),
  }).where(eq(otpsTable.id, otpId));
  return {
    success: true,
    expiresInSeconds: TTL_SECONDS,
    resendAfterSeconds: RESEND_SECONDS,
    destination: maskPhone(phone),
    ...(exposeCode ? { code } : {}),
  };
}

export async function verifyAccountStepUpCode(args: {
  user: AccountUser;
  action: AccountAction;
  channel: AccountStepUpChannel;
  code: string;
}): Promise<{ success: boolean; code?: string; attemptsRemaining?: number }> {
  const purpose = accountActionPurpose(args.action);
  const inputCode = String(args.code || "").trim();
  if (!/^\d{6}$/.test(inputCode)) return { success: false, code: "OTP_INVALID" };
  if (args.channel === "email") {
    const email = normalizeEmailAddress(args.user.email);
    if (!email || args.user.emailVerified !== true) return { success: false, code: "VERIFIED_EMAIL_UNAVAILABLE" };
    return verifyEmailChallenge({ userId: args.user.id, email, purpose, code: inputCode, role: args.user.role });
  }

  const phone = String(args.user.phone || "").trim();
  const challenge = await db.query.otpsTable.findFirst({
    where: and(
      eq(otpsTable.phone, phone),
      eq(otpsTable.purpose, purpose),
      eq(otpsTable.role, args.user.role),
      eq(otpsTable.used, false),
    ),
    orderBy: desc(otpsTable.createdAt),
  });
  if (!challenge) return { success: false, code: "OTP_INVALID" };
  if (new Date(challenge.expiresAt).getTime() <= Date.now()) {
    await db.update(otpsTable).set({ used: true, invalidatedReason: "expired" }).where(eq(otpsTable.id, challenge.id));
    return { success: false, code: "OTP_EXPIRED" };
  }
  if ((challenge.attempts || 0) >= (challenge.maxAttempts || MAX_ATTEMPTS)) {
    await db.update(otpsTable).set({ used: true, invalidatedReason: "attempt_limit" }).where(eq(otpsTable.id, challenge.id));
    return { success: false, code: "OTP_ATTEMPT_LIMIT", attemptsRemaining: 0 };
  }
  const valid = otpHashMatches(challenge.code, hashPhoneCode(phone, purpose, inputCode));
  if (!valid) {
    const updated = await pool.query<{ attempts: number; max_attempts: number; used: boolean }>(
      `UPDATE otps
       SET attempts = attempts + 1,
           used = CASE WHEN attempts + 1 >= max_attempts THEN true ELSE used END,
           invalidated_reason = CASE WHEN attempts + 1 >= max_attempts THEN 'attempt_limit' ELSE invalidated_reason END
       WHERE id = $1 AND used = false
       RETURNING attempts, max_attempts, used`,
      [challenge.id],
    );
    const row = updated.rows[0];
    if (!row) return { success: false, code: "OTP_INVALID", attemptsRemaining: 0 };
    const exhausted = row.used || row.attempts >= row.max_attempts;
    return {
      success: false,
      code: exhausted ? "OTP_ATTEMPT_LIMIT" : "OTP_INCORRECT",
      attemptsRemaining: Math.max(0, row.max_attempts - row.attempts),
    };
  }
  const consumed = await pool.query<{ id: string }>(
    `UPDATE otps SET used = true, invalidated_reason = 'verified'
     WHERE id = $1 AND used = false AND expires_at > now()
     RETURNING id`,
    [challenge.id],
  );
  return consumed.rows[0] ? { success: true } : { success: false, code: "OTP_INVALID" };
}
