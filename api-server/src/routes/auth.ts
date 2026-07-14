import { Router, type Response } from "express";
import { logger } from "../lib/logger";
import { db } from "@workspace/db";
import { usersTable, otpsTable, loginHistoryTable, adminBlacklistTable } from "@workspace/db/schema";
import { eq, and, gt, or, desc } from "drizzle-orm";
import { signAccessToken, signPurposeToken, verifyToken, requireAuth, type AuthRequest } from "../middlewares/auth";
import { createSession, rotateSession, revokeSession, revokeAllUserSessions } from "../lib/session";
import { getPlatformSettings } from "../lib/admin";
import { LEGAL_VERSION } from "../lib/legal";
import { isOwnedUploadObjectPath, normalizeStoredObjectPath } from "../lib/storageSecurity";
import { cleanupReplacedOwnedMedia } from "../lib/mediaLifecycle";
// Rate limiting is handled globally by express-rate-limit in app.ts
import { sendEmail, renderOtpEmail } from "../lib/email";
import * as bcrypt from "bcryptjs";
import crypto from "crypto";

const router = Router();

function generateOtp(): string {
  return crypto.randomInt(1000, 10000).toString();
}

function hashOtp(phone: string, code: string): string {
  const secret = process.env.OTP_HASH_SECRET?.trim() || process.env.JWT_SECRET?.trim();
  if (!secret) throw new Error("OTP hash secret is not configured");
  return crypto.createHmac("sha256", secret).update(`${phone}:${code}`).digest("hex");
}

function generateId(): string {
  return crypto.randomUUID();
}

async function issueSession(user: any, req: any) {
  return createSession(user, { ipAddress: req.ip ?? null, userAgent: req.headers?.["user-agent"] ?? null });
}

async function sendWhatsAppOTP(phone: string, code: string): Promise<boolean> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN?.trim();
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
  const configuredVersion = process.env.WHATSAPP_GRAPH_API_VERSION?.trim() || "v25.0";
  const graphApiVersion = /^v\d+\.\d+$/.test(configuredVersion) ? configuredVersion : "v25.0";
  if (!token || !phoneNumberId) return false;
  const waPhone = phone.startsWith("0") ? `92${phone.slice(1)}` : phone.replace(/^\+/, "");
  try {
    const resp = await fetch(`https://graph.facebook.com/${graphApiVersion}/${phoneNumberId}/messages`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: waPhone,
        type: "template",
        template: {
          name: "otp_verification",
          language: { code: "en" },
          components: [{ type: "body", parameters: [{ type: "text", text: code }] }],
        },
      }),
    });
    return resp.ok;
  } catch {
    return false;
  }
}

function cleanPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");

  if (!digits) return "";
  if (digits.startsWith("92") && digits.length === 12) return `0${digits.slice(2)}`;
  if (digits.startsWith("3") && digits.length === 10) return `0${digits}`;
  if (digits.startsWith("0") && digits.length === 11) return digits;

  return phone.trim();
}

function cleanRole(role?: string): "customer" | "provider" | null {
  if (role === "customer" || role === "provider") return role;
  return null;
}

function cleanEmail(email?: string): string | null {
  if (!email) return null;
  const v = email.trim().toLowerCase();
  return v ? v : null;
}

function toSafeUser<T extends Record<string, any>>(user: T | null | undefined) {
  if (!user) return null;
  const { password, adminFailedLoginCount, adminLockedUntil, ...safeUser } = user;
  return safeUser;
}

router.post("/purpose-token", requireAuth, async (req: AuthRequest, res: Response) => {
  const purpose = String(req.body?.purpose || "");
  if (!new Set(["realtime", "object-read"]).has(purpose)) return res.status(400).json({ error: "Unsupported token purpose" });
  const token = signPurposeToken({ userId: req.user!.userId, role: req.user!.role, sessionId: req.user!.sessionId, purpose, adminRole: req.user!.adminRole, adminPermissions: req.user!.adminPermissions }, "2m");
  return res.json({ token, expiresInSeconds: 120 });
});

router.post("/send-otp", async (req, res) => {
  try {
    const { phone, email } = req.body as { phone?: string; email?: string };

    if (!phone || phone.trim().length < 10) {
      res.status(400).json({ error: "Valid phone number required" });
      return;
    }

    const normalizedPhone = cleanPhone(phone);
    const normalizedEmail = cleanEmail(email);
    const code = generateOtp();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await db
      .update(otpsTable)
      .set({ used: true })
      .where(and(eq(otpsTable.phone, normalizedPhone), eq(otpsTable.used, false)));

    const otpId = generateId();
    const insertedOtp = await db
      .insert(otpsTable)
      .values({
        id: otpId,
        phone: normalizedPhone,
        code: hashOtp(normalizedPhone, code),
        expiresAt,
        used: false,
      })
      .returning({
        id: otpsTable.id,
        phone: otpsTable.phone,
        expiresAt: otpsTable.expiresAt,
        createdAt: otpsTable.createdAt,
      });

    const persistedOtp = insertedOtp[0];
    if (!persistedOtp || persistedOtp.id !== otpId) {
      throw new Error("OTP persistence verification failed");
    }

    logger.info(
      {
        otpId: persistedOtp.id,
        phone: persistedOtp.phone,
        createdAt: persistedOtp.createdAt,
        expiresAt: persistedOtp.expiresAt,
      },
      "authentication OTP persisted",
    );

    const isDev = process.env.NODE_ENV === "development" && process.env.ALLOW_DEV_OTP_RESPONSE === "true";
    if (isDev) {
      // Auth OTPs are intentionally surfaced via the console (and the response
      // body) when no SMS provider is configured, so the system stays usable
      // out-of-the-box for local + self-hosted deployments.
      logger.info(`[auth-otp] phone=${normalizedPhone} code=${code} (expires in 10m)`);
    }

    // Deliver through configured channels. Production must never report success
    // when no channel actually delivered the verification code.
    const waSent = await sendWhatsAppOTP(normalizedPhone, code).catch(() => false);
    if (waSent) logger.info({ phone: normalizedPhone }, "WhatsApp OTP sent");

    let emailChannel: "smtp" | "console" | null = null;
    const targetEmail = normalizedEmail || (await db.query.usersTable.findFirst({
      where: eq(usersTable.phone, normalizedPhone),
    }))?.email || null;
    if (targetEmail) {
      const t = renderOtpEmail(code, "Verification");
      const r = await sendEmail({ to: targetEmail, subject: t.subject, html: t.html, text: t.text });
      emailChannel = r.channel;
    }

    const emailSent = emailChannel === "smtp";
    const delivered = waSent || emailSent;

    if (!isDev && !delivered) {
      // The row is kept for auditability but cannot be used after delivery fails.
      await db.update(otpsTable).set({ used: true }).where(eq(otpsTable.id, otpId));
      logger.warn(
        { otpId, phone: normalizedPhone, hasEmail: Boolean(targetEmail) },
        "OTP persisted but no production delivery channel succeeded",
      );
      return res.status(503).json({
        error: "Verification code delivery is temporarily unavailable. Please try again shortly.",
        code: "OTP_DELIVERY_UNAVAILABLE",
      });
    }

    const productionMessage = waSent && emailSent
      ? "OTP sent to your WhatsApp and email"
      : waSent
        ? "OTP sent to your WhatsApp"
        : "OTP sent to your email";

    return res.json({
      success: true,
      emailSent,
      whatsappSent: waSent,
      ...(isDev
        ? { code, message: "OTP generated for local development" }
        : { message: productionMessage }),
    });
  } catch (e) {
    logger.error({ err: e }, "send-otp error");
    return res.status(500).json({ error: "Failed to send OTP" });
  }
});

router.post("/verify-otp", async (req, res) => {
  try {
    const { phone, code } = req.body as { phone: string; code: string };

    if (!phone || !code) {
      res.status(400).json({ error: "Phone and OTP required" });
      return;
    }

    const normalizedPhone = cleanPhone(phone);

    const otp = await db.query.otpsTable.findFirst({
      where: and(
        eq(otpsTable.phone, normalizedPhone),
        eq(otpsTable.code, hashOtp(normalizedPhone, code.trim())),
        eq(otpsTable.used, false),
        gt(otpsTable.expiresAt, new Date())
      ),
      orderBy: desc(otpsTable.createdAt),
    });

    if (!otp) {
      res.status(400).json({ error: "Invalid or expired OTP" });
      return;
    }

    await db
      .update(otpsTable)
      .set({ used: true })
      .where(eq(otpsTable.id, otp.id));

    const user = await db.query.usersTable.findFirst({
      where: eq(usersTable.phone, normalizedPhone),
    });

    if (user) {
      if (user.isDeactivated) {
        res
          .status(403)
          .json({ error: "This account has been deactivated. Please contact support." });
        return;
      }

      const session = await issueSession(user, req);
      const token = session.token;
      db.insert(loginHistoryTable).values({ id: generateId(), userId: user.id, phone: user.phone, email: user.email, role: user.role, method: "otp", success: true, ipAddress: req.ip, userAgent: req.headers["user-agent"] || null }).catch(() => {});
      res.json({
        success: true,
        token,
        refreshToken: session.refreshToken,
        expiresInSeconds: session.expiresInSeconds,
        user: toSafeUser(user),
        isNewUser: false,
      });
      return;
    }

    res.json({
      success: true,
      token: null,
      user: null,
      isNewUser: true,
    });
  } catch (e) {
    logger.error({ err: e }, "verify-otp error");
    res.status(500).json({ error: "Failed to verify OTP" });
  }
});

router.post("/register", async (req, res) => {
  try {
    const { name, phone, email, role, services, fatherName, cnicNumber, experience, location, ratePerHour, password, termsAccepted, privacyAccepted } = req.body as {
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
        where: eq(usersTable.email, normalizedEmail),
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
    };

    await db.insert(usersTable).values(newUser);

    const session = await issueSession(newUser, req);
    const token = session.token;

    res.json({
      success: true,
      token,
      refreshToken: session.refreshToken,
      expiresInSeconds: session.expiresInSeconds,
      user: toSafeUser(newUser),
    });
  } catch (e) {
    logger.error({ err: e }, "register error");
    res.status(500).json({ error: "Failed to register" });
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
      where: or(eq(usersTable.phone, normalizedPhone), eq(usersTable.phone, identifier), eq(usersTable.email, normalizedEmail)),
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
    const { identifier, password } = req.body as {
      identifier: string;
      password: string;
    };

    if (!identifier || !password) {
      res.status(400).json({ error: "Email/phone and password are required" });
      return;
    }

    const normalizedIdentifier = identifier.trim();
    const normalizedPhone = cleanPhone(normalizedIdentifier);
    const normalizedEmail = normalizedIdentifier.toLowerCase();

    const user = await db.query.usersTable.findFirst({
      where: or(
        eq(usersTable.phone, normalizedPhone),
        eq(usersTable.phone, normalizedIdentifier),
        eq(usersTable.email, normalizedEmail)
      ),
    });

    if (!user) {
      res.status(401).json({ error: "No account found with this email or phone number" });
      return;
    }

    if (user.isDeactivated) {
      res
        .status(403)
        .json({ error: "This account has been deactivated. Please contact support." });
      return;
    }

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

    const session = await issueSession(user, req);
      const token = session.token;

    db.insert(loginHistoryTable).values({ id: generateId(), userId: user.id, phone: user.phone, email: user.email, role: user.role, method: "password", success: true, ipAddress: req.ip, userAgent: req.headers["user-agent"] || null }).catch(() => {});

    res.json({
      success: true,
      token,
      refreshToken: session.refreshToken,
      expiresInSeconds: session.expiresInSeconds,
      user: toSafeUser(user),
    });
  } catch (e) {
    logger.error({ err: e }, "login error");
    res.status(500).json({ error: "Login failed" });
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
      const cleanedEmail = rawInput.toLowerCase();
      user = await db.query.usersTable.findFirst({
        where: eq(usersTable.email, cleanedEmail),
      });
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
    let emailChannel: "smtp" | "console" | null = null;
    let whatsappSent = false;
    let otpId: string | null = null;

    if (user) {
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
      await db
        .update(otpsTable)
        .set({ used: true })
        .where(and(eq(otpsTable.phone, normalizedPhone), eq(otpsTable.used, false)));

      otpId = generateId();
      await db.insert(otpsTable).values({
        id: otpId,
        phone: normalizedPhone,
        code: hashOtp(normalizedPhone, code),
        expiresAt,
        used: false,
      });

      if (isDev) {
        logger.info(`[auth-otp/reset] phone=${normalizedPhone} code=${code} (expires in 10m)`);
      }

      whatsappSent = await sendWhatsAppOTP(normalizedPhone, code).catch(() => false);

      if (user.email) {
        const t = renderOtpEmail(code, "Password reset");
        const r = await sendEmail({ to: user.email, subject: t.subject, html: t.html, text: t.text });
        emailChannel = r.channel;
      }

      if (!isDev && !whatsappSent && emailChannel !== "smtp" && otpId) {
        await db.update(otpsTable).set({ used: true }).where(eq(otpsTable.id, otpId));
        logger.warn(
          { otpId, userId: user.id },
          "password reset OTP could not be delivered through a production channel",
        );
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
      maskedPhone,
      emailSent: emailChannel === "smtp",
      whatsappSent,
      ...(isDev && user ? { code } : {}),
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

    const otp = await db.query.otpsTable.findFirst({
      where: and(
        eq(otpsTable.phone, normalizedPhone),
        eq(otpsTable.code, hashOtp(normalizedPhone, code.trim())),
        eq(otpsTable.used, false),
        gt(otpsTable.expiresAt, new Date())
      ),
      orderBy: desc(otpsTable.createdAt),
    });

    if (!otp) {
      return res.status(400).json({ error: "Invalid or expired OTP" });
    }

    await db
      .update(otpsTable)
      .set({ used: true })
      .where(eq(otpsTable.id, otp.id));

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

