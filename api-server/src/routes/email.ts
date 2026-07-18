import crypto from "node:crypto";
import { Router, type Response } from "express";
import { db, pool } from "@workspace/db";
import {
  auditLogTable,
  emailCampaignsTable,
  emailDeliveriesTable,
  emailPreferencesTable,
  usersTable,
} from "@workspace/db/schema";
import { and, desc, eq, sql } from "drizzle-orm";
import { requireAdmin, requireAuth, requirePermission, type AuthRequest, verifyToken } from "../middlewares/auth";
import { getRuntimeEmailConfigurationStatus, verifyEmailTransport } from "../lib/email";
import { deliverEmailNow, scheduleEmailCampaign } from "../lib/emailDelivery";
import { normalizeEmailAddress, sendEmailChallenge, verifyEmailChallenge } from "../lib/emailAuth";
import { logger } from "../lib/logger";

const publicRouter = Router();
const userRouter = Router();
const adminRouter = Router();

function id() { return crypto.randomUUID(); }
function bool(value: unknown): boolean | undefined { return typeof value === "boolean" ? value : undefined; }
function boundedInt(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, Math.trunc(parsed))) : fallback;
}

async function ensurePreferences(userId: string) {
  await db.insert(emailPreferencesTable).values({ userId }).onConflictDoNothing({ target: emailPreferencesTable.userId });
  return db.query.emailPreferencesTable.findFirst({ where: eq(emailPreferencesTable.userId, userId) });
}

async function audit(req: AuthRequest, action: string, target: string, targetId: string | null, details: Record<string, unknown>) {
  const admin = await db.query.usersTable.findFirst({ where: eq(usersTable.id, req.user!.userId) });
  await db.insert(auditLogTable).values({
    id: id(), adminId: req.user!.userId, adminName: admin?.name || "Admin", adminRole: admin?.adminRole || null,
    action, target, targetId, details, ip: req.ip ?? null,
  });
}

function unsubscribeToken(req: any) {
  const token = String(req.query?.token || req.body?.token || "").trim();
  const decoded = token ? verifyToken(token) : null;
  const valid = Boolean(decoded && decoded.tokenType === "purpose" && decoded.purpose === "marketing_unsubscribe" && decoded.role === "email");
  return { token, decoded: valid ? decoded : null };
}

function safeBrandName(): string {
  return String(process.env.EMAIL_BRAND_NAME || "Athoo").replace(/[<>&"']/g, "");
}

function safeBrandColor(): string {
  const color = String(process.env.EMAIL_BRAND_COLOR || "#1A6EE0").trim();
  return /^#[0-9a-f]{6}$/i.test(color) ? color : "#1A6EE0";
}

function unsubscribePage(title: string, body: string, form?: string): string {
  const brandName = safeBrandName();
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta name="robots" content="noindex,nofollow"><title>${title}</title></head><body style="font-family:Arial,sans-serif;background:#f4f6fb;padding:40px"><main style="max-width:520px;margin:auto;background:white;padding:28px;border-radius:16px"><h1>${brandName}</h1><h2>${title}</h2><p>${body}</p>${form || ""}</main></body></html>`;
}

async function showUnsubscribePage(req: any, res: Response) {
  const { token, decoded } = unsubscribeToken(req);
  if (!decoded) {
    return res.status(400).send(unsubscribePage("Unsubscribe link unavailable", "This link is invalid or has expired. You can update email preferences inside the app."));
  }
  const action = `/api/email/unsubscribe?token=${encodeURIComponent(token)}`;
  const form = `<form method="post" action="${action}"><button type="submit" style="background:${safeBrandColor()};color:white;border:0;border-radius:10px;padding:12px 18px;font-weight:700;cursor:pointer">Stop promotional emails</button></form>`;
  return res.send(unsubscribePage("Confirm unsubscribe", "Select the button below to stop promotional emails. Security and essential account emails will remain enabled.", form));
}

async function performUnsubscribe(req: any, res: Response) {
  const { decoded } = unsubscribeToken(req);
  const wantsHtml = Boolean(req.accepts("html"));
  if (!decoded) {
    if (wantsHtml) return res.status(400).send(unsubscribePage("Unsubscribe link unavailable", "This link is invalid or has expired. You can update email preferences inside the app."));
    return res.status(400).json({ error: "Unsubscribe link is invalid or expired" });
  }
  await db.insert(emailPreferencesTable).values({
    userId: decoded.userId,
    marketingEmails: false,
    unsubscribedAt: new Date(),
    updatedAt: new Date(),
  }).onConflictDoUpdate({
    target: emailPreferencesTable.userId,
    set: { marketingEmails: false, unsubscribedAt: new Date(), updatedAt: new Date() },
  });
  if (wantsHtml) return res.send(unsubscribePage("Promotional emails stopped", "You have been unsubscribed from promotional emails. Security and essential account emails remain enabled."));
  return res.json({ success: true, message: "You have been unsubscribed from promotional emails. Security and account emails remain enabled." });
}

// GET is confirmation-only so link scanners cannot silently unsubscribe users.
// RFC 8058 one-click unsubscribe is performed by POST.
publicRouter.get("/unsubscribe", showUnsubscribePage);
publicRouter.post("/unsubscribe", performUnsubscribe);

userRouter.use(requireAuth);

userRouter.get("/preferences", async (req: AuthRequest, res) => {
  try {
    const preferences = await ensurePreferences(req.user!.userId);
    return res.json({ preferences });
  } catch (error) {
    logger.error({ err: error }, "email preferences load failed");
    return res.status(500).json({ error: "Failed to load email preferences" });
  }
});

userRouter.patch("/preferences", async (req: AuthRequest, res) => {
  try {
    const current = await ensurePreferences(req.user!.userId);
    if (!current) return res.status(500).json({ error: "Email preferences are unavailable" });
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    const bookingUpdates = bool(req.body?.bookingUpdates);
    const accountUpdates = bool(req.body?.accountUpdates);
    const productUpdates = bool(req.body?.productUpdates);
    const marketingEmails = bool(req.body?.marketingEmails);
    if (bookingUpdates !== undefined) patch.bookingUpdates = bookingUpdates;
    if (accountUpdates !== undefined) patch.accountUpdates = accountUpdates;
    if (productUpdates !== undefined) patch.productUpdates = productUpdates;
    if (marketingEmails !== undefined) {
      patch.marketingEmails = marketingEmails;
      patch.marketingConsentAt = marketingEmails ? new Date() : current.marketingConsentAt;
      patch.unsubscribedAt = marketingEmails ? null : new Date();
    }
    if (Object.keys(patch).length === 1) return res.status(400).json({ error: "No valid email preferences supplied" });
    const [updated] = await db.update(emailPreferencesTable).set(patch).where(eq(emailPreferencesTable.userId, req.user!.userId)).returning();
    return res.json({ preferences: updated });
  } catch (error) {
    logger.error({ err: error }, "email preferences update failed");
    return res.status(500).json({ error: "Failed to update email preferences" });
  }
});

userRouter.get("/verification/status", async (req: AuthRequest, res) => {
  const user = await db.query.usersTable.findFirst({ where: eq(usersTable.id, req.user!.userId) });
  if (!user) return res.status(404).json({ error: "User not found" });
  return res.json({ email: user.email, verified: user.emailVerified === true, canVerify: Boolean(user.email) });
});

userRouter.post("/verification/send", async (req: AuthRequest, res) => {
  try {
    const user = await db.query.usersTable.findFirst({ where: eq(usersTable.id, req.user!.userId) });
    if (!user) return res.status(404).json({ error: "User not found" });
    if (!user.email) return res.status(400).json({ error: "Add an email address before requesting verification", code: "EMAIL_NOT_SET" });
    if (user.emailVerified) return res.json({ success: true, alreadyVerified: true, message: "Email is already verified" });
    const result = await sendEmailChallenge({ userId: user.id, email: user.email, name: user.name, role: user.role, purpose: "verify_email" });
    if (!result.success) {
      const status = result.errorCode === "EMAIL_OTP_RESEND_COOLDOWN" ? 429 : 503;
      return res.status(status).json({
        error: result.errorCode === "EMAIL_OTP_RESEND_COOLDOWN"
          ? `Please wait ${result.resendAfterSeconds} seconds before requesting another email code.`
          : "Verification email could not be sent. Please check email configuration and try again.",
        code: result.errorCode,
        retryAfterSeconds: result.resendAfterSeconds,
      });
    }
    return res.json({ success: true, expiresInSeconds: result.expiresInSeconds, resendAfterSeconds: result.resendAfterSeconds, ...(result.code ? { code: result.code } : {}) });
  } catch (error) {
    logger.error({ err: error }, "email verification send failed");
    return res.status(500).json({ error: "Failed to send email verification code" });
  }
});

userRouter.post("/verification/verify", async (req: AuthRequest, res) => {
  try {
    const user = await db.query.usersTable.findFirst({ where: eq(usersTable.id, req.user!.userId) });
    if (!user || !user.email) return res.status(404).json({ error: "Email account not found" });
    if (user.emailVerified) return res.json({ success: true, alreadyVerified: true });
    const existingOwner = await db.query.usersTable.findFirst({
      where: and(sql`lower(trim(${usersTable.email})) = ${normalizeEmailAddress(user.email)}`, eq(usersTable.emailVerified, true)),
    });
    if (existingOwner && existingOwner.id !== user.id) {
      return res.status(409).json({ error: "This email address is already verified on another account", code: "EMAIL_IN_USE" });
    }
    const result = await verifyEmailChallenge({ userId: user.id, email: user.email, purpose: "verify_email", code: String(req.body?.code || ""), role: user.role });
    if (!result.success) {
      const status = result.code === "EMAIL_OTP_ATTEMPT_LIMIT" ? 429 : 400;
      return res.status(status).json({ error: result.code === "EMAIL_OTP_EXPIRED" ? "Email code expired. Request a new code." : result.code === "EMAIL_OTP_ATTEMPT_LIMIT" ? "Too many incorrect attempts. Request a new code." : "Email verification code is incorrect.", code: result.code, attemptsRemaining: result.attemptsRemaining });
    }
    try {
      const [updated] = await db.update(usersTable).set({ emailVerified: true, updatedAt: new Date() }).where(eq(usersTable.id, user.id)).returning({
        id: usersTable.id,
        name: usersTable.name,
        email: usersTable.email,
        emailVerified: usersTable.emailVerified,
        phone: usersTable.phone,
        role: usersTable.role,
        updatedAt: usersTable.updatedAt,
      });
      return res.json({ success: true, user: updated });
    } catch (error: any) {
      if (String(error?.code || "") === "23505") {
        return res.status(409).json({ error: "This email address is already verified on another account", code: "EMAIL_IN_USE" });
      }
      throw error;
    }
  } catch (error) {
    logger.error({ err: error }, "email verification failed");
    return res.status(500).json({ error: "Failed to verify email" });
  }
});

adminRouter.use(requireAuth, requireAdmin);

adminRouter.get("/status", requirePermission("notifications.read"), async (_req, res) => {
  const config = await getRuntimeEmailConfigurationStatus();
  const counts = await pool.query<{ status: string; count: string }>("SELECT status, count(*)::text AS count FROM email_deliveries GROUP BY status").catch(() => ({ rows: [] } as any));
  const deliveryCounts = Object.fromEntries(counts.rows.map((row: { status: string; count: string }) => [row.status, Number(row.count)]));
  return res.json({ config, deliveryCounts, marketingEnabled: process.env.EMAIL_MARKETING_ENABLED === "true", marketingMaxRecipients: boundedInt(process.env.EMAIL_MARKETING_MAX_RECIPIENTS, 500, 1, 10_000) });
});

adminRouter.post("/verify-transport", requirePermission("settings.write"), async (req: AuthRequest, res) => {
  const result = await verifyEmailTransport();
  await audit(req, "email.transport.verify", "email_configuration", null, { ok: result.ok, provider: result.provider });
  return res.status(result.ok ? 200 : 503).json(result);
});

adminRouter.post("/test", requirePermission("settings.write"), async (req: AuthRequest, res) => {
  const to = normalizeEmailAddress(req.body?.to);
  if (!to) return res.status(400).json({ error: "Valid recipient email required" });
  const brandName = safeBrandName();
  const result = await deliverEmailNow({
    to,
    templateKey: "campaign_custom",
    category: "security",
    variables: { subject: `${brandName} email configuration test`, body: `Your ${brandName} email delivery configuration is working correctly.`, category: "security" },
    dedupeKey: `email-test:${req.user!.userId}:${Date.now()}`,
    metadata: { initiatedBy: req.user!.userId },
  });
  await audit(req, "email.test.send", "email_delivery", result.deliveryId, { to, ok: result.ok });
  return res.status(result.ok ? 200 : 503).json(result);
});

adminRouter.get("/deliveries", requirePermission("notifications.read"), async (req, res) => {
  const limit = boundedInt(req.query.limit, 50, 1, 200);
  const offset = boundedInt(req.query.offset, 0, 0, 1_000_000);
  const status = String(req.query.status || "").trim();
  const where = status ? eq(emailDeliveriesTable.status, status) : undefined;
  const [deliveries, totalRows] = await Promise.all([
    db.select().from(emailDeliveriesTable).where(where).orderBy(desc(emailDeliveriesTable.queuedAt)).limit(limit).offset(offset),
    db.select({ count: sql<number>`count(*)::int` }).from(emailDeliveriesTable).where(where),
  ]);
  return res.json({ deliveries, pagination: { limit, offset, total: Number(totalRows[0]?.count || 0) } });
});

adminRouter.get("/campaigns", requirePermission("marketing.read"), async (req, res) => {
  const limit = boundedInt(req.query.limit, 50, 1, 200);
  const offset = boundedInt(req.query.offset, 0, 0, 1_000_000);
  const [campaigns, totalRows] = await Promise.all([
    db.select().from(emailCampaignsTable).orderBy(desc(emailCampaignsTable.createdAt)).limit(limit).offset(offset),
    db.select({ count: sql<number>`count(*)::int` }).from(emailCampaignsTable),
  ]);
  return res.json({ campaigns, pagination: { limit, offset, total: Number(totalRows[0]?.count || 0) } });
});

adminRouter.post("/campaigns", requirePermission("marketing.write"), async (req: AuthRequest, res) => {
  const name = String(req.body?.name || "").trim();
  const subject = String(req.body?.subject || "").trim();
  const body = String(req.body?.body || "").trim();
  const audience = String(req.body?.audience || "all").trim();
  const category = String(req.body?.category || "marketing").trim();
  if (name.length < 3 || name.length > 120) return res.status(400).json({ error: "Campaign name must be 3-120 characters" });
  if (!subject || subject.length > 200) return res.status(400).json({ error: "Campaign subject is required and must be 200 characters or fewer" });
  if (!body || body.length > 20_000) return res.status(400).json({ error: "Campaign body is required and must be 20,000 characters or fewer" });
  if (!new Set(["all", "customer", "provider", "premium"]).has(audience)) return res.status(400).json({ error: "Unsupported campaign audience" });
  if (!new Set(["marketing", "product"]).has(category)) return res.status(400).json({ error: "Unsupported campaign category" });
  const scheduledAt = req.body?.scheduledAt ? new Date(String(req.body.scheduledAt)) : null;
  if (scheduledAt && Number.isNaN(scheduledAt.getTime())) return res.status(400).json({ error: "Invalid scheduledAt value" });
  const campaign = {
    id: id(), name, subject, body, audience, category, status: "draft", createdBy: req.user!.userId,
    scheduledAt: scheduledAt && scheduledAt.getTime() > Date.now() ? scheduledAt : null,
  };
  await db.insert(emailCampaignsTable).values(campaign);
  await audit(req, "email.campaign.create", "email_campaign", campaign.id, { name, audience, category, scheduledAt: campaign.scheduledAt });
  return res.status(201).json({ campaign });
});

adminRouter.patch("/campaigns/:id", requirePermission("marketing.write"), async (req: AuthRequest, res) => {
  const campaign = await db.query.emailCampaignsTable.findFirst({ where: eq(emailCampaignsTable.id, req.params.id as string) });
  if (!campaign) return res.status(404).json({ error: "Campaign not found" });
  if (campaign.status !== "draft") return res.status(409).json({ error: "Only draft campaigns can be edited" });
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (req.body?.name !== undefined) {
    const name = String(req.body.name).trim();
    if (name.length < 3 || name.length > 120) return res.status(400).json({ error: "Campaign name must be 3-120 characters" });
    patch.name = name;
  }
  if (req.body?.subject !== undefined) {
    const subject = String(req.body.subject).trim();
    if (!subject || subject.length > 200) return res.status(400).json({ error: "Campaign subject is required and must be 200 characters or fewer" });
    patch.subject = subject;
  }
  if (req.body?.body !== undefined) {
    const body = String(req.body.body).trim();
    if (!body || body.length > 20_000) return res.status(400).json({ error: "Campaign body is required and must be 20,000 characters or fewer" });
    patch.body = body;
  }
  if (req.body?.audience !== undefined) {
    const audience = String(req.body.audience);
    if (!new Set(["all", "customer", "provider", "premium"]).has(audience)) return res.status(400).json({ error: "Unsupported campaign audience" });
    patch.audience = audience;
  }
  if (req.body?.category !== undefined) {
    const category = String(req.body.category);
    if (!new Set(["marketing", "product"]).has(category)) return res.status(400).json({ error: "Unsupported campaign category" });
    patch.category = category;
  }
  if (req.body?.scheduledAt !== undefined) {
    const scheduled = req.body.scheduledAt ? new Date(String(req.body.scheduledAt)) : null;
    if (scheduled && Number.isNaN(scheduled.getTime())) return res.status(400).json({ error: "Invalid scheduledAt value" });
    patch.scheduledAt = scheduled;
  }
  const [updated] = await db.update(emailCampaignsTable).set(patch).where(eq(emailCampaignsTable.id, campaign.id)).returning();
  await audit(req, "email.campaign.update", "email_campaign", campaign.id, { before: campaign, after: updated });
  return res.json({ campaign: updated });
});

adminRouter.post("/campaigns/:id/send", requirePermission("marketing.write"), async (req: AuthRequest, res) => {
  const campaign = await db.query.emailCampaignsTable.findFirst({ where: eq(emailCampaignsTable.id, req.params.id as string) });
  if (!campaign) return res.status(404).json({ error: "Campaign not found" });
  if (!new Set(["draft", "failed"]).has(campaign.status)) return res.status(409).json({ error: "Campaign has already been queued or sent" });
  if (process.env.EMAIL_MARKETING_ENABLED !== "true") return res.status(503).json({ error: "Marketing email delivery is disabled. Set EMAIL_MARKETING_ENABLED=true after confirming provider limits and consent rules." });
  const scheduledAt = campaign.scheduledAt && new Date(campaign.scheduledAt).getTime() > Date.now() ? new Date(campaign.scheduledAt) : null;
  const dispatchKey = crypto.randomUUID();
  const [queuedCampaign] = await db.update(emailCampaignsTable)
    .set({ status: "queued", startedAt: null, completedAt: null, updatedAt: new Date() })
    .where(and(
      eq(emailCampaignsTable.id, campaign.id),
      sql`${emailCampaignsTable.status} in ('draft', 'failed')`,
    ))
    .returning();
  if (!queuedCampaign) return res.status(409).json({ error: "Campaign has already been queued or sent" });
  try {
    const jobId = await scheduleEmailCampaign(campaign.id, scheduledAt, dispatchKey);
    await audit(req, "email.campaign.queue", "email_campaign", campaign.id, { jobId, scheduledAt, dispatchKey });
    return res.json({ success: true, jobId, scheduledAt });
  } catch (error) {
    await db.update(emailCampaignsTable).set({ status: "failed", updatedAt: new Date() }).where(eq(emailCampaignsTable.id, campaign.id));
    throw error;
  }
});

adminRouter.post("/campaigns/:id/cancel", requirePermission("marketing.write"), async (req: AuthRequest, res) => {
  const [updated] = await db.update(emailCampaignsTable).set({ status: "cancelled", updatedAt: new Date() })
    .where(and(
      eq(emailCampaignsTable.id, req.params.id as string),
      sql`${emailCampaignsTable.status} in ('draft', 'queued')`,
    )).returning();
  if (!updated) return res.status(409).json({ error: "Only draft or scheduled campaigns can be cancelled" });
  await audit(req, "email.campaign.cancel", "email_campaign", updated.id, {});
  return res.json({ success: true, campaign: updated });
});

export { publicRouter as emailPublicRouter, userRouter as emailUserRouter, adminRouter as emailAdminRouter };
