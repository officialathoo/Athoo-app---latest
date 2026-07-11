import { revokeAllUserSessions } from "../lib/session";
import { Router } from "express";
import { logger } from "../lib/logger";
import crypto from "crypto";
import * as bcrypt from "bcryptjs";
import { db } from "@workspace/db";
import {
  usersTable,
  accountDeletionRequestsTable,
  emailChangeRequestsTable,
  phoneChangeRequestsTable,
  serviceAddRequestsTable,
  serviceCategoriesTable,
  auditLogTable,
  notificationsTable,
  adminNotificationsTable,
} from "@workspace/db/schema";
import { and, desc, eq, gt, ne } from "drizzle-orm";
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
  await db
    .update(usersTable)
    .set({ isDeactivated: false, accountStatus: "active", deletionScheduledAt: null, updatedAt: new Date() })
    .where(eq(usersTable.id, req.user!.userId));
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
    if (body.profileImage !== undefined) patch.profileImage = body.profileImage || null;
    if (body.profileColor !== undefined) {
      const color = String(body.profileColor || "").trim();
      if (color && !/^#[0-9a-f]{6}$/i.test(color)) return res.status(400).json({ error: "Invalid profile color" });
      patch.profileColor = color || null;
    }
    if (body.language === "en" || body.language === "ur") patch.language = body.language;
    if (typeof body.biometricEnabled === "boolean") patch.biometricEnabled = body.biometricEnabled;
    const forbidden = ["fatherName", "cnicNumber", "email", "phone", "role", "services", "ratePerHour", "isAvailable", "maxTravelDistanceKm", "verificationStatus", "isVerified"];
    const attempted = forbidden.filter((field) => body[field] !== undefined);
    if (attempted.length) return res.status(403).json({ error: `Profile field changes require the approved workflow: ${attempted.join(", ")}` });
    if (Object.keys(patch).length === 1) return res.status(400).json({ error: "No valid fields to update" });
    const [updated] = await db.update(usersTable).set(patch).where(eq(usersTable.id, user.id)).returning();
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
    await db.update(usersTable).set({ password: hashed, updatedAt: new Date() }).where(eq(usersTable.id, user.id));
    await revokeAllUserSessions(user.id, "password_changed");
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
    await db.insert(adminNotificationsTable).values({
      id: id(),
      title: "Account deletion requested",
      message: `${user.name} (${user.role}) scheduled deletion`,
      type: "warning",
      link: `/admin/users/${user.id}`,
    });
    return res.json({ success: true, scheduledDeleteAt });
  } catch (e) {
    logger.error({ err: e }, "account.delete-request error");
    return res.status(500).json({ error: "Failed to schedule deletion" });
  }
});

// EMAIL change — request OTP, then verify
router.post("/email/request", async (req: AuthRequest, res) => {
  const { newEmail } = req.body ?? {};
  if (!newEmail || !/.+@.+\..+/.test(String(newEmail))) {
    return res.status(400).json({ error: "Valid new email required" });
  }
  const normalizedEmail = String(newEmail).toLowerCase().trim();
  const taken = await db.query.usersTable.findFirst({
    where: and(eq(usersTable.email, normalizedEmail), ne(usersTable.id, req.user!.userId)),
  });
  if (taken) return res.status(409).json({ error: "Email address already in use" });
  const code = otp();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
  await db.insert(emailChangeRequestsTable).values({
    id: id(),
    userId: req.user!.userId,
    newEmail: normalizedEmail,
    otpCode: code,
    expiresAt,
  });
  const isDev = process.env.NODE_ENV !== "production";
  return res.json({ success: true, ...(isDev ? { code } : {}) });
});

router.post("/email/verify", async (req: AuthRequest, res) => {
  const { code } = req.body ?? {};
  const reqRow = await db.query.emailChangeRequestsTable.findFirst({
    where: and(
      eq(emailChangeRequestsTable.userId, req.user!.userId),
      eq(emailChangeRequestsTable.otpCode, String(code ?? "")),
      eq(emailChangeRequestsTable.verified, false),
      gt(emailChangeRequestsTable.expiresAt, new Date()),
    ),
    orderBy: desc(emailChangeRequestsTable.createdAt),
  });
  if (!reqRow) return res.status(400).json({ error: "Invalid or expired code" });
  const taken = await db.query.usersTable.findFirst({
    where: and(eq(usersTable.email, reqRow.newEmail), ne(usersTable.id, req.user!.userId)),
  });
  if (taken) return res.status(409).json({ error: "Email address already in use" });
  await db.transaction(async (tx) => {
    await tx
      .update(emailChangeRequestsTable)
      .set({ verified: true })
      .where(eq(emailChangeRequestsTable.id, reqRow.id));
    await tx
      .update(usersTable)
      .set({ email: reqRow.newEmail, updatedAt: new Date() })
      .where(eq(usersTable.id, req.user!.userId));
  });
  await revokeAllUserSessions(req.user!.userId, "email_changed");
  return res.json({ success: true, email: reqRow.newEmail });
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
      const url = String(document?.url || "");
      if (!url.startsWith(`/objects/uploads/private/${provider.id}/`)) {
        return res.status(400).json({ error: "Service evidence must use your private upload path" });
      }
    }
    const newId = id();
    await db.insert(serviceAddRequestsTable).values({
      id: newId, providerId: provider.id, serviceCategoryId: category.id,
      serviceName: category.name, documents, note: note || null, status: "pending",
    });
    await db.insert(adminNotificationsTable).values({
      id: id(), title: "New service add request",
      message: `${provider.name} requested to add "${category.name}"`,
      type: "info", link: `/admin/requests`,
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
      await tx.insert(notificationsTable).values({
        id: id(), userId: provider.id, title: "Service approved",
        body: `Your request to add "${category.name}" has been approved.`, type: "system",
      });
      await tx.insert(auditLogTable).values({
        id: id(), adminId: req.user!.userId, adminName: admin?.name || "Admin", adminRole: admin?.adminRole || null,
        action: "provider_service.approved", target: "service_add_request", targetId: reqRow.id,
        details: { providerId: provider.id, categoryId: category.id, categorySlug: category.slug }, ip: req.ip || null,
      });
      return changed;
    });
    if (!approved) return res.status(409).json({ error: "Request was processed by another action" });
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
      await tx.insert(notificationsTable).values({
        id: id(), userId: reqRow.providerId, title: "Service request rejected", body: reason, type: "system",
      });
      await tx.insert(auditLogTable).values({
        id: id(), adminId: req.user!.userId, adminName: admin?.name || "Admin", adminRole: admin?.adminRole || null,
        action: "provider_service.rejected", target: "service_add_request", targetId: reqRow.id,
        details: { providerId: reqRow.providerId, categoryId: reqRow.serviceCategoryId, reason }, ip: req.ip || null,
      });
      return changed;
    });
    if (!rejected) return res.status(409).json({ error: "Request was processed by another action" });
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

