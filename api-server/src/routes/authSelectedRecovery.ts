import { Router } from "express";
import crypto from "crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { adminBlacklistTable, otpsTable, usersTable } from "@workspace/db/schema";
import { cleanOtpPurpose, type OtpPurpose } from "../lib/authOtpPolicy";
import { normalizeEmailAddress } from "../lib/emailAuth";
import { logger } from "../lib/logger";
import { deliverAuthenticationOtp } from "../lib/otpDelivery";
import { signPurposeToken } from "../middlewares/auth";

const router = Router();

const OTP_TTL_SECONDS = Math.max(120, Math.min(900, Number(process.env.OTP_TTL_SECONDS || 600)));
const OTP_RESEND_COOLDOWN_SECONDS = Math.max(30, Math.min(300, Number(process.env.OTP_RESEND_COOLDOWN_SECONDS || 45)));
const OTP_MAX_ATTEMPTS = Math.max(3, Math.min(10, Number(process.env.OTP_MAX_ATTEMPTS || 5)));

function generateOtp(): string {
  return crypto.randomInt(1000, 10000).toString();
}

function generateId(): string {
  return crypto.randomUUID();
}

function hashOtp(phone: string, code: string, purpose: OtpPurpose): string {
  const secret = process.env.OTP_HASH_SECRET?.trim() || process.env.JWT_SECRET?.trim();
  if (!secret) throw new Error("OTP hash secret is not configured");
  return crypto.createHmac("sha256", secret).update(`${purpose}:${phone}:${code}`).digest("hex");
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

function normalizedEmailCondition(email: string) {
  return sql`lower(trim(${usersTable.email})) = ${email}`;
}

async function isAuthIdentityBlacklisted(phone: string, email?: string | null): Promise<boolean> {
  const identities = [phone, email].filter(Boolean) as string[];
  for (const value of identities) {
    const row = await db.query.adminBlacklistTable.findFirst({
      where: and(eq(adminBlacklistTable.isActive, true), eq(adminBlacklistTable.value, value)),
    });
    if (row) return true;
  }
  return false;
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

function maskedResetPhone(normalizedPhone: string): string {
  return normalizedPhone.length >= 4
    ? "*".repeat(Math.max(0, normalizedPhone.length - 4)) + normalizedPhone.slice(-4)
    : "****";
}

function syntheticPhoneForEmail(email: string): string {
  const digest = crypto.createHash("sha256").update(email).digest("hex");
  return `000${(BigInt(`0x${digest.slice(0, 12)}`) % 10_000_000n).toString().padStart(7, "0")}`;
}

// Must be mounted before authRouter. This preserves the existing verify/reset
// routes, while fixing delivery selection for the password-reset send step.
router.post("/forgot-password/send-otp", async (req, res) => {
  try {
    const { phone, email, identifier, role: rawRole } = req.body;
    const rawInput = String(identifier || phone || email || "").trim();

    if (!rawInput || rawInput.length < 3) {
      return res.status(400).json({ error: "A valid phone number or email address is required" });
    }

    const expectedRole = rawRole === undefined ? null : cleanRole(String(rawRole));
    if (rawRole !== undefined && !expectedRole) {
      return res.status(400).json({
        error: "Select Customer or Provider before requesting a password reset.",
        code: "ROLE_REQUIRED",
      });
    }

    const selectedContact = rawInput.includes("@") ? "email" : "mobile";
    let user: typeof usersTable.$inferSelect | undefined;
    let normalizedPhone: string;

    if (selectedContact === "email") {
      const cleanedEmail = normalizeEmailAddress(rawInput);
      if (!cleanedEmail) {
        return res.status(400).json({ error: "Please enter a valid phone number or email address" });
      }
      user = await db.query.usersTable.findFirst({
        where: and(
          normalizedEmailCondition(cleanedEmail),
          eq(usersTable.emailVerified, true),
          expectedRole ? eq(usersTable.role, expectedRole) : undefined,
        ),
      });
      normalizedPhone = user?.phone || syntheticPhoneForEmail(cleanedEmail);
    } else {
      normalizedPhone = cleanPhone(rawInput);
      if (normalizedPhone.length < 10) {
        return res.status(400).json({ error: "Please enter a valid phone number or email address" });
      }
      user = await db.query.usersTable.findFirst({
        where: and(
          eq(usersTable.phone, normalizedPhone),
          expectedRole ? eq(usersTable.role, expectedRole) : undefined,
        ),
      });
    }

    const code = generateOtp();
    const isDev = process.env.NODE_ENV === "development" && process.env.ALLOW_DEV_OTP_RESPONSE === "true";
    let emailSent = false;
    let whatsappSent = false;
    let smsSent = false;
    let deliveryChannel: string | null = null;
    let otpId: string | null = null;
    let shouldIssueOtp = Boolean(user);

    if (user) {
      if (await isAuthIdentityBlacklisted(user.phone, user.email)) {
        return res.status(403).json({ error: "This account is suspended. Please contact Athoo Support.", code: "ACCOUNT_SUSPENDED" });
      }

      const userRole = user.role === "provider" ? "provider" : "customer";
      const previousOtp = await latestOtp(normalizedPhone, "password_reset", userRole);
      const previousCreatedAt = previousOtp?.createdAt ? new Date(previousOtp.createdAt).getTime() : 0;
      const remainingMs = previousCreatedAt + OTP_RESEND_COOLDOWN_SECONDS * 1000 - Date.now();
      if (previousOtp && !previousOtp.used && remainingMs > 0) shouldIssueOtp = false;
    }

    if (user && shouldIssueOtp) {
      const expiresAt = new Date(Date.now() + OTP_TTL_SECONDS * 1000);
      await db
        .update(otpsTable)
        .set({ used: true })
        .where(and(
          eq(otpsTable.phone, normalizedPhone),
          eq(otpsTable.purpose, "password_reset"),
          eq(otpsTable.used, false),
        ));

      otpId = generateId();
      const userRole = user.role === "provider" ? "provider" : "customer";
      await db.insert(otpsTable).values({
        id: otpId,
        phone: normalizedPhone,
        code: hashOtp(normalizedPhone, code, cleanOtpPurpose("password_reset")!),
        purpose: "password_reset",
        role: userRole,
        attempts: 0,
        maxAttempts: OTP_MAX_ATTEMPTS,
        expiresAt,
        used: false,
      });

      if (isDev) logger.info(`[auth-otp/reset] phone=${normalizedPhone} code=${code} (expires in 10m)`);

      const otpDelivery = await deliverAuthenticationOtp({
        otpId,
        phone: normalizedPhone,
        code,
        purpose: "password_reset",
        role: userRole,
        expiresMinutes: Math.ceil(OTP_TTL_SECONDS / 60),
        email: selectedContact === "email" && user.emailVerified ? user.email : null,
        userId: user.id,
        userName: user.name,
        deliveryChannels: selectedContact === "email"
          ? ["email"]
          : ["evolution_whatsapp", "whatsapp_cloud", "http_sms"],
      });

      whatsappSent = otpDelivery.whatsappSent;
      emailSent = otpDelivery.emailSent;
      smsSent = otpDelivery.smsSent;
      deliveryChannel = otpDelivery.deliveryChannel;

      if (!isDev && !otpDelivery.delivered && otpId) {
        await db.update(otpsTable).set({ used: true, invalidatedReason: "delivery_failed" }).where(eq(otpsTable.id, otpId));
        logger.warn({ otpId, userId: user.id, selectedContact }, "password reset OTP could not be delivered through the selected channel");
      } else if (otpId) {
        await db.update(otpsTable).set({
          deliveryChannel: isDev && !otpDelivery.delivered ? "development" : deliveryChannel,
          deliveredAt: new Date(),
        }).where(eq(otpsTable.id, otpId));
      }
    }

    const challengeToken = signPurposeToken(
      { userId: `reset-challenge:${normalizedPhone}`, role: "reset", purpose: "password_reset_challenge" },
      "10m",
    );

    return res.json({
      success: true,
      challengeToken,
      expiresInSeconds: OTP_TTL_SECONDS,
      resendAfterSeconds: OTP_RESEND_COOLDOWN_SECONDS,
      ...(isDev && user ? { code, maskedPhone: maskedResetPhone(normalizedPhone), emailSent, whatsappSent, smsSent, deliveryChannel } : {}),
      message: "If an account matches those details, a reset OTP has been sent.",
    });
  } catch (e) {
    logger.error({ err: e }, "forgot send otp error");
    res.status(500).json({ error: "Failed to send OTP" });
    return;
  }
});

export default router;
