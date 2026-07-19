import { revokeAllUserSessions } from "../lib/session";
import { normalizeEmailAddress, queuePasswordChangedEmail, sendEmailChallenge, verifyEmailChallenge } from "../lib/emailAuth";
import { queueEmail } from "../lib/emailDelivery";
import { notifyUser } from "../lib/notifications";
import { emitToRole, emitToUser } from "../lib/eventBus";
import { Router } from "express";
import { logger } from "../lib/logger";
import crypto from "crypto";
import * as bcrypt from "bcryptjs";
import { db } from "@workspace/db";
import { isOwnedUploadObjectPath, normalizeStoredObjectPath } from "../lib/storageSecurity";
import { cleanupReplacedOwnedMedia } from "../lib/mediaLifecycle";
import { createAdminNotification } from "../lib/adminNotifications";
import {
  usersTable,
  accountDeletionRequestsTable,
  phoneChangeRequestsTable,
  serviceAddRequestsTable,
  serviceCategoriesTable,
  auditLogTable,
} from "@workspace/db/schema";
import { and, desc, eq, gt, ne, sql } from "drizzle-orm";
import {
  requireAuth,
  requireAuthAllowDeactivated,
  requireAdmin,
  requirePermission,
  type AuthRequest,
} from "../middlewares/auth";

const router = Router();
const id = () => crypto.randomUUID();
const otp = () => crypto.randomInt(100000, 1000000).toString();

// Endpoints that must remain reachable for soft-deactivated / pending-deletion users
router.post("/reactivate", requireAuthAllowDeactivated, async (req: AuthRequest, res) => {
  const user = await db.query.usersTable.findFirst({ where: eq(usersTable.id, req.user!.userId) });
  await db
    .update(usersTable)
    .set({ isDeactivated: false, accountStatus: "active", deletionScheduledAt: null, updatedAt: new Date() })
    .where(eq(usersTable.id, req.user!.userId));
  if (user?.email) {
    void queueEmail({
      userId: user.id,
      to: user.email,
      templateKey: "account_status",
      category: "security",
      dedupeKey: `account-reactivated:${user.id}:${Date.now()}`,
      variables: { name: user.name, status: "active", reason: "Your account was reactivated successfully.", category: "security" },
    }).catch(() => undefined);
  }
  return res.json({ success: true });
});

router.post("/delete-request/cancel", requireAuthAllowDeactivated, async (req: AuthRequest, res) => {
  try {
    const pending = await db.query.accountDeletionRequestsTable.findFirst({
      where: and(
        eq(accountDeletionRequestsTable.userId, req.user!.userId),
        eq(accountDeletionRequestsTable.status, "pending"),
      ),
    });
    if (pending) {
      await db
        .update(accountDeletionRequestsTable)
        .set({ status: "cancelled", cancelledAt: new Date(), updatedAt: new Date() })
        .where(eq(accountDeletionRequestsTable.id, pending.id));
    }
    await db
      .update(usersTable)
      .set({
        accountStatus: "active",
        deletionScheduledAt: null,
        isDeactivated: false,
        updatedAt: new Date(),
      })
      .where(eq(usersTable.id, req.user!.userId));
    const user = await db.query.usersTable.findFirst({ where: eq(usersTable.id, req.user!.userId) });
    if (user?.email) {
      void queueEmail({
        userId: user.id,
        to: user.email,
        templateKey: "account_status",
        category: "security",
        dedupeKey: `account-deletion-cancelled:${user.id}:${Date.now()}`,
        variables: { name: user.name, status: "active", reason: "Your account deletion request was cancelled.", category: "security" },
      }).catch(() => undefined);
    }
    return res.json({ success: true });
  } catch (e) {
    logger.error({ err: e }, "account.cancel-delete error");
    return res.status(500).json({ error: "Failed to cancel deletion" });
  }
});

router.use(requireAuth);

// PROFILE — get current user profile
router.get("/profile", async (req: AuthRequest, res) => {
  try {
    const user = await db.query.usersTable.findFirst({ where: eq(usersTable.id, req.user!.userId) });
    if (!user) return res.status(404).json({ error: "User not found" });
    const { password, ...safe } = user as any;
    return res.json({ user: safe });
  } catch (e) {
    logger.error({ err: e }, "account.profile.get error");
    return res.status(500).json({ error: "Failed to load profile" });
  }
});

// PROFILE — update editable fields
router.patch("/profile", async (req: AuthRequest, res) => {
  try {
    const user = await db.query.usersTable.findFirst({ where: eq(usersTable.id, req.user!.userId) });
    if (!user) return res.status(404).json({ error: "User not found" });
    const body = req.body ?? {};
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (body.name !== undefined) {
      const name = String(body.name).trim();
      if (name.length < 2 || name.length > 80) return res.status(400).json({ error: "Name must be between 2 and 80 characters" });
      patch.name = name;
    }
    if (body.bio !== undefined) {
      const bio = String(body.bio ?? "").trim();
      if (bio.length > 500) return res.status(400).json({ error: "Bio must be 500 characters or fewer" });
      patch.bio = bio || null;
    }
    if (body.experience !== undefined) {
      if (user.role !== "provider") return res.status(403).json({ error: "Provider account required" });
      const experience = String(body.experience ?? "").trim();
      if (experience.length > 120) return res.status(400).json({ error: "Experience must be 120 characters or fewer" });
      patch.experience = experience || null;
    }
    if (body.location !== undefined) {
      const location = String(body.location ?? "").trim();
      if (location.length > 160) return res.status(400).json({ error: "Location must be 160 characters or fewer" });
      patch.location = location || null;
    }
    if (body.profileImage !== undefined) {
      const profileImage = normalizeStoredObjectPath(body.profileImage);
      if (profileImage && !isOwnedUploadObjectPath(profileImage, user.id, ["shared", "private"])) return res.status(400).json({ error: "Profile photo must be uploaded through your Athoo account" });
      patch.profileImage = profileImage || null;
    }
    if (body.profileColor !== undefined) {
      const color = String(body.profileColor || "").trim();
      if (color && !/^#[0-9a-f]{6}$/i.test(color)) return res.status(400).json({ error: "Invalid profile color" });
      patch.profileColor = color || null;
    }
    if (body.language === "en" || body.language === "ur") patch.language = body.language;
    const forbidden = ["fatherName", "cnicNumber", "email", "phone", "role", "services", "ratePerHour", "isAvailable", "maxTravelDistanceKm", "verificationStatus", "isVerified", "biometricEnabled"];
    const attempted = forbidden.filter((field) => body[field] !== undefined);
    if (attempted.length) return res.status(403).json({ error: `Profile field changes require the approved workflow: ${attempted.join(", ")}` });
    if (Object.keys(patch).length === 1) return res.status(400).json({ error: "No valid fields to update" });
    const [updated] = await db.update(usersTable).set(patch).where(eq(usersTable.id, user.id)).returning();
    if (body.profileImage !== undefined) cleanupReplacedOwnedMedia(user.profileImage, updated.profileImage, user.id);
    const { password, ...safe } = updated as any;
    return res.json({ user: safe });
  } catch (e) {
    logger.error({ err: e }, "account.profile error");
    return res.status(500).json({ error: "Failed to update profile" });
  }
});

// PASSWORD — change with old-password verification
router.post("/password", async (req: AuthRequest, res) => {
  try {
    const { oldPassword, newPassword } = req.body ?? {};
    if (!newPassword || String(newPassword).length < 8) {
      return res.status(400).json({ error: "New password must be at least 8 characters" });
    }
    const user = await db.query.usersTable.findFirst({ where: eq(usersTable.id, req.user!.userId) });
    if (!user) return res.status(404).json({ error: "User not found" });
    if (user.password) {
      const ok = await bcrypt.compare(String(oldPassword ?? ""), user.password);
      if (!ok) return res.status(401).json({ error: "Old password is incorrect" });
    }
    const hashed = await bcrypt.hash(String(newPassword), 10);
    await db.update(usersTable).set({ password: hashed, biometricEnabled: false, updatedAt: new Date() }).where(eq(usersTable.id, user.id));
    await revokeAllUserSessions(user.id, "password_changed");
    void queuePasswordChangedEmail(user, "changed").catch(() => undefined);
    return res.json({ success: true });
  } catch (e) {
    logger.error({ err: e }, "account.password error");
    return res.status(500).json({ error: "Failed to change password" });
  }
});

// DEACTIVATE — temporary
router.post("/deactivate", async (req: AuthRequest, res) => {
  try {
    const { password } = req.body ?? {};
    const user = await db.query.usersTable.findFirst({ where: eq(usersTable.id, req.user!.userId) });
    if (!user) return res.status(404).json({ error: "User not found" });
    if (user.password && password !== undefined) {
      const ok = await bcrypt.compare(String(password), user.password);
      if (!ok) return res.status(401).json({ error: "Password is incorrect" });
    }
    await db
      .update(usersTable)
      .set({ isDeactivated: true, accountStatus: "deactivated", updatedAt: new Date() })
      .where(eq(usersTable.id, user.id));
    await revokeAllUserSessions(user.id, "account_deactivated");
    if (user.email) {
      void queueEmail({
        userId: user.id,
        to: user.email,
        templateKey: "account_status",
        category: "security",
        dedupeKey: `account-deactivated:${user.id}:${Date.now()}`,
        variables: { name: user.name, status: "deactivated", reason: "Your account was temporarily deactivated.", category: "security" },
      }).catch(() => undefined);
    }
    return res.json({ success: true });
  } catch (e) {
    logger.error({ err: e }, "account.deactivate error");
    return res.status(500).json({ error: "Failed to deactivate account" });
  }
});

// DELETION — schedules deletion 7 days out, can be cancelled until then
router.post("/delete-request", async (req: AuthRequest, res) => {
  try {
    const { password, reason } = req.body ?? {};
    const user = await db.query.usersTable.findFirst({ where: eq(usersTable.id, req.user!.userId) });
    if (!user) return res.status(404).json({ error: "User not found" });
    if (user.password && password !== undefined) {
      const ok = await bcrypt.compare(String(password), user.password);
      if (!ok) return res.status(401).json({ error: "Password is incorrect" });
    }
    const existingPending = await db.query.accountDeletionRequestsTable.findFirst({
      where: and(
        eq(accountDeletionRequestsTable.userId, user.id),
        eq(accountDeletionRequestsTable.status, "pending"),
      ),
      orderBy: desc(accountDeletionRequestsTable.createdAt),
    });
    if (existingPending) {
      return res.json({ success: true, scheduledDeleteAt: existingPending.scheduledDeleteAt, duplicate: true });
    }
    const scheduledDeleteAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const newId = id();
    await db.insert(accountDeletionRequestsTable).values({
      id: newId,
      userId: user.id,
      reason: reason ? String(reason) : null,
      scheduledDeleteAt,
      status: "pending",
    });
    await db
      .update(usersTable)
      .set({
        accountStatus: "pending_deletion",
        deletionScheduledAt: scheduledDeleteAt,
        isDeactivated: true,
        updatedAt: new Date(),
      })
      .where(eq(usersTable.id, user.id));
    await revokeAllUserSessions(user.id, "account_deletion_requested");
    await createAdminNotification({
      title: "Account deletion requested",
      message: `${user.name} (${user.role}) scheduled deletion`,
      type: "deletion",
      link: `/admin/requests?tab=deletions&status=pending&focus=${newId}`,
    });
    if (user.email) {
      void queueEmail({
        userId: user.id,
        to: user.email,
        templateKey: "account_status",
        category: "security",
        dedupeKey: `account-pending-deletion:${user.id}:${scheduledDeleteAt.toISOString()}`,
        variables: {
          name: user.name,
          status: "pending deletion",
          reason: `Your account is scheduled for deletion on ${scheduledDeleteAt.toISOString()}. You can cancel before that date.`,
          category: "security",
        },
      }).catch(() => undefined);
    }
    return res.json({ success: true, scheduledDeleteAt });
  } catch (e) {
    logger.error({ err: e }, "account.delete-request error");
    return res.status(500).json({ error: "Failed to schedule deletion" });
  }
});

// EMAIL change — provider-neutral verification challenge, then update
router.post("/email/request", async (req: AuthRequest, res) => {
  try {
    const normalizedEmail = normalizeEmailAddress(req.body?.newEmail);
    if (!normalizedEmail) return res.status(400).json({ error: "Valid new email required", code: "INVALID_EMAIL" });
    const user = await db.query.usersTable.findFirst({ where: eq(usersTable.id, req.user!.userId) });
    if (!user) return res.status(404).json({ error: "User not found" });
    if (normalizeEmailAddress(user.email) === normalizedEmail && user.emailVerified) {
      return res.json({ success: true, alreadyVerified: true, email: normalizedEmail });
    }
    const taken = await db.query.usersTable.findFirst({
      where: and(sql`lower(trim(${usersTable.email})) = ${normalizedEmail}`, ne(usersTable.id, user.id)),
    });
    if (taken) return res.status(409).json({ error: "Email address already in use", code: "EMAIL_IN_USE" });
    const result = await sendEmailChallenge({
      userId: user.id,
      email: normalizedEmail,
      name: user.name,
      role: user.role,
      purpose: "email_change",
    });
    if (!result.success) {
      const status = result.errorCode === "EMAIL_OTP_RESEND_COOLDOWN" ? 429 : 503;
      return res.status(status).json({
        error: result.errorCode === "EMAIL_OTP_RESEND_COOLDOWN"
          ? `Please wait ${result.resendAfterSeconds} seconds before requesting another code.`
          : "The email verification code could not be delivered.",
        code: result.errorCode,
        retryAfterSeconds: result.resendAfterSeconds,
      });
    }
    return res.json({
      success: true,
      email: normalizedEmail,
      expiresInSeconds: result.expiresInSeconds,
      resendAfterSeconds: result.resendAfterSeconds,
      ...(result.code ? { code: result.code } : {}),
    });
  } catch (error) {
    logger.error({ err: error }, "account.email-change request failed");
    return res.status(500).json({ error: "Failed to send email verification code" });
  }
});

router.post("/email/verify", async (req: AuthRequest, res) => {
  try {
    const normalizedEmail = normalizeEmailAddress(req.body?.newEmail);
    const code = String(req.body?.code || "").trim();
    if (!normalizedEmail || !/^\d{6}$/.test(code)) {
      return res.status(400).json({ error: "New email and a valid 6-digit code are required", code: "EMAIL_OTP_REQUIRED" });
    }
    const user = await db.query.usersTable.findFirst({ where: eq(usersTable.id, req.user!.userId) });
    if (!user) return res.status(404).json({ error: "User not found" });
    const taken = await db.query.usersTable.findFirst({
      where: and(sql`lower(trim(${usersTable.email})) = ${normalizedEmail}`, ne(usersTable.id, user.id)),
    });
    if (taken) return res.status(409).json({ error: "Email address already in use", code: "EMAIL_IN_USE" });
    const verified = await verifyEmailChallenge({
      userId: user.id,
      email: normalizedEmail,
      purpose: "email_change",
      code,
      role: user.role,
    });
    if (!verified.success) {
      const status = verified.code === "EMAIL_OTP_ATTEMPT_LIMIT" ? 429 : 400;
      return res.status(status).json({
        error: verified.code === "EMAIL_OTP_EXPIRED"
          ? "Email code expired. Request a new code."
          : verified.code === "EMAIL_OTP_ATTEMPT_LIMIT"
            ? "Too many incorrect attempts. Request a new code."
            : "Email verification code is incorrect.",
        code: verified.code,
        attemptsRemaining: verified.attemptsRemaining,
      });
    }
    const oldEmail = normalizeEmailAddress(user.email);
    try {
      await db.update(usersTable).set({ email: normalizedEmail, emailVerified: true, updatedAt: new Date() })
        .where(eq(usersTable.id, user.id));
    } catch (error: any) {
      if (String(error?.code || "") === "23505") {
        return res.status(409).json({ error: "Email address already verified on another account", code: "EMAIL_IN_USE" });
      }
      throw error;
    }
    await revokeAllUserSessions(req.user!.userId, "email_changed");
    const variables = { name: user.name, email: normalizedEmail, timestamp: new Date().toISOString(), category: "security" };
    void queueEmail({
      userId: user.id,
      to: normalizedEmail,
      templateKey: "email_changed",
      category: "security",
      dedupeKey: `email-changed-new:${user.id}:${normalizedEmail}`,
      variables,
    }).catch(() => undefined);
    if (oldEmail && oldEmail !== normalizedEmail) {
      void queueEmail({
        userId: null,
        to: oldEmail,
        templateKey: "email_changed",
        category: "security",
        dedupeKey: `email-changed-old:${user.id}:${normalizedEmail}`,
        variables,
        metadata: { previousAddressAlert: true, userId: user.id },
      }).catch(() => undefined);
    }
    return res.json({ success: true, email: normalizedEmail, emailVerified: true, signedOut: true });
  } catch (error) {
    logger.error({ err: error }, "account.email-change verify failed");
    return res.status(500).json({ error: "Failed to verify email change" });
  }
});

// PHONE change — request OTP, then verify
router.post("/phone/request", async (req: AuthRequest, res) => {
  const { newPhone } = req.body ?? {};
  if (!newPhone || String(newPhone).replace(/\D/g, "").length < 10) {
    return res.status(400).json({ error: "Valid new phone required" });
  }
  const code = otp();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
  await db.insert(phoneChangeRequestsTable).values({
    id: id(),
    userId: req.user!.userId,
    newPhone: String(newPhone).trim(),
    otpCode: code,
    expiresAt,
  });
  const isDev = process.env.NODE_ENV !== "production";
  return res.json({ success: true, ...(isDev ? { code } : {}) });
});

router.post("/phone/verify", async (req: AuthRequest, res) => {
  const { code } = req.body ?? {};
  const reqRow = await db.query.phoneChangeRequestsTable.findFirst({
    where: and(
      eq(phoneChangeRequestsTable.userId, req.user!.userId),
      eq(phoneChangeRequestsTable.otpCode, String(code ?? "")),
      eq(phoneChangeRequestsTable.verified, false),
      gt(phoneChangeRequestsTable.expiresAt, new Date()),
    ),
    orderBy: desc(phoneChangeRequestsTable.createdAt),
  });
  if (!reqRow) return res.status(400).json({ error: "Invalid or expired code" });
  const taken = await db.query.usersTable.findFirst({
    where: eq(usersTable.phone, reqRow.newPhone),
  });
  if (taken && taken.id !== req.user!.userId) {
    return res.status(409).json({ error: "Phone number already in use" });
  }
  await db.transaction(async (tx) => {
    await tx
      .update(phoneChangeRequestsTable)
      .set({ verified: true })
      .where(eq(phoneChangeRequestsTable.id, reqRow.id));
    await tx
      .update(usersTable)
      .set({ phone: reqRow.newPhone, updatedAt: new Date() })
      .where(eq(usersTable.id, req.user!.userId));
  });
  await revokeAllUserSessions(req.user!.userId, "phone_changed");
  return res.json({ success: true, phone: reqRow.newPhone });
});

// SERVICE add request — provider asks to be approved for a new category
router.post("/services/request", async (req: AuthRequest, res) => {
  try {
    if (req.user!.role !== "provider") return res.status(403).json({ error: "Only providers can request new services" });
    const provider = await db.query.usersTable.findFirst({ where: eq(usersTable.id, req.user!.userId) });
    if (!provider || provider.verificationStatus !== "approved" || provider.isBlocked || provider.isDeactivated) {
      return res.status(403).json({ error: "Only active, approved providers can request new services" });
    }
    const serviceCategoryId = String(req.body?.serviceCategoryId || "").trim();
    const note = String(req.body?.note || "").trim();
    const documents = Array.isArray(req.body?.documents) ? req.body.documents : [];
    if (documents.length > 10) return res.status(400).json({ error: "A maximum of 10 supporting documents is allowed" });
    if (!serviceCategoryId) return res.status(400).json({ error: "serviceCategoryId is required" });
    if (note.length > 500) return res.status(400).json({ error: "Note must be 500 characters or fewer" });
    const category = await db.query.serviceCategoriesTable.findFirst({ where: eq(serviceCategoriesTable.id, serviceCategoryId) });
    if (!category || category.isActive === false) return res.status(404).json({ error: "Active service category not found" });
    if ((provider.services || []).includes(category.slug)) return res.status(409).json({ error: "Service is already approved on your profile" });
    const pending = await db.query.serviceAddRequestsTable.findFirst({
      where: and(
        eq(serviceAddRequestsTable.providerId, provider.id),
        eq(serviceAddRequestsTable.serviceCategoryId, category.id),
        eq(serviceAddRequestsTable.status, "pending"),
      ),
    });
    if (pending) return res.status(409).json({ error: "A request for this service is already pending", request: pending });
    for (const document of documents) {
      const url = normalizeStoredObjectPath(document?.url);
      if (!isOwnedUploadObjectPath(url, req.user!.userId, ["private"])) {
        return res.status(400).json({ error: "Service-request documents must be uploaded through your private Athoo storage" });
      }
      document.url = url;
    }
    const newId = id();
    await db.insert(serviceAddRequestsTable).values({
      id: newId, providerId: provider.id, serviceCategoryId: category.id,
      serviceName: category.name, documents, note: note || null, status: "pending",
    });
    await createAdminNotification({
      title: "New service add request",
      message: `${provider.name} requested to add "${category.name}"`,
      type: "service_request",
      link: `/admin/requests?tab=services&status=pending&focus=${newId}`,
    });
    return res.status(201).json({ requestId: newId });
  } catch (e) {
    logger.error({ err: e }, "account.service-request error");
    return res.status(500).json({ error: "Failed to submit request" });
  }
});

router.get("/services/requests", async (req: AuthRequest, res) => {
  const rows = await db
    .select()
    .from(serviceAddRequestsTable)
    .where(eq(serviceAddRequestsTable.providerId, req.user!.userId))
    .orderBy(desc(serviceAddRequestsTable.createdAt));
  return res.json({ requests: rows });
});

// ADMIN sub-router — service add request review + deletion request management
const adminRouter = Router();
adminRouter.use(requireAuth, requireAdmin);

adminRouter.get("/service-requests", requirePermission("providers.read"), async (req, res) => {
  const status = String(req.query.status ?? "");
  const where = status ? eq(serviceAddRequestsTable.status, status) : undefined;
  const rows = await db
    .select({
      id: serviceAddRequestsTable.id,
      providerId: serviceAddRequestsTable.providerId,
      providerName: usersTable.name,
      providerPhone: usersTable.phone,
      serviceCategoryId: serviceAddRequestsTable.serviceCategoryId,
      serviceName: serviceAddRequestsTable.serviceName,
      documents: serviceAddRequestsTable.documents,
      note: serviceAddRequestsTable.note,
      status: serviceAddRequestsTable.status,
      createdAt: serviceAddRequestsTable.createdAt,
    })
    .from(serviceAddRequestsTable)
    .leftJoin(usersTable, eq(serviceAddRequestsTable.providerId, usersTable.id))
    .where(where as any)
    .orderBy(desc(serviceAddRequestsTable.createdAt))
    .limit(200);
  return res.json({ requests: rows });
});

adminRouter.post("/service-requests/:id/approve", requirePermission("providers.write"), async (req: AuthRequest, res) => {
  try {
    const reqRow = await db.query.serviceAddRequestsTable.findFirst({ where: eq(serviceAddRequestsTable.id, req.params.id) });
    if (!reqRow) return res.status(404).json({ error: "Request not found" });
    if (reqRow.status !== "pending") return res.status(409).json({ error: "Request has already been reviewed" });
    const provider = await db.query.usersTable.findFirst({ where: eq(usersTable.id, reqRow.providerId) });
    if (!provider) return res.status(404).json({ error: "Provider not found" });
    const category = reqRow.serviceCategoryId
      ? await db.query.serviceCategoriesTable.findFirst({ where: eq(serviceCategoriesTable.id, reqRow.serviceCategoryId) })
      : null;
    if (!category || category.isActive === false) return res.status(409).json({ error: "Service category is no longer active" });
    const admin = await db.query.usersTable.findFirst({ where: eq(usersTable.id, req.user!.userId) });
    const services = Array.from(new Set([...(provider.services || []), category.slug]));
    const approved = await db.transaction(async (tx) => {
      const [changed] = await tx.update(serviceAddRequestsTable).set({
        status: "approved", reviewedBy: req.user!.userId, reviewedAt: new Date(), updatedAt: new Date(),
      }).where(and(eq(serviceAddRequestsTable.id, reqRow.id), eq(serviceAddRequestsTable.status, "pending"))).returning();
      if (!changed) return null;
      await tx.update(usersTable).set({ services, updatedAt: new Date() }).where(eq(usersTable.id, provider.id));
      await tx.insert(auditLogTable).values({
        id: id(), adminId: req.user!.userId, adminName: admin?.name || "Admin", adminRole: admin?.adminRole || null,
        action: "provider_service.approved", target: "service_add_request", targetId: reqRow.id,
        details: { providerId: provider.id, categoryId: category.id, categorySlug: category.slug }, ip: req.ip || null,
      });
      return changed;
    });
    if (!approved) return res.status(409).json({ error: "Request was processed by another action" });
    const profileUpdatePayload = {
      resource: "providers",
      action: "service_approved",
      providerId: provider.id,
      services,
    };
    emitToRole("customer", "admin:event", profileUpdatePayload);
    emitToUser(provider.id, "admin:event", profileUpdatePayload);
    notifyUser({
      userId: provider.id,
      title: "Service approved",
      body: `Your request to add "${category.name}" has been approved.`,
      type: "system",
    }).catch(() => undefined);
    return res.json({ success: true });
  } catch (e) {
    logger.error({ err: e }, "account.service-approve error");
    return res.status(500).json({ error: "Failed to approve" });
  }
});

adminRouter.post("/service-requests/:id/reject", requirePermission("providers.write"), async (req: AuthRequest, res) => {
  try {
    const reason = String(req.body?.reason ?? "").trim();
    if (reason.length < 3) return res.status(400).json({ error: "A rejection reason is required" });
    if (reason.length > 500) return res.status(400).json({ error: "Reason must be 500 characters or fewer" });
    const reqRow = await db.query.serviceAddRequestsTable.findFirst({ where: eq(serviceAddRequestsTable.id, req.params.id) });
    if (!reqRow) return res.status(404).json({ error: "Request not found" });
    if (reqRow.status !== "pending") return res.status(409).json({ error: "Request has already been reviewed" });
    const admin = await db.query.usersTable.findFirst({ where: eq(usersTable.id, req.user!.userId) });
    const rejected = await db.transaction(async (tx) => {
      const [changed] = await tx.update(serviceAddRequestsTable).set({
        status: "rejected", rejectionNote: reason, reviewedBy: req.user!.userId,
        reviewedAt: new Date(), updatedAt: new Date(),
      }).where(and(eq(serviceAddRequestsTable.id, reqRow.id), eq(serviceAddRequestsTable.status, "pending"))).returning();
      if (!changed) return null;
      await tx.insert(auditLogTable).values({
        id: id(), adminId: req.user!.userId, adminName: admin?.name || "Admin", adminRole: admin?.adminRole || null,
        action: "provider_service.rejected", target: "service_add_request", targetId: reqRow.id,
        details: { providerId: reqRow.providerId, categoryId: reqRow.serviceCategoryId, reason }, ip: req.ip || null,
      });
      return changed;
    });
    if (!rejected) return res.status(409).json({ error: "Request was processed by another action" });
    emitToUser(reqRow.providerId, "admin:event", {
      resource: "providers",
      action: "service_rejected",
      providerId: reqRow.providerId,
      requestId: reqRow.id,
    });
    notifyUser({
      userId: reqRow.providerId,
      title: "Service request rejected",
      body: reason,
      type: "system",
    }).catch(() => undefined);
    return res.json({ success: true });
  } catch (e) {
    logger.error({ err: e }, "account.service-reject error");
    return res.status(500).json({ error: "Failed to reject" });
  }
});

adminRouter.get("/deletion-requests", requirePermission("users.read"), async (req, res) => {
  const status = String(req.query.status ?? "pending");
  const rows = await db
    .select({
      id: accountDeletionRequestsTable.id,
      userId: accountDeletionRequestsTable.userId,
      userName: usersTable.name,
      userPhone: usersTable.phone,
      reason: accountDeletionRequestsTable.reason,
      scheduledDeleteAt: accountDeletionRequestsTable.scheduledDeleteAt,
      status: accountDeletionRequestsTable.status,
      createdAt: accountDeletionRequestsTable.createdAt,
    })
    .from(accountDeletionRequestsTable)
    .leftJoin(usersTable, eq(accountDeletionRequestsTable.userId, usersTable.id))
    .where(eq(accountDeletionRequestsTable.status, status))
    .orderBy(desc(accountDeletionRequestsTable.createdAt));
  return res.json({ requests: rows });
});

adminRouter.post("/deletion-requests/:id/cancel", requirePermission("users.write"), async (req: AuthRequest, res) => {
  const r = await db.query.accountDeletionRequestsTable.findFirst({
    where: eq(accountDeletionRequestsTable.id, req.params.id),
  });
  if (!r) return res.status(404).json({ error: "Request not found" });
  await db
    .update(accountDeletionRequestsTable)
    .set({ status: "cancelled", cancelledAt: new Date(), updatedAt: new Date() })
    .where(eq(accountDeletionRequestsTable.id, r.id));
  await db
    .update(usersTable)
    .set({
      accountStatus: "active",
      deletionScheduledAt: null,
      isDeactivated: false,
      updatedAt: new Date(),
    })
    .where(eq(usersTable.id, r.userId));
  return res.json({ success: true });
});

export { adminRouter as accountAdminRouter };
export default router;

