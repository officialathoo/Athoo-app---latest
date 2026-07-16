import crypto from "node:crypto";
import { db, pool } from "@workspace/db";
import {
  emailCampaignsTable,
  emailDeliveriesTable,
  emailPreferencesTable,
  usersTable,
} from "@workspace/db/schema";
import { and, desc, eq, or } from "drizzle-orm";
import { enqueueJob, registerJobHandler } from "./queue";
import { sendEmail } from "./email";
import { renderEmailTemplate, type EmailTemplateKey, type TemplateVariables } from "./emailTemplates";
import { logger } from "./logger";
import { signPurposeToken } from "../middlewares/auth";

export type EmailCategory = "security" | "transactional" | "booking" | "product" | "marketing";

type QueueEmailInput = {
  userId?: string | null;
  to: string;
  templateKey: EmailTemplateKey | string;
  variables?: TemplateVariables;
  category?: EmailCategory;
  campaignId?: string | null;
  dedupeKey?: string | null;
  metadata?: Record<string, unknown>;
  attempts?: number;
};

type ImmediateEmailInput = QueueEmailInput & { subjectOverride?: string; bodyOverride?: string };

const EMAIL_JOB_NAME = "email.send";
const EMAIL_CAMPAIGN_JOB_NAME = "email.campaign";
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function serializeTemplateVariables(variables: TemplateVariables | undefined): Record<string, string | number | boolean | null> {
  const serialized: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(variables || {})) {
    if (value !== undefined) serialized[key] = value;
  }
  return serialized;
}

let emailMaintenanceTimer: NodeJS.Timeout | null = null;
let emailMaintenanceInitialTimer: NodeJS.Timeout | null = null;

function boundedRetentionDays(name: string, fallback: number, min: number, max: number): number {
  const value = Number(process.env[name] || fallback);
  return Number.isFinite(value) ? Math.max(min, Math.min(max, Math.trunc(value))) : fallback;
}

async function runEmailMaintenance(): Promise<void> {
  const challengeDays = boundedRetentionDays("EMAIL_CHALLENGE_RETENTION_DAYS", 7, 1, 90);
  const deliveryDays = boundedRetentionDays("EMAIL_DELIVERY_RETENTION_DAYS", 180, 30, 730);
  const [challenges, deliveries] = await Promise.all([
    pool.query(
      `DELETE FROM email_verification_challenges
       WHERE created_at < now() - ($1 * interval '1 day')
         AND (used_at IS NOT NULL OR expires_at < now())`,
      [challengeDays],
    ),
    pool.query(
      `DELETE FROM email_deliveries
       WHERE queued_at < now() - ($1 * interval '1 day')
         AND status IN ('sent', 'failed', 'suppressed')`,
      [deliveryDays],
    ),
  ]);
  const deletedChallenges = challenges.rowCount || 0;
  const deletedDeliveries = deliveries.rowCount || 0;
  if (deletedChallenges > 0 || deletedDeliveries > 0) {
    logger.info({ deletedChallenges, deletedDeliveries, challengeDays, deliveryDays }, "email retention maintenance completed");
  }
}

export function startEmailMaintenance(): void {
  if (emailMaintenanceTimer) return;
  const intervalMs = Math.max(15 * 60_000, Math.min(24 * 60 * 60_000, Number(process.env.EMAIL_MAINTENANCE_INTERVAL_MS || 6 * 60 * 60_000)));
  const execute = () => void runEmailMaintenance().catch((error) => logger.warn({ err: error }, "email retention maintenance failed"));
  emailMaintenanceTimer = setInterval(execute, intervalMs);
  emailMaintenanceTimer.unref?.();
  emailMaintenanceInitialTimer = setTimeout(execute, Math.min(60_000, intervalMs));
  emailMaintenanceInitialTimer.unref?.();
}

export function stopEmailMaintenance(): void {
  if (emailMaintenanceTimer) clearInterval(emailMaintenanceTimer);
  if (emailMaintenanceInitialTimer) clearTimeout(emailMaintenanceInitialTimer);
  emailMaintenanceTimer = null;
  emailMaintenanceInitialTimer = null;
}

function normalizeEmail(value: string): string {
  return String(value || "").trim().toLowerCase();
}

function apiPublicUrl(): string {
  return String(process.env.API_PUBLIC_URL || process.env.API_BASE_URL || "").trim().replace(/\/$/, "");
}

function maxAttempts(value?: number): number {
  const fallback = Number(process.env.EMAIL_QUEUE_MAX_ATTEMPTS || 4);
  return Math.max(1, Math.min(10, Number.isFinite(Number(value)) ? Number(value) : fallback));
}

async function ensurePreferences(userId: string) {
  await db.insert(emailPreferencesTable).values({ userId }).onConflictDoNothing({ target: emailPreferencesTable.userId });
  return db.query.emailPreferencesTable.findFirst({ where: eq(emailPreferencesTable.userId, userId) });
}

async function shouldSuppress(input: QueueEmailInput): Promise<{ suppress: boolean; reason?: string }> {
  const email = normalizeEmail(input.to);
  if (!emailPattern.test(email)) return { suppress: true, reason: "invalid_email" };
  if (!input.userId) return { suppress: false };
  const user = await db.query.usersTable.findFirst({ where: eq(usersTable.id, input.userId) });
  const category = input.category || "transactional";
  const pendingAddressAllowed = category === "security" && input.metadata?.allowPendingAddress === true;
  if (!user || (normalizeEmail(user.email || "") !== email && !pendingAddressAllowed)) {
    return { suppress: true, reason: "email_not_owned" };
  }
  if (category !== "security" && user.emailVerified !== true) return { suppress: true, reason: "email_not_verified" };
  if (category === "security") return { suppress: false };
  const preferences = await ensurePreferences(input.userId);
  if (!preferences) return { suppress: false };
  if (category === "booking" && preferences.bookingUpdates === false) return { suppress: true, reason: "booking_emails_disabled" };
  if (category === "transactional" && preferences.accountUpdates === false) return { suppress: true, reason: "account_emails_disabled" };
  if (category === "product" && preferences.productUpdates === false) return { suppress: true, reason: "product_emails_disabled" };
  if (category === "marketing" && (preferences.marketingEmails === false || preferences.unsubscribedAt)) {
    return { suppress: true, reason: "marketing_unsubscribed" };
  }
  return { suppress: false };
}

async function createDelivery(input: QueueEmailInput, status = "queued", lastError?: string): Promise<{ delivery: typeof emailDeliveriesTable.$inferSelect; created: boolean }> {
  const id = crypto.randomUUID();
  const email = normalizeEmail(input.to);
  const values = {
    id,
    userId: input.userId || null,
    campaignId: input.campaignId || null,
    toEmail: email,
    templateKey: input.templateKey,
    category: input.category || "transactional",
    status,
    attempts: 0,
    maxAttempts: maxAttempts(input.attempts),
    lastError: lastError || null,
    dedupeKey: input.dedupeKey || null,
    variables: serializeTemplateVariables(input.variables),
    metadata: input.metadata || {},
    ...(status === "suppressed" ? { failedAt: new Date() } : {}),
  };
  try {
    const [row] = await db.insert(emailDeliveriesTable).values(values).returning();
    if (!row) throw new Error("Failed to create email delivery record");
    return { delivery: row, created: true };
  } catch (error: any) {
    if (String(error?.code || "") === "23505" && input.dedupeKey) {
      const existing = await db.query.emailDeliveriesTable.findFirst({ where: eq(emailDeliveriesTable.dedupeKey, input.dedupeKey) });
      if (!existing) throw error;
      return { delivery: existing, created: false };
    }
    throw error;
  }
}


async function updateCampaignProgress(campaignId: string | null | undefined): Promise<void> {
  if (!campaignId) return;
  await pool.query(
    `UPDATE email_campaigns
     SET sent_count = counts.sent_count,
         failed_count = counts.failed_count,
         status = CASE
           WHEN counts.sent_count + counts.failed_count >= recipient_count THEN 'completed'
           ELSE status
         END,
         completed_at = CASE
           WHEN counts.sent_count + counts.failed_count >= recipient_count THEN COALESCE(completed_at, now())
           ELSE completed_at
         END,
         updated_at = now()
     FROM (
       SELECT
         count(*) FILTER (WHERE status = 'sent')::int AS sent_count,
         count(*) FILTER (WHERE status IN ('failed','suppressed'))::int AS failed_count
       FROM email_deliveries WHERE campaign_id = $1
     ) counts
     WHERE email_campaigns.id = $1`,
    [campaignId],
  );
}

function unsubscribeUrl(userId: string | null | undefined): string | undefined {
  const base = apiPublicUrl();
  if (!base || !userId) return undefined;
  const token = signPurposeToken({ userId, role: "email", purpose: "marketing_unsubscribe" }, "365d");
  return `${base}/api/email/unsubscribe?token=${encodeURIComponent(token)}`;
}

async function deliverRecord(deliveryId: string): Promise<void> {
  const delivery = await db.query.emailDeliveriesTable.findFirst({ where: eq(emailDeliveriesTable.id, deliveryId) });
  if (!delivery || delivery.status === "sent" || delivery.status === "suppressed") return;

  const suppression = await shouldSuppress({
    userId: delivery.userId,
    to: delivery.toEmail,
    templateKey: delivery.templateKey,
    variables: delivery.variables || {},
    category: delivery.category as EmailCategory,
    campaignId: delivery.campaignId,
    metadata: (delivery.metadata || {}) as Record<string, unknown>,
  });
  if (suppression.suppress) {
    await db.update(emailDeliveriesTable).set({
      status: "suppressed",
      lastError: suppression.reason || "suppressed",
      failedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(emailDeliveriesTable.id, delivery.id));
    await updateCampaignProgress(delivery.campaignId);
    return;
  }

  const attempts = Number(delivery.attempts || 0) + 1;
  await db.update(emailDeliveriesTable).set({ status: "sending", attempts, updatedAt: new Date() }).where(eq(emailDeliveriesTable.id, delivery.id));
  const marketingUnsubscribeUrl = delivery.category === "marketing" ? unsubscribeUrl(delivery.userId) : undefined;
  const rendered = await renderEmailTemplate(delivery.templateKey, delivery.variables || {}, {
    unsubscribeUrl: marketingUnsubscribeUrl,
  });
  const result = await sendEmail({
    to: delivery.toEmail,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
    headers: marketingUnsubscribeUrl
      ? {
          "List-Unsubscribe": `<${marketingUnsubscribeUrl}>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        }
      : undefined,
  });
  if (!result.ok) {
    const finalAttempt = attempts >= Number(delivery.maxAttempts || 4);
    await db.update(emailDeliveriesTable).set({
      status: finalAttempt ? "failed" : "retrying",
      provider: result.provider,
      subject: rendered.subject,
      lastError: result.errorCode || "EMAIL_SEND_FAILED",
      ...(finalAttempt ? { failedAt: new Date() } : {}),
      updatedAt: new Date(),
    }).where(eq(emailDeliveriesTable.id, delivery.id));
    if (finalAttempt) await updateCampaignProgress(delivery.campaignId);
    throw new Error(result.errorCode || "Email delivery failed");
  }

  await db.update(emailDeliveriesTable).set({
    status: "sent",
    provider: result.provider,
    providerMessageId: result.messageId || null,
    subject: rendered.subject,
    lastError: null,
    sentAt: new Date(),
    updatedAt: new Date(),
  }).where(eq(emailDeliveriesTable.id, delivery.id));

  await updateCampaignProgress(delivery.campaignId);
}

registerJobHandler<{ deliveryId: string }>(EMAIL_JOB_NAME, async (payload) => {
  if (!payload?.deliveryId) throw new Error("Email delivery job is missing deliveryId");
  await deliverRecord(payload.deliveryId);
});

registerJobHandler<{ campaignId: string }>(EMAIL_CAMPAIGN_JOB_NAME, async (payload) => {
  if (!payload?.campaignId) throw new Error("Email campaign job is missing campaignId");
  try {
    await queueCampaignRecipients(payload.campaignId);
  } catch (error) {
    await db.update(emailCampaignsTable).set({ status: "failed", updatedAt: new Date() })
      .where(and(eq(emailCampaignsTable.id, payload.campaignId), or(eq(emailCampaignsTable.status, "queued"), eq(emailCampaignsTable.status, "sending"), eq(emailCampaignsTable.status, "failed"))));
    throw error;
  }
});

export async function scheduleEmailCampaign(campaignId: string, scheduledAt?: Date | null, dispatchKey = crypto.randomUUID()): Promise<string> {
  const delayMs = scheduledAt ? Math.max(0, scheduledAt.getTime() - Date.now()) : 0;
  return enqueueJob(EMAIL_CAMPAIGN_JOB_NAME, { campaignId }, {
    attempts: 1,
    delayMs,
    dedupeKey: `email-campaign:${campaignId}:${dispatchKey}`,
  });
}

export async function queueEmail(input: QueueEmailInput): Promise<{ queued: boolean; deliveryId: string; suppressed?: string }> {
  const suppression = await shouldSuppress(input);
  const created = await createDelivery(input, suppression.suppress ? "suppressed" : "queued", suppression.reason);
  const delivery = created.delivery;
  if (!created.created) {
    if (delivery.status === "suppressed") return { queued: false, deliveryId: delivery.id, suppressed: delivery.lastError || "suppressed" };
    return { queued: new Set(["queued", "sending", "retrying"]).has(delivery.status), deliveryId: delivery.id };
  }
  if (suppression.suppress) {
    await updateCampaignProgress(input.campaignId);
    return { queued: false, deliveryId: delivery.id, suppressed: suppression.reason };
  }
  try {
    await enqueueJob(EMAIL_JOB_NAME, { deliveryId: delivery.id }, {
      attempts: Number(delivery.maxAttempts || 4),
      dedupeKey: `email-delivery:${delivery.id}`,
    });
  } catch (error) {
    await db.update(emailDeliveriesTable).set({
      status: "failed",
      lastError: "EMAIL_QUEUE_ENQUEUE_FAILED",
      failedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(emailDeliveriesTable.id, delivery.id)).catch(() => undefined);
    await updateCampaignProgress(input.campaignId).catch(() => undefined);
    throw error;
  }
  return { queued: true, deliveryId: delivery.id };
}

export async function deliverEmailNow(input: ImmediateEmailInput): Promise<{ ok: boolean; deliveryId: string; errorCode?: string }> {
  const suppression = await shouldSuppress(input);
  const created = await createDelivery(input, suppression.suppress ? "suppressed" : "sending", suppression.reason);
  const delivery = created.delivery;
  if (!created.created) {
    return {
      ok: delivery.status === "sent",
      deliveryId: delivery.id,
      ...(delivery.status === "sent" ? {} : { errorCode: delivery.lastError || "EMAIL_DELIVERY_ALREADY_EXISTS" }),
    };
  }
  if (suppression.suppress) {
    await updateCampaignProgress(input.campaignId);
    return { ok: false, deliveryId: delivery.id, errorCode: suppression.reason };
  }

  const variables = { ...(input.variables || {}) };
  if (input.subjectOverride) variables.subject = input.subjectOverride;
  if (input.bodyOverride) variables.body = input.bodyOverride;
  const marketingUnsubscribeUrl = input.category === "marketing" ? unsubscribeUrl(input.userId) : undefined;
  const rendered = await renderEmailTemplate(input.templateKey, variables, {
    unsubscribeUrl: marketingUnsubscribeUrl,
  });
  const result = await sendEmail({
    to: normalizeEmail(input.to),
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
    headers: marketingUnsubscribeUrl
      ? {
          "List-Unsubscribe": `<${marketingUnsubscribeUrl}>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        }
      : undefined,
  });
  await db.update(emailDeliveriesTable).set({
    attempts: 1,
    provider: result.provider,
    providerMessageId: result.messageId || null,
    subject: rendered.subject,
    status: result.ok ? "sent" : "failed",
    lastError: result.ok ? null : result.errorCode || "EMAIL_SEND_FAILED",
    ...(result.ok ? { sentAt: new Date() } : { failedAt: new Date() }),
    updatedAt: new Date(),
  }).where(eq(emailDeliveriesTable.id, delivery.id));
  await updateCampaignProgress(input.campaignId);
  return { ok: result.ok, deliveryId: delivery.id, errorCode: result.errorCode };
}

export async function queueCampaignRecipients(campaignId: string): Promise<{ recipients: number; queued: number; suppressed: number }> {
  const campaign = await db.query.emailCampaignsTable.findFirst({ where: eq(emailCampaignsTable.id, campaignId) });
  if (!campaign) throw new Error("Campaign not found");
  if (campaign.status === "cancelled" || campaign.status === "completed") return { recipients: 0, queued: 0, suppressed: 0 };
  if (!new Set(["queued", "sending", "failed"]).has(campaign.status)) throw new Error(`Campaign cannot be processed from status ${campaign.status}`);
  if (process.env.EMAIL_MARKETING_ENABLED !== "true") throw new Error("Marketing email delivery is disabled by configuration");
  const configuredMax = Math.max(1, Math.min(10_000, Number(process.env.EMAIL_MARKETING_MAX_RECIPIENTS || 500)));
  const roleCondition = campaign.audience === "customer" || campaign.audience === "provider"
    ? eq(usersTable.role, campaign.audience)
    : or(eq(usersTable.role, "customer"), eq(usersTable.role, "provider"));
  const audienceCondition = campaign.audience === "premium"
    ? and(roleCondition, eq(usersTable.isPremium, true))
    : roleCondition;
  const users = await db.query.usersTable.findMany({
    where: and(
      eq(usersTable.emailVerified, true),
      eq(usersTable.accountStatus, "active"),
      eq(usersTable.isBlocked, false),
      eq(usersTable.isDeactivated, false),
      audienceCondition,
    ),
    orderBy: desc(usersTable.joinedAt),
    limit: configuredMax,
  });
  const filtered = users.filter((user) => Boolean(user.email));

  await db.update(emailCampaignsTable).set({ status: "sending", startedAt: campaign.startedAt || new Date(), recipientCount: filtered.length, updatedAt: new Date() }).where(eq(emailCampaignsTable.id, campaign.id));
  let queued = 0;
  let suppressed = 0;
  for (const user of filtered) {
    const result = await queueEmail({
      userId: user.id,
      to: user.email!,
      templateKey: "campaign_custom",
      category: campaign.category === "product" ? "product" : "marketing",
      campaignId: campaign.id,
      dedupeKey: `campaign:${campaign.id}:user:${user.id}`,
      variables: { name: user.name, subject: campaign.subject, body: campaign.body, category: campaign.category },
      metadata: { audience: campaign.audience },
    });
    if (result.queued) queued += 1;
    else if (result.suppressed) suppressed += 1;
  }
  await db.update(emailCampaignsTable).set({
    status: queued > 0 ? "sending" : "completed",
    failedCount: suppressed,
    ...(queued === 0 ? { completedAt: new Date() } : {}),
    updatedAt: new Date(),
  }).where(eq(emailCampaignsTable.id, campaign.id));
  await updateCampaignProgress(campaign.id);
  logger.info({ campaignId, recipients: filtered.length, queued, suppressed }, "email campaign recipients queued");
  return { recipients: filtered.length, queued, suppressed };
}
