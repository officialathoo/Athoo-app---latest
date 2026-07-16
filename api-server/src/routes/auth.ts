import { Router, type Response } from "express";
import { logger } from "../lib/logger";
import { db } from "@workspace/db";
import { usersTable, otpsTable, loginHistoryTable, adminBlacklistTable, emailPreferencesTable } from "@workspace/db/schema";
import { eq, and, or, desc, sql } from "drizzle-orm";
import { signAccessToken, signPurposeToken, verifyToken, requireAuth, type AuthRequest } from "../middlewares/auth";
import { createSession, rotateSession, revokeSession, revokeAllUserSessions } from "../lib/session";
import { getPlatformSettings } from "../lib/admin";
import { LEGAL_VERSION } from "../lib/legal";
import { isOwnedUploadObjectPath, normalizeStoredObjectPath } from "../lib/storageSecurity";
import { cleanupReplacedOwnedMedia } from "../lib/mediaLifecycle";
// Rate limiting is handled globally by express-rate-limit in app.ts
import * as bcrypt from "bcryptjs";
import crypto from "crypto";
import { accountUnavailableResponse, cleanOtpPurpose, otpHashMatches, type OtpPurpose } from "../lib/authOtpPolicy";
import { hasSeenDevice, normalizeEmailAddress, queueNewDeviceEmail, queuePasswordChangedEmail, queueWelcomeEmail, sendEmailChallenge, verifyEmailChallenge } from "../lib/emailAuth";
import { deliverAuthenticationOtp } from "../lib/otpDelivery";

const router = Router();

function generateOtp(): string {
  return crypto.randomInt(1000, 10000).toString();
}

function hashOtp(phone: string, code: string, purpose: OtpPurpose): string {
  const secret = process.env.OTP_HASH_SECRET?.trim() || process.env.JWT_SECRET?.trim();
  if (!secret) throw new Error("OTP hash secret is not configured");
  return crypto.createHmac("sha256", secret).update(`${purpose}:${phone}:${code}`).digest("hex");
}

function generateId(): string {
  return crypto.randomUUID();
}

async function issueSession(user: any, req: any) {
  return createSession(user, { ipAddress: req.ip ?? null, userAgent: req.headers?.["user-agent"] ?? null });
}

function normalizedEmailCondition(email: string) {
  return sql`lower(trim(${usersTable.email})) = ${email}`;
}

async function findEmailLoginUser(email: string, expectedRole: "customer" | "provider") {
  const matches = await db.query.usersTable.findMany({ where: normalizedEmailCondition(email) });
  return matches.find((candidate) => candidate.role === expectedRole)
    || matches.find((candidate) => candidate.emailVerified === true)
    || matches[0]
    || null;
}

function cleanPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  let normalized = "";
  if (digits.startsWith("92") && digits.length === 12) normalized = `0${digits.slice(2)}`;
  else if (digits.startsWith("3") && digits.length === 10) normalized = `0${digits}`;
  else if (digits.startsWith("0") && digits.length === 11) normalized = digits;
  return /^03\d{9}$/.test(normalized) ? normalized : "";
}

function cleanRole(role?: string): "customer" | "provider" | null {
  if (role === "customer" || role === "provider") return role;
  return null;
}

function cleanEmail(email?: string): string | null {
  if (!email) return null;
  const v = email.trim().toLowerCase();
  if (!v) return null;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? v : null;
}

function postgresErrorCode(error: unknown): string {
  const candidate = error as { code?: unknown; cause?: { code?: unknown } } | null;
  return String(candidate?.cause?.code || candidate?.code || "");
}

function toSafeUser<T extends Record<string, any>>(user: T | null | undefined) {
  if (!user) return null;
  const { password, adminFailedLoginCount, adminLockedUntil, ...safeUser } = user;
  return safeUser;
}

const OTP_TTL_SECONDS = Math.max(120, Math.min(900, Number(process.env.OTP_TTL_SECONDS || 600)));
const OTP_RESEND_COOLDOWN_SECONDS = Math.max(30, Math.min(300, Number(process.env.OTP_RESEND_COOLDOWN_SECONDS || 45)));
const OTP_MAX_ATTEMPTS = Math.max(3, Math.min(10, Number(process.env.OTP_MAX_ATTEMPTS || 5)));

async function isAuthIdentityBlacklisted(phone: string, email?: string | null): Promise<boolean> {
  const identityCondition = email
    ? or(eq(adminBlacklistTable.value, phone), eq(adminBlacklistTable.value, email))
    : eq(adminBlacklistTable.value, phone);
  const row = await db.query.adminBlacklistTable.findFirst({
    where: and(eq(adminBlacklistTable.isActive, true), identityCondition),
  });
  return Boolean(row);
}

async function latestOtp(phone: string, purpose: OtpPurpose, role?: "customer" | "provider" | null) {
  return db.query.otpsTable.findFirst({
    where: and(
      eq(otpsTable.phone, phone),
      eq(otpsTable.purpose, purpose),
      role ? eq(otpsTable.role, role) : undefined,
    ),
    orderBy: desc(otpsTable.createdAt),
  });
}

async function invalidateOpenOtps(phone: string, purpose: OtpPurpose, reason: string) {
  await db
    .update(otpsTable)
    .set({ used: true, invalidatedReason: reason })
    .where(and(eq(otpsTable.phone, phone), eq(otpsTable.purpose, purpose), eq(otpsTable.used, false)));
}

router.post("/purpose-token", requireAuth, async (req: AuthRequest, res: Response) => {
  const purpose = String(req.body?.purpose || "");
  if (!new Set(["realtime", "object-read"]).has(purpose)) return res.status(400).json({ error: "Unsupported token purpose" });
  const token = signPurposeToken({ userId: req.user!.userId, role: req.user!.role, sessionId: req.user!.sessionId, purpose, adminRole: req.user!.adminRole, adminPermissions: req.user!.adminPermissions }, "2m");
  return res.json({ token, expiresInSeconds: 120 });
});

router.post("/send-otp", async (req, res) => {
  try {
    const { phone, email, purpose: rawPurpose, role: rawRole } = req.body as {
      phone?: string;
      email?: string;
      purpose?: string;
      role?: string;
    };

    if (!phone) {
      return res.status(400).json({ error: "Valid phone number required", code: "INVALID_PHONE" });
    }

    const purpose = cleanOtpPurpose(rawPurpose);
    if (!purpose || purpose === "password_reset") {
      return res.status(400).json({ error: "OTP purpose must be login or registration", code: "INVALID_OTP_PURPOSE" });
    }

    const normalizedPhone = cleanPhone(phone);
    if (!normalizedPhone) {
      return res.status(400).json({ error: "Enter a valid Pakistani mobile number, for example 03001234567.", code: "INVALID_PHONE" });
    }
    const normalizedEmail = cleanEmail(email);
    if (email && !normalizedEmail) {
      return res.status(400).json({ error: "Enter a valid email address or leave the email field empty.", code: "INVALID_EMAIL" });
    }
    const expectedRole = cleanRole(rawRole);
    if (!expectedRole) {
      return res.status(400).json({ error: "Select Customer or Provider before requesting an OTP.", code: "ROLE_REQUIRED" });
    }

    const existingUser = await db.query.usersTable.findFirst({
      where: eq(usersTable.phone, normalizedPhone),
    });

    if (purpose === "login") {
      const unavailable = accountUnavailableResponse(existingUser, expectedRole);
      if (unavailable) return res.status(unavailable.status).json({ error: unavailable.error, code: unavailable.code });
      if (await isAuthIdentityBlacklisted(normalizedPhone, existingUser?.email)) {
        return res.status(403).json({ error: "This account is suspended. Please contact Athoo Support.", code: "ACCOUNT_SUSPENDED" });
      }
    } else {
      if (existingUser) {
        const actualRole = existingUser.role === "provider" ? "provider" : "customer";
        return res.status(409).json({
          error: `This phone number is already registered as a ${actualRole}. Please sign in instead.`,
          code: "ACCOUNT_ALREADY_EXISTS",
          existingRole: actualRole,
        });
      }
      if (await isAuthIdentityBlacklisted(normalizedPhone, normalizedEmail)) {
        return res.status(403).json({ error: "Registration is not permitted for this account. Please contact Athoo Support.", code: "REGISTRATION_BLOCKED" });
      }
    }

    const previousOtp = await latestOtp(normalizedPhone, purpose, expectedRole);
    const previousCreatedAt = previousOtp?.createdAt ? new Date(previousOtp.createdAt).getTime() : 0;
    const cooldownMs = OTP_RESEND_COOLDOWN_SECONDS * 1000;
    const remainingMs = previousCreatedAt + cooldownMs - Date.now();
    if (previousOtp && !previousOtp.used && remainingMs > 0) {
      return res.status(429).json({
        error: `Please wait ${Math.ceil(remainingMs / 1000)} seconds before requesting another code.`,
        code: "OTP_RESEND_COOLDOWN",
        retryAfterSeconds: Math.ceil(remainingMs / 1000),
      });
    }

    const code = generateOtp();
    const expiresAt = new Date(Date.now() + OTP_TTL_SECONDS * 1000);
    await invalidateOpenOtps(normalizedPhone, purpose, "replaced_by_new_code");

    const otpId = generateId();
    let insertedOtp;
    try {
      insertedOtp = await db
        .insert(otpsTable)
        .values({
          id: otpId,
          phone: normalizedPhone,
          code: hashOtp(normalizedPhone, code, purpose),
          purpose,
          role: expectedRole,
          attempts: 0,
          maxAttempts: OTP_MAX_ATTEMPTS,
          expiresAt,
          used: false,
        })
        .returning({
          id: otpsTable.id,
          phone: otpsTable.phone,
          purpose: otpsTable.purpose,
          expiresAt: otpsTable.expiresAt,
          createdAt: otpsTable.createdAt,
        });
    } catch (error) {
      if (postgresErrorCode(error) === "23505") {
        return res.status(429).json({
          error: "A verification code was just requested. Please wait before requesting another code.",
          code: "OTP_REQUEST_IN_PROGRESS",
          retryAfterSeconds: OTP_RESEND_COOLDOWN_SECONDS,
        });
      }
      throw error;
    }

    const persistedOtp = insertedOtp[0];
    if (!persistedOtp || persistedOtp.id !== otpId || persistedOtp.purpose !== purpose) {
      throw new Error("OTP persistence verification failed");
    }

    logger.info({ otpId, phone: normalizedPhone, purpose, role: expectedRole }, "authentication OTP persisted");

    const isDev = process.env.NODE_ENV === "development" && process.env.ALLOW_DEV_OTP_RESPONSE === "true";
    if (isDev) logger.info(`[auth-otp/${purpose}] phone=${normalizedPhone} code=${code} (expires in ${OTP_TTL_SECONDS}s)`);

    const targetEmail = purpose === "login"
      ? existingUser?.emailVerified ? existingUser.email : null
      : null;
    const otpDelivery = await deliverAuthenticationOtp({
      otpId,
      phone: normalizedPhone,
      code,
      purpose,
      role: expectedRole,
      expiresMinutes: Math.ceil(OTP_TTL_SECONDS / 60),
      email: targetEmail,
      userId: existingUser?.id || null,
      userName: existingUser?.name || null,
    });

    const { whatsappSent, emailSent, smsSent } = otpDelivery;
    const delivered = otpDelivery.delivered || isDev;
    const deliveryChannel = isDev && !otpDelivery.delivered
      ? "development"
      : otpDelivery.deliveryChannel;

    if (!delivered) {
      await db.update(otpsTable).set({
        used: true,
        invalidatedReason: "delivery_failed",
      }).where(eq(otpsTable.id, otpId));
      logger.warn({ otpId, phone: normalizedPhone, purpose, hasEmail: Boolean(targetEmail) }, "OTP delivery failed");
      return res.status(503).json({
        error: "Verification code delivery is temporarily unavailable. Please try again shortly.",
        code: "OTP_DELIVERY_UNAVAILABLE",
      });
    }

    await db.update(otpsTable).set({
      deliveryChannel,
      deliveredAt: new Date(),
    }).where(eq(otpsTable.id, otpId));

    logger.info({
      otpId,
      phone: normalizedPhone,
      purpose,
      role: expectedRole,
      deliveryChannel,
      expiresAt,
    }, "authentication OTP delivered");

    const message = otpDelivery.delivered
      ? otpDelivery.message
      : "Verification code generated for local development.";

    return res.json({
      success: true,
      purpose,
      expiresInSeconds: OTP_TTL_SECONDS,
      resendAfterSeconds: OTP_RESEND_COOLDOWN_SECONDS,
      emailSent,
      whatsappSent,
      smsSent,
      deliveryChannels: otpDelivery.deliveredChannels,
      message,
      ...(isDev ? { code } : {}),
    });
  } catch (e) {
    logger.error({ err: e }, "send-otp error");
    return res.status(500).json({ error: "We could not send the verification code. Please try again.", code: "OTP_SEND_FAILED" });
  }
});

router.post("/verify-otp", async (req, res) => {
  try {
    const { phone, code, purpose: rawPurpose, role: rawRole } = req.body as {
      phone?: string;
      code?: string;
      purpose?: string;
      role?: string;
    };

    if (!phone || !code) {
      return res.status(400).json({ error: "Phone and OTP required", code: "OTP_REQUIRED" });
    }

    const purpose = cleanOtpPurpose(rawPurpose);
    if (!purpose || purpose === "password_reset") {
      return res.status(400).json({ error: "OTP purpose must be login or registration", code: "INVALID_OTP_PURPOSE" });
    }
    const expectedRole = cleanRole(rawRole);
    if (!expectedRole) {
      return res.status(400).json({ error: "Select Customer or Provider before verifying an OTP.", code: "ROLE_REQUIRED" });
    }

    const normalizedPhone = cleanPhone(phone);
    if (!normalizedPhone) {
      return res.status(400).json({ error: "Enter a valid Pakistani mobile number.", code: "INVALID_PHONE" });
    }
    const otp = await latestOtp(normalizedPhone, purpose, expectedRole);
    if (!otp || otp.used) {
      return res.status(400).json({ error: "The verification code is invalid or has already been used.", code: "OTP_INVALID" });
    }

    if (new Date(otp.expiresAt).getTime() <= Date.now()) {
      await db.update(otpsTable).set({ used: true, invalidatedReason: "expired" }).where(eq(otpsTable.id, otp.id));
      return res.status(400).json({ error: "The verification code has expired. Please request a new code.", code: "OTP_EXPIRED" });
    }

    if ((otp.attempts || 0) >= (otp.maxAttempts || OTP_MAX_ATTEMPTS)) {
      await db.update(otpsTable).set({ used: true, invalidatedReason: "attempt_limit" }).where(eq(otpsTable.id, otp.id));
      return res.status(429).json({ error: "Too many incorrect attempts. Please request a new code.", code: "OTP_ATTEMPT_LIMIT" });
    }

    const validCode = otpHashMatches(otp.code, hashOtp(normalizedPhone, code.trim(), purpose));
    if (!validCode) {
      const attempts = (otp.attempts || 0) + 1;
      const exhausted = attempts >= (otp.maxAttempts || OTP_MAX_ATTEMPTS);
      await db.update(otpsTable).set({
        attempts,
        ...(exhausted ? { used: true, invalidatedReason: "attempt_limit" } : {}),
      }).where(eq(otpsTable.id, otp.id));
      return res.status(exhausted ? 429 : 400).json({
        error: exhausted ? "Too many incorrect attempts. Please request a new code." : "The verification code is incorrect.",
        code: exhausted ? "OTP_ATTEMPT_LIMIT" : "OTP_INCORRECT",
        attemptsRemaining: Math.max(0, (otp.maxAttempts || OTP_MAX_ATTEMPTS) - attempts),
      });
    }

    await db.update(otpsTable).set({ used: true, invalidatedReason: "verified" }).where(eq(otpsTable.id, otp.id));

    if (purpose === "registration") {
      const existingUser = await db.query.usersTable.findFirst({ where: eq(usersTable.phone, normalizedPhone) });
      if (existingUser) {
        return res.status(409).json({
          error: "This phone number is already registered. Please sign in instead.",
          code: "ACCOUNT_ALREADY_EXISTS",
          existingRole: existingUser.role,
        });
      }
      const registrationToken = signPurposeToken({
        userId: `registration:${normalizedPhone}`,
        role: expectedRole,
        purpose: "registration_verified",
      }, "15m");
      return res.json({ success: true, purpose, registrationToken, isNewUser: true, user: null });
    }

    const user = await db.query.usersTable.findFirst({ where: eq(usersTable.phone, normalizedPhone) });
    const unavailable = accountUnavailableResponse(user, expectedRole);
    if (unavailable) return res.status(unavailable.status).json({ error: unavailable.error, code: unavailable.code });
    if (!user) return res.status(404).json({ error: "No active Athoo account was found with this phone number.", code: "ACCOUNT_NOT_FOUND" });
    if (await isAuthIdentityBlacklisted(normalizedPhone, user.email)) {
      return res.status(403).json({ error: "This account is suspended. Please contact Athoo Support.", code: "ACCOUNT_SUSPENDED" });
    }

    const userAgent = String(req.headers["user-agent"] || "");
    const seenDevice = await hasSeenDevice(user.id, userAgent);
    const session = await issueSession(user, req);
    db.insert(loginHistoryTable).values({
      id: generateId(),
      userId: user.id,
      phone: user.phone,
      email: user.email,
      role: user.role,
      method: "otp",
      success: true,
      ipAddress: req.ip,
      userAgent: userAgent || null,
    }).catch(() => {});
    if (!seenDevice) void queueNewDeviceEmail(user, { device: userAgent, ip: req.ip }).catch(() => undefined);

    return res.json({
      success: true,
      purpose,
      token: session.token,
      refreshToken: session.refreshToken,
      expiresInSeconds: session.expiresInSeconds,
      user: toSafeUser(user),
      isNewUser: false,
    });
  } catch (e) {
    logger.error({ err: e }, "verify-otp error");
    return res.status(500).json({ error: "We could not verify the code. Please request a new code and try again.", code: "OTP_VERIFY_FAILED" });
  }
});


router.post("/email/send-otp", async (req, res) => {
  try {
    const email = normalizeEmailAddress(req.body?.email);
    const expectedRole = cleanRole(req.body?.role);
    if (!email) return res.status(400).json({ error: "Enter a valid email address.", code: "INVALID_EMAIL" });
    if (!expectedRole) return res.status(400).json({ error: "Select Customer or Provider before requesting an email code.", code: "ROLE_REQUIRED" });

    const user = await findEmailLoginUser(email, expectedRole);
    const unavailable = accountUnavailableResponse(user, expectedRole);
    if (unavailable) return res.status(unavailable.status).json({ error: unavailable.error, code: unavailable.code });
    if (!user) return res.status(404).json({ error: "No active Athoo account was found with this email address.", code: "ACCOUNT_NOT_FOUND" });
    if (await isAuthIdentityBlacklisted(user.phone, email)) {
      return res.status(403).json({ error: "This account is suspended. Please contact Athoo Support.", code: "ACCOUNT_SUSPENDED" });
    }
    if (!user.emailVerified) {
      return res.status(403).json({ error: "Verify this email from your Athoo profile before using email OTP login.", code: "EMAIL_NOT_VERIFIED" });
    }

    const result = await sendEmailChallenge({ userId: user.id, email, name: user.name, role: expectedRole, purpose: "login" });
    if (!result.success) {
      const status = result.errorCode === "EMAIL_OTP_RESEND_COOLDOWN" ? 429 : 503;
      return res.status(status).json({
        error: result.errorCode === "EMAIL_OTP_RESEND_COOLDOWN"
          ? `Please wait ${result.resendAfterSeconds} seconds before requesting another email code.`
          : "The sign-in email could not be delivered. Please try another login method or contact support.",
        code: result.errorCode,
        retryAfterSeconds: result.resendAfterSeconds,
      });
    }
    const maskedEmail = email.replace(/^(.{1,2}).*(@.*)$/, "$1***$2");
    return res.json({
      success: true,
      maskedEmail,
      expiresInSeconds: result.expiresInSeconds,
      resendAfterSeconds: result.resendAfterSeconds,
      message: `Sign-in code sent to ${maskedEmail}.`,
      ...(result.code ? { code: result.code } : {}),
    });
  } catch (error) {
    logger.error({ err: error }, "email login OTP send failed");
    return res.status(500).json({ error: "We could not send the email sign-in code.", code: "EMAIL_OTP_SEND_FAILED" });
  }
});

router.post("/email/verify-otp", async (req, res) => {
  try {
    const email = normalizeEmailAddress(req.body?.email);
    const expectedRole = cleanRole(req.body?.role);
    const code = String(req.body?.code || "").trim();
    if (!email || !/^\d{6}$/.test(code)) return res.status(400).json({ error: "Email and a valid 6-digit code are required.", code: "EMAIL_OTP_REQUIRED" });
    if (!expectedRole) return res.status(400).json({ error: "Select Customer or Provider before verifying the email code.", code: "ROLE_REQUIRED" });

    const user = await findEmailLoginUser(email, expectedRole);
    const unavailable = accountUnavailableResponse(user, expectedRole);
    if (unavailable) return res.status(unavailable.status).json({ error: unavailable.error, code: unavailable.code });
    if (!user) return res.status(404).json({ error: "No active Athoo account was found with this email address.", code: "ACCOUNT_NOT_FOUND" });
    if (!user.emailVerified) return res.status(403).json({ error: "This email is not verified.", code: "EMAIL_NOT_VERIFIED" });
    if (await isAuthIdentityBlacklisted(user.phone, email)) {
      return res.status(403).json({ error: "This account is suspended. Please contact Athoo Support.", code: "ACCOUNT_SUSPENDED" });
    }

    const verified = await verifyEmailChallenge({ userId: user.id, email, purpose: "login", code, role: expectedRole });
    if (!verified.success) {
      const status = verified.code === "EMAIL_OTP_ATTEMPT_LIMIT" ? 429 : 400;
      return res.status(status).json({
        error: verified.code === "EMAIL_OTP_EXPIRED"
          ? "The email sign-in code has expired. Request a new code."
          : verified.code === "EMAIL_OTP_ATTEMPT_LIMIT"
            ? "Too many incorrect attempts. Request a new code."
            : "The email sign-in code is incorrect.",
        code: verified.code,
        attemptsRemaining: verified.attemptsRemaining,
      });
    }

    const userAgent = String(req.headers["user-agent"] || "");
    const seenDevice = await hasSeenDevice(user.id, userAgent);
    const session = await issueSession(user, req);
    await db.insert(loginHistoryTable).values({
      id: generateId(), userId: user.id, phone: user.phone, email: user.email, role: user.role,
      method: "email_otp", success: true, ipAddress: req.ip, userAgent: userAgent || null,
    });
    if (!seenDevice) void queueNewDeviceEmail(user, { device: userAgent, ip: req.ip }).catch(() => undefined);

    return res.json({
      success: true,
      token: session.token,
      refreshToken: session.refreshToken,
      expiresInSeconds: session.expiresInSeconds,
      user: toSafeUser(user),
    });
  } catch (error) {
    logger.error({ err: error }, "email login OTP verification failed");
    return res.status(500).json({ error: "We could not verify the email sign-in code.", code: "EMAIL_OTP_VERIFY_FAILED" });
  }
});

router.post("/register", async (req, res) => {
  try {
    const { name, phone, email, role, services, fatherName, cnicNumber, experience, location, ratePerHour, password, termsAccepted, privacyAccepted, registrationToken } = req.body as {
      name: string;
      phone: string;
      email?: string;
      role: string;
      services?: string[];
      fatherName?: string;
      cnicNumber?: string;
      experience?: string;
      location?: string;
      ratePerHour?: number;
      password?: string;
      termsAccepted?: boolean;
      privacyAccepted?: boolean;
      registrationToken?: string;
    };

    if (!name || !phone || !role) {
      res.status(400).json({ error: "Name, phone and role required" });
      return;
    }

    // v4.4 — Legal acceptance is mandatory at registration
    if (!termsAccepted || !privacyAccepted) {
      res.status(400).json({ error: "You must accept the Terms of Service and Privacy Policy to create an account." });
      return;
    }

    const normalizedPhone = cleanPhone(phone);
    const normalizedEmail = cleanEmail(email);
    const normalizedRole = cleanRole(role);

    if (!normalizedPhone || normalizedPhone.length < 10) {
      res.status(400).json({ error: "Valid phone number required" });
      return;
    }

    if (!normalizedRole) {
      res.status(400).json({ error: "Role must be customer or provider" });
      return;
    }

    const verifiedRegistration = registrationToken ? verifyToken(registrationToken) : null;
    if (
      !verifiedRegistration ||
      verifiedRegistration.tokenType !== "purpose" ||
      verifiedRegistration.purpose !== "registration_verified" ||
      verifiedRegistration.role !== normalizedRole ||
      verifiedRegistration.userId !== `registration:${normalizedPhone}`
    ) {
      return res.status(403).json({
        error: "Phone verification is required before creating an account. Please request a new code.",
        code: "REGISTRATION_PHONE_NOT_VERIFIED",
      });
    }
    let normalizedCnic: string | null = null;
    if (normalizedRole === "provider") {
      normalizedCnic = String(cnicNumber || "").replace(/\D/g, "");
      if (!String(fatherName || "").trim() || normalizedCnic.length !== 13) {
        res.status(400).json({ error: "Provider father name and a valid 13-digit CNIC are required" });
        return;
      }
      if (!Array.isArray(services) || services.length === 0) {
        res.status(400).json({ error: "Select at least one provider service" });
        return;
      }
      const duplicateCnic = await db.query.usersTable.findFirst({ where: eq(usersTable.cnicNumber, normalizedCnic) });
      if (duplicateCnic) {
        res.status(409).json({ error: "A provider account already exists with this CNIC" });
        return;
      }
    }

    const existingByPhone = await db.query.usersTable.findFirst({
      where: eq(usersTable.phone, normalizedPhone),
    });

    if (existingByPhone) {
      res.status(400).json({ error: "Account already exists with this phone number" });
      return;
    }

    if (normalizedEmail) {
      const existingByEmail = await db.query.usersTable.findFirst({
        where: normalizedEmailCondition(normalizedEmail),
      });

      if (existingByEmail) {
        res.status(400).json({ error: "Account already exists with this email address" });
        return;
      }
    }

    // Check admin blacklist — block phone and email if listed
    const phoneBlacklisted = await db.query.adminBlacklistTable.findFirst({
      where: and(eq(adminBlacklistTable.isActive, true), eq(adminBlacklistTable.value, normalizedPhone)),
    });
    const emailBlacklisted = normalizedEmail
      ? await db.query.adminBlacklistTable.findFirst({
          where: and(eq(adminBlacklistTable.isActive, true), eq(adminBlacklistTable.value, normalizedEmail)),
        })
      : null;

    if (phoneBlacklisted || emailBlacklisted) {
      res.status(403).json({ error: "Registration is not permitted for this account. Please contact support." });
      return;
    }

    let hashedPassword: string | null = null;

    if (typeof password === "string" && password.trim().length > 0) {
      if (password.length < 8) {
        res.status(400).json({ error: "Password must be at least 8 characters" });
        return;
      }

      hashedPassword = await bcrypt.hash(password, 10);
    }

    // Generate a unique short referral code (e.g. ATH-X4K9J2)
    const referralCode = `ATH-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;

    // Handle referredBy — if a referral code was provided, look up the referrer
    let referredByUserId: string | null = null;
    const providedReferralCode = typeof req.body.referralCode === "string" ? req.body.referralCode.trim().toUpperCase() : null;
    if (providedReferralCode) {
      const referrer = await db.query.usersTable.findFirst({ where: eq(usersTable.referralCode, providedReferralCode) });
      if (referrer) {
        referredByUserId = referrer.id;
        // Increment referrer's count (non-fatal)
        db.update(usersTable).set({ referralCount: (referrer.referralCount || 0) + 1 }).where(eq(usersTable.id, referrer.id)).catch(() => {});
      }
    }

    // Check providerAutoApprove platform setting
    let autoApproved = false;
    if (normalizedRole === "provider") {
      try {
        const settings = await getPlatformSettings();
        autoApproved = Boolean(settings.providerAutoApprove);
      } catch {
        // Non-fatal — fall back to manual approval
      }
    }

    const newUser = {
      id: generateId(),
      name: name.trim(),
      phone: normalizedPhone,
      role: normalizedRole,
      email: normalizedEmail,
      services: Array.isArray(services) ? [...new Set(services.map((value) => String(value).trim()).filter(Boolean))] : [],
      fatherName: normalizedRole === "provider" ? String(fatherName || "").trim() : null,
      cnicNumber: normalizedCnic,
      experience: normalizedRole === "provider" ? String(experience || "").trim() || null : null,
      location: normalizedRole === "provider" ? String(location || "").trim() || null : null,
      ratePerHour: normalizedRole === "provider" && Number.isInteger(Number(ratePerHour)) && Number(ratePerHour) > 0 ? Number(ratePerHour) : null,
      password: hashedPassword,
      profileColor: role === "provider" ? "#FF6B1A" : "#1A6EE0",
      isVerified: autoApproved,
      verificationStatus: autoApproved ? "approved" : "pending",
      isAvailable: true,
      rating: 0,
      ratingCount: 0,
      totalJobs: 0,
      isDeactivated: false,
      referralCode,
      referredBy: referredByUserId,
      referralCount: 0,
      termsAcceptedAt: new Date(),
      privacyAcceptedAt: new Date(),
      legalVersion: LEGAL_VERSION,
      emailVerified: false,
    };

    await db.insert(usersTable).values(newUser);
    await db.insert(emailPreferencesTable).values({ userId: newUser.id }).onConflictDoNothing({ target: emailPreferencesTable.userId });

    let emailVerification: Awaited<ReturnType<typeof sendEmailChallenge>> | null = null;
    if (normalizedEmail) {
      void queueWelcomeEmail(newUser).catch((error) => logger.warn({ err: error, userId: newUser.id }, "welcome email queue failed"));
      emailVerification = await sendEmailChallenge({
        userId: newUser.id,
        email: normalizedEmail,
        name: newUser.name,
        role: normalizedRole,
        purpose: "verify_email",
      }).catch((error) => {
        logger.warn({ err: error, userId: newUser.id }, "registration verification email failed");
        return null;
      });
    }

    const session = await issueSession(newUser, req);
    const token = session.token;

    return res.json({
      success: true,
      token,
      refreshToken: session.refreshToken,
      expiresInSeconds: session.expiresInSeconds,
      user: toSafeUser(newUser),
      emailVerificationRequired: Boolean(normalizedEmail),
      emailVerificationSent: Boolean(emailVerification?.success),
      emailVerificationExpiresInSeconds: emailVerification?.expiresInSeconds,
      emailVerificationResendAfterSeconds: emailVerification?.resendAfterSeconds,
      ...(emailVerification?.code ? { emailVerificationCode: emailVerification.code } : {}),
    });
  } catch (e) {
    logger.error({ err: e }, "register error");
    return res.status(500).json({ error: "Failed to register" });
  }
});

router.patch("/push-token", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const expoPushToken = typeof (req.body as any)?.expoPushToken === "string" ? (req.body as any).expoPushToken.trim() : "";
    const validExpoToken = /^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]+\]$/.test(expoPushToken);
    if (expoPushToken && !validExpoToken) {
      res.status(400).json({ error: "Invalid Expo push token", code: "INVALID_PUSH_TOKEN" });
      return;
    }

    await db.update(usersTable).set({
      expoPushToken: expoPushToken || null,
      updatedAt: new Date(),
    }).where(eq(usersTable.id, req.user!.userId));

    res.json({ success: true });
  } catch (e) {
    logger.error({ err: e }, "save push token error");
    res.status(500).json({ error: "Failed to save push token" });
  }
});

router.get("/me", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = await db.query.usersTable.findFirst({
      where: eq(usersTable.id, req.user!.userId),
    });

    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    res.json({ user: toSafeUser(user) });
  } catch (e) {
    logger.error({ err: e }, "get me error");
    res.status(500).json({ error: "Failed to load profile" });
  }
});

router.patch("/me", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = await db.query.usersTable.findFirst({
      where: eq(usersTable.id, req.user!.userId),
    });
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    const body = req.body ?? {};
    if (body.name !== undefined) {
      const name = String(body.name).trim();
      if (name.length < 2 || name.length > 80) {
        res.status(400).json({ error: "Name must be between 2 and 80 characters" });
        return;
      }
      updates.name = name;
    }
    if (body.bio !== undefined) {
      const bio = String(body.bio ?? "").trim();
      if (bio.length > 500) {
        res.status(400).json({ error: "Bio must be 500 characters or fewer" });
        return;
      }
      updates.bio = bio || null;
    }
    if (body.experience !== undefined) {
      if (user.role !== "provider") {
        res.status(403).json({ error: "Provider account required" });
        return;
      }
      const experience = String(body.experience ?? "").trim();
      if (experience.length > 120) {
        res.status(400).json({ error: "Experience must be 120 characters or fewer" });
        return;
      }
      updates.experience = experience || null;
    }
    if (body.location !== undefined) {
      const location = String(body.location ?? "").trim();
      if (location.length > 160) {
        res.status(400).json({ error: "Location must be 160 characters or fewer" });
        return;
      }
      updates.location = location || null;
    }
    if (body.profileImage !== undefined) {
      const profileImage = normalizeStoredObjectPath(body.profileImage);
      if (profileImage && !isOwnedUploadObjectPath(profileImage, user.id, ["shared", "private"])) {
        res.status(400).json({ error: "Profile photo must be uploaded through your Athoo account" });
        return;
      }
      updates.profileImage = profileImage || null;
    }
    if (body.profileColor !== undefined) {
      const color = String(body.profileColor || "").trim();
      if (color && !/^#[0-9a-f]{6}$/i.test(color)) {
        res.status(400).json({ error: "Invalid profile color" });
        return;
      }
      updates.profileColor = color || null;
    }

    const forbidden = ["role", "email", "phone", "services", "ratePerHour", "isAvailable", "maxTravelDistanceKm", "verificationStatus", "isVerified"];
    const attempted = forbidden.filter((field) => body[field] !== undefined);
    if (attempted.length) {
      res.status(403).json({ error: `Profile field changes require the approved workflow: ${attempted.join(", ")}` });
      return;
    }
    if (Object.keys(updates).length === 1) {
      res.status(400).json({ error: "No valid fields to update" });
      return;
    }

    const [updated] = await db.update(usersTable).set(updates).where(eq(usersTable.id, user.id)).returning();
    if (body.profileImage !== undefined) cleanupReplacedOwnedMedia(user.profileImage, updated.profileImage, user.id);
    res.json({ user: toSafeUser(updated) });
  } catch (e) {
    logger.error({ err: e }, "update me error");
    res.status(500).json({ error: "Failed to update profile" });
  }
});

// DELETE /auth/me — permanently delete account
router.delete("/me", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    await db.delete(usersTable).where(eq(usersTable.id, req.user!.userId));
    res.json({ success: true });
  } catch (e) {
    logger.error({ err: e }, "delete me error");
    res.status(500).json({ error: "Failed to delete account" });
  }
});

// POST /auth/deactivate — deactivate account (keep data, prevent login)
router.post("/deactivate", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    await db
      .update(usersTable)
      .set({ isDeactivated: true, updatedAt: new Date() })
      .where(eq(usersTable.id, req.user!.userId));

    res.json({ success: true });
  } catch (e) {
    logger.error({ err: e }, "deactivate error");
    res.status(500).json({ error: "Failed to deactivate account" });
  }
});

// GET /auth/users/:id — get public profile of any user
router.get("/users/:id", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = await db.query.usersTable.findFirst({
      where: eq(usersTable.id, req.params.id as string),
    });

    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    res.json({ user: toSafeUser(user) });
  } catch (e) {
    logger.error({ err: e }, "get user error");
    res.status(500).json({ error: "Failed to get user" });
  }
});


function strongAdminPassword(value: string): boolean {
  return /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{12,}$/.test(value);
}

router.post("/admin-login", async (req, res) => {
  try {
    const identifier = String(req.body?.identifier || "").trim();
    const password = String(req.body?.password || "");
    if (!identifier || !password) return res.status(400).json({ error: "Admin credentials are required" });

    const normalizedPhone = cleanPhone(identifier);
    const normalizedEmail = identifier.toLowerCase();
    const user = await db.query.usersTable.findFirst({
      where: or(eq(usersTable.phone, normalizedPhone), eq(usersTable.phone, identifier), normalizedEmailCondition(normalizedEmail)),
    });
    const genericError = { error: "Invalid admin credentials" };
    if (!user || user.role !== "admin" || !user.password) {
      await db.insert(loginHistoryTable).values({ id: generateId(), userId: user?.id || null, phone: normalizedPhone || null, email: normalizedEmail.includes("@") ? normalizedEmail : null, role: "admin", method: "password", success: false, failReason: "Invalid admin credentials", ipAddress: req.ip, userAgent: req.headers["user-agent"] || null }).catch(() => {});
      return res.status(401).json(genericError);
    }
    if (user.isDeactivated || user.isBlocked || user.accountStatus === "deleted") return res.status(403).json({ error: "Admin account is unavailable" });
    if (user.adminLockedUntil && new Date(user.adminLockedUntil).getTime() > Date.now()) {
      return res.status(423).json({ error: "Admin account is temporarily locked. Try again later." });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      const failures = Number(user.adminFailedLoginCount || 0) + 1;
      const lockedUntil = failures >= 5 ? new Date(Date.now() + 15 * 60 * 1000) : null;
      await db.update(usersTable).set({ adminFailedLoginCount: lockedUntil ? 0 : failures, adminLockedUntil: lockedUntil, updatedAt: new Date() }).where(eq(usersTable.id, user.id));
      await db.insert(loginHistoryTable).values({ id: generateId(), userId: user.id, phone: user.phone, email: user.email, role: "admin", method: "password", success: false, failReason: lockedUntil ? "Admin account temporarily locked" : "Invalid admin credentials", ipAddress: req.ip, userAgent: req.headers["user-agent"] || null }).catch(() => {});
      return res.status(lockedUntil ? 423 : 401).json(lockedUntil ? { error: "Admin account is temporarily locked for 15 minutes" } : genericError);
    }

    await db.update(usersTable).set({ adminFailedLoginCount: 0, adminLockedUntil: null, updatedAt: new Date() }).where(eq(usersTable.id, user.id));
    const session = await createSession(user, { ipAddress: req.ip ?? null, userAgent: req.headers["user-agent"] ?? null }, 1);
    await db.insert(loginHistoryTable).values({ id: generateId(), userId: user.id, phone: user.phone, email: user.email, role: "admin", method: "password", success: true, ipAddress: req.ip, userAgent: req.headers["user-agent"] || null }).catch(() => {});
    return res.json({ success: true, token: session.token, refreshToken: session.refreshToken, expiresInSeconds: session.expiresInSeconds, refreshExpiresAt: session.refreshExpiresAt, user: toSafeUser(user) });
  } catch (e) {
    logger.error({ err: e }, "admin-login error");
    return res.status(500).json({ error: "Admin login failed" });
  }
});

// POST /auth/login — sign in with email/phone + password
router.post("/login", async (req, res) => {
  try {
    const { identifier, password, role } = req.body as {
      identifier: string;
      password: string;
      role?: string;
    };

    if (!identifier || !password) {
      res.status(400).json({ error: "Email/phone and password are required" });
      return;
    }

    const normalizedIdentifier = identifier.trim();
    const normalizedPhone = cleanPhone(normalizedIdentifier);
    const normalizedEmail = normalizedIdentifier.toLowerCase();
    const expectedRole = cleanRole(role);
    if (!expectedRole) {
      return res.status(400).json({ error: "Select Customer or Provider before signing in.", code: "ROLE_REQUIRED" });
    }

    const user = await db.query.usersTable.findFirst({
      where: and(
        eq(usersTable.role, expectedRole),
        or(
          eq(usersTable.phone, normalizedPhone),
          eq(usersTable.phone, normalizedIdentifier),
          normalizedEmailCondition(normalizedEmail),
        ),
      ),
    });
    const unavailable = accountUnavailableResponse(user, expectedRole);
    if (unavailable) {
      return res.status(unavailable.status).json({ error: unavailable.error, code: unavailable.code });
    }
    if (!user) return res.status(404).json({ error: "No active Athoo account was found with this identifier.", code: "ACCOUNT_NOT_FOUND" });

    // Check admin blacklist (phone or email)
    const blacklisted = await db.query.adminBlacklistTable.findFirst({
      where: and(
        eq(adminBlacklistTable.isActive, true),
        or(
          eq(adminBlacklistTable.value, normalizedPhone),
          eq(adminBlacklistTable.value, normalizedEmail)
        )
      ),
    });
    if (blacklisted) {
      res.status(403).json({ error: "This account has been suspended. Please contact support." });
      return;
    }

    if (!user.password) {
      res.status(401).json({
        error:
          "This account uses OTP login. Please sign in with your phone number and OTP instead.",
      });
      return;
    }

    const valid = await bcrypt.compare(password, user.password);

    if (!valid) {
      db.insert(loginHistoryTable).values({ id: generateId(), userId: user.id, phone: user.phone, email: user.email, role: user.role, method: "password", success: false, failReason: "Incorrect password", ipAddress: req.ip, userAgent: req.headers["user-agent"] || null }).catch(() => {});
      res.status(401).json({ error: "Incorrect password. Please try again." });
      return;
    }

    const userAgent = String(req.headers["user-agent"] || "");
    const seenDevice = await hasSeenDevice(user.id, userAgent);
    const session = await issueSession(user, req);
    const token = session.token;

    db.insert(loginHistoryTable).values({ id: generateId(), userId: user.id, phone: user.phone, email: user.email, role: user.role, method: "password", success: true, ipAddress: req.ip, userAgent: userAgent || null }).catch(() => {});
    if (!seenDevice) void queueNewDeviceEmail(user, { device: userAgent, ip: req.ip }).catch(() => undefined);

    return res.json({
      success: true,
      token,
      refreshToken: session.refreshToken,
      expiresInSeconds: session.expiresInSeconds,
      user: toSafeUser(user),
    });
  } catch (e) {
    logger.error({ err: e }, "login error");
    return res.status(500).json({ error: "Login failed" });
  }
});

// POST /auth/set-password — set or change password (authenticated)
router.post("/set-password", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { currentPassword, newPassword } = req.body as {
      currentPassword?: string;
      newPassword: string;
    };

    if (!newPassword || newPassword.length < 8) {
      res.status(400).json({ error: "Password must be at least 8 characters" });
      return;
    }

    const user = await db.query.usersTable.findFirst({
      where: eq(usersTable.id, req.user!.userId),
    });

    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    if (user.password) {
      if (!currentPassword) {
        res
          .status(400)
          .json({ error: "Current password is required to set a new password" });
        return;
      }

      const valid = await bcrypt.compare(currentPassword, user.password);

      if (!valid) {
        res.status(401).json({ error: "Current password is incorrect" });
        return;
      }
    }

    const hashed = await bcrypt.hash(newPassword, 10);

    await db
      .update(usersTable)
      .set({ password: hashed, updatedAt: new Date() })
      .where(eq(usersTable.id, req.user!.userId));
    await revokeAllUserSessions(req.user!.userId, "password_changed");
    void queuePasswordChangedEmail(user, "changed").catch((error) =>
      logger.warn({ err: error, userId: user.id }, "password changed email queue failed"),
    );

    res.json({ success: true, message: "Password set successfully. Please sign in again." });
  } catch (e) {
    logger.error({ err: e }, "set-password error");
    res.status(500).json({ error: "Failed to set password" });
  }
});
// ==
// FORGOT PASSWORD FLOW
// ==

// 1. Send reset OTP (accepts phone OR email as identifier)
router.post("/forgot-password/send-otp", async (req, res) => {
  try {
    const { phone, email, identifier } = req.body;
    const rawInput = String(identifier || phone || email || "").trim();

    if (!rawInput || rawInput.length < 3) {
      return res.status(400).json({ error: "A valid phone number or email address is required" });
    }

    const isEmail = rawInput.includes("@");
    let user;
    let normalizedPhone: string;

    if (isEmail) {
      const cleanedEmail = normalizeEmailAddress(rawInput);
      if (!cleanedEmail) {
        return res.status(400).json({ error: "Please enter a valid phone number or email address" });
      }
      const matchingUser = await db.query.usersTable.findFirst({
        where: and(normalizedEmailCondition(cleanedEmail), eq(usersTable.emailVerified, true)),
      });
      // Keep the response generic, but never deliver recovery codes to an
      // unverified email address.
      user = matchingUser;
      if (!user) {
        const digest = crypto.createHash("sha256").update(cleanedEmail).digest("hex");
        normalizedPhone = `000${(BigInt(`0x${digest.slice(0, 12)}`) % 10_000_000n).toString().padStart(7, "0")}`;
      } else {
        normalizedPhone = user.phone;
      }
    } else {
      normalizedPhone = cleanPhone(rawInput);
      if (normalizedPhone.length < 10) {
        return res.status(400).json({ error: "Please enter a valid phone number or email address" });
      }
      user = await db.query.usersTable.findFirst({
        where: eq(usersTable.phone, normalizedPhone),
      });
    }

    const code = generateOtp();
    const isDev = process.env.NODE_ENV === "development" && process.env.ALLOW_DEV_OTP_RESPONSE === "true";
    let emailSent = false;
    let whatsappSent = false;
    let smsSent = false;
    let deliveryChannel: string | null = null;
    let otpId: string | null = null;

    if (user) {
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
      await db
        .update(otpsTable)
        .set({ used: true })
        .where(and(
          eq(otpsTable.phone, normalizedPhone),
          eq(otpsTable.purpose, "password_reset"),
          eq(otpsTable.used, false),
        ));

      otpId = generateId();
      await db.insert(otpsTable).values({
        id: otpId,
        phone: normalizedPhone,
        code: hashOtp(normalizedPhone, code, "password_reset"),
        purpose: "password_reset",
        role: user.role === "provider" ? "provider" : "customer",
        attempts: 0,
        maxAttempts: OTP_MAX_ATTEMPTS,
        expiresAt,
        used: false,
      });

      if (isDev) {
        logger.info(`[auth-otp/reset] phone=${normalizedPhone} code=${code} (expires in 10m)`);
      }

      const otpDelivery = await deliverAuthenticationOtp({
        otpId,
        phone: normalizedPhone,
        code,
        purpose: "password_reset",
        role: user.role === "provider" ? "provider" : "customer",
        expiresMinutes: 10,
        email: user.emailVerified ? user.email : null,
        userId: user.id,
        userName: user.name,
      });
      whatsappSent = otpDelivery.whatsappSent;
      emailSent = otpDelivery.emailSent;
      smsSent = otpDelivery.smsSent;
      deliveryChannel = otpDelivery.deliveryChannel;

      if (!isDev && !otpDelivery.delivered && otpId) {
        await db.update(otpsTable).set({ used: true, invalidatedReason: "delivery_failed" }).where(eq(otpsTable.id, otpId));
        logger.warn(
          { otpId, userId: user.id },
          "password reset OTP could not be delivered through a production channel",
        );
      }
      else if (otpId) {
        await db.update(otpsTable).set({
          deliveryChannel: isDev && !otpDelivery.delivered ? "development" : deliveryChannel,
          deliveredAt: new Date(),
        }).where(eq(otpsTable.id, otpId));
      }
    }

    const maskedPhone = normalizedPhone.length >= 4
      ? "*".repeat(Math.max(0, normalizedPhone.length - 4)) + normalizedPhone.slice(-4)
      : "****";
    const challengeToken = signPurposeToken(
      { userId: `reset-challenge:${normalizedPhone}`, role: "reset", purpose: "password_reset_challenge" },
      "10m",
    );

    return res.json({
      success: true,
      challengeToken,
      // Delivery details are intentionally hidden outside development so this
      // endpoint cannot be used to discover whether an account exists.
      ...(isDev && user ? { code, maskedPhone, emailSent, whatsappSent, smsSent, deliveryChannel } : {}),
      message: "If an account matches those details, a reset OTP has been sent.",
    });
  } catch (e) {
    logger.error({ err: e }, "forgot send otp error");
    res.status(500).json({ error: "Failed to send OTP" });
    return;
  }
});

// 2. Verify reset OTP — marks OTP used and issues a short-lived signed reset token
router.post("/forgot-password/verify-otp", async (req, res) => {
  try {
    const { challengeToken, phone, code } = req.body as { challengeToken?: string; phone?: string; code?: string };

    if (!code || (!challengeToken && !phone)) {
      return res.status(400).json({ error: "Verification challenge and OTP are required" });
    }

    let normalizedPhone = "";
    if (challengeToken) {
      const challenge = verifyToken(challengeToken);
      if (
        !challenge ||
        challenge.tokenType !== "purpose" ||
        challenge.role !== "reset" ||
        challenge.purpose !== "password_reset_challenge" ||
        !String(challenge.userId || "").startsWith("reset-challenge:")
      ) {
        return res.status(400).json({ error: "Reset request is invalid or expired. Please start again." });
      }
      normalizedPhone = String(challenge.userId).slice("reset-challenge:".length);
    } else {
      // Backward compatibility for an older mobile build during rollout.
      normalizedPhone = cleanPhone(String(phone || ""));
    }

    const otp = await latestOtp(normalizedPhone, "password_reset");
    if (!otp || otp.used) {
      return res.status(400).json({ error: "Invalid or expired OTP", code: "OTP_INVALID" });
    }
    if (new Date(otp.expiresAt).getTime() <= Date.now()) {
      await db.update(otpsTable).set({ used: true, invalidatedReason: "expired" }).where(eq(otpsTable.id, otp.id));
      return res.status(400).json({ error: "The OTP has expired. Please request a new code.", code: "OTP_EXPIRED" });
    }
    const validCode = otpHashMatches(otp.code, hashOtp(normalizedPhone, code.trim(), "password_reset"));
    if (!validCode) {
      const attempts = (otp.attempts || 0) + 1;
      const exhausted = attempts >= (otp.maxAttempts || OTP_MAX_ATTEMPTS);
      await db.update(otpsTable).set({
        attempts,
        ...(exhausted ? { used: true, invalidatedReason: "attempt_limit" } : {}),
      }).where(eq(otpsTable.id, otp.id));
      return res.status(exhausted ? 429 : 400).json({
        error: exhausted ? "Too many incorrect attempts. Please request a new code." : "The OTP is incorrect.",
        code: exhausted ? "OTP_ATTEMPT_LIMIT" : "OTP_INCORRECT",
      });
    }

    await db.update(otpsTable).set({ used: true, invalidatedReason: "verified" }).where(eq(otpsTable.id, otp.id));

    // Issue a short-lived reset token — step 3 MUST present this to prove OTP was verified.
    // Without it, any caller who knows a phone number could skip to step 3.
    const resetToken = signPurposeToken({ userId: `reset:${normalizedPhone}`, role: "reset", purpose: "password_reset" }, "10m");

    res.json({ success: true, resetToken });
    return;
  } catch (e) {
    logger.error({ err: e }, "forgot verify otp error");
    res.status(500).json({ error: "Failed to verify OTP" });
    return;
  }
});

// 3. Reset password — requires the signed resetToken issued by step 2
router.post("/forgot-password/reset", async (req, res) => {
  try {
    const { resetToken, newPassword } = req.body;

    if (!resetToken || !newPassword || newPassword.length < 8) {
      return res.status(400).json({ error: "Valid reset token and password (min 8 chars) required" });
    }

    // Verify the reset token and extract phone — reject any caller without it
    const tokenPayload = verifyToken(resetToken);
    if (!tokenPayload || tokenPayload.tokenType !== "purpose" || tokenPayload.role !== "reset" || tokenPayload.purpose !== "password_reset") {
      return res.status(400).json({ error: "Reset token is invalid or expired. Please start over." });
    }
    const normalizedPhone = String(tokenPayload.userId || "").replace("reset:", "");
    if (!normalizedPhone) {
      return res.status(400).json({ error: "Invalid reset token payload" });
    }

    const user = await db.query.usersTable.findFirst({
      where: eq(usersTable.phone, normalizedPhone),
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const hashed = await bcrypt.hash(newPassword, 10);

    await db
      .update(usersTable)
      .set({ password: hashed, updatedAt: new Date() })
      .where(eq(usersTable.id, user.id));
    await revokeAllUserSessions(user.id, "password_reset");
    void queuePasswordChangedEmail(user, "reset").catch((error) =>
      logger.warn({ err: error, userId: user.id }, "password reset confirmation email queue failed"),
    );

    res.json({ success: true, message: "Password reset successful" });
    return;
  } catch (e) {
    logger.error({ err: e }, "reset password error");
    res.status(500).json({ error: "Failed to reset password" });
    return;
  }
});
// Refresh an access token. Refresh tokens rotate on every successful use.
router.post("/refresh", async (req, res) => {
  const refreshToken = String(req.body?.refreshToken || "");
  if (!refreshToken) return res.status(400).json({ error: "Refresh token required" });
  const result = await rotateSession(refreshToken, { ipAddress: req.ip, userAgent: req.headers["user-agent"] || null });
  if (!result) return res.status(401).json({ error: "Refresh session is invalid or expired" });
  return res.json({ success: true, token: result.token, refreshToken: result.refreshToken, expiresInSeconds: result.expiresInSeconds, user: toSafeUser(result.user) });
});

router.post("/logout", requireAuth, async (req: AuthRequest, res: Response) => {
  await revokeSession(req.user!.sessionId!, "logout");
  return res.json({ success: true });
});

router.post("/logout-all", requireAuth, async (req: AuthRequest, res: Response) => {
  await revokeAllUserSessions(req.user!.userId, "logout_all");
  return res.json({ success: true });
});

// ==
// SWITCH ROLE (Customer <-> Provider)
// ==
router.post("/switch-role", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;

    const user = await db.query.usersTable.findFirst({
      where: eq(usersTable.id, userId),
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const requestedRole = cleanRole((req.body as { role?: string } | undefined)?.role);
    const newRole = requestedRole || (user.role === "customer" ? "provider" : "customer");

    if (newRole === user.role) {
      const token = signAccessToken(user, req.user!.sessionId!);
      return res.json({ success: true, token, user: toSafeUser(user) });
    }

    if (newRole === "provider") {
      const hasProviderProfile =
        (Array.isArray(user.services) && user.services.length > 0) ||
        Boolean(user.bio && user.bio.trim()) ||
        Boolean(user.experience && user.experience.trim()) ||
        typeof user.ratePerHour === "number";

      if (!hasProviderProfile) {
        return res.status(400).json({
          error: "PROVIDER_PROFILE_REQUIRED",
          message: "You do not have a provider account yet. Please complete provider registration first.",
        });
      }
    }

    const updateFields: Record<string, unknown> = {
      role: newRole,
      updatedAt: new Date(),
    };

    // Security: if switching customer → provider, reset verificationStatus to "pending".
    // This prevents a previously-approved provider from toggling roles to skip re-verification.
    if (newRole === "provider" && user.role !== "provider") {
      updateFields.verificationStatus = "pending";
    }

    await db
      .update(usersTable)
      .set(updateFields as any)
      .where(eq(usersTable.id, userId));

    const updatedUser = await db.query.usersTable.findFirst({
      where: eq(usersTable.id, userId),
    });

    const token = signAccessToken(updatedUser, req.user!.sessionId!);

    return res.json({
      success: true,
      token,
      user: toSafeUser(updatedUser),
    });
  } catch (e) {
    logger.error({ err: e }, "switch role error");
    return res.status(500).json({ error: "Failed to switch role" });
  }
});

export default router;

