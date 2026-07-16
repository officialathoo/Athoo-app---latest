import { isOwnedUploadObjectPath, normalizeStoredObjectPath } from "../lib/storageSecurity";
import { Router } from "express";
import { logger } from "../lib/logger";
import { notifyUser } from "../lib/notifications";
import crypto from "crypto";
import { db } from "@workspace/db";
import {
  subscriptionPlansTable,
  userSubscriptionsTable,
  usersTable,
  adminNotificationsTable,
  auditLogTable,
  financeLedgerTable,
} from "@workspace/db/schema";
import { and, asc, desc, eq, ilike, ne } from "drizzle-orm";
import {
  requireAuth,
  requireAdmin,
  requirePermission,
  type AuthRequest,
} from "../middlewares/auth";

async function getAdminName(userId: string): Promise<string> {
  try {
    const row = await db.query.usersTable.findFirst({ where: eq(usersTable.id, userId) });
    return row?.name || userId;
  } catch {
    return userId;
  }
}

const router = Router();
const id = () => crypto.randomUUID();

function validatePlanInput(body: Record<string, unknown>, creating = false): string | null {
  const name = String(body.name ?? "").trim();
  const monthly = Number(body.priceMonthly ?? 0);
  const yearly = Number(body.priceYearly ?? 0);
  const audience = String(body.audience ?? "provider");
  const features = Array.isArray(body.features) ? body.features.map(String).map((x) => x.trim()).filter(Boolean) : [];
  if (creating && (name.length < 2 || name.length > 100)) return "Plan name must be 2-100 characters";
  if (body.name !== undefined && (name.length < 2 || name.length > 100)) return "Plan name must be 2-100 characters";
  if (!Number.isInteger(monthly) || monthly < 0 || monthly > 10_000_000) return "Invalid monthly price";
  if (!Number.isInteger(yearly) || yearly < 0 || yearly > 100_000_000) return "Invalid yearly price";
  if (yearly > 0 && monthly > 0 && yearly < monthly) return "Yearly price cannot be lower than one monthly payment";
  if (!new Set(["provider", "customer", "both"]).has(audience)) return "Invalid plan audience";
  if (features.length > 30 || features.some((item) => item.length > 160)) return "Plan features are invalid";
  return null;
}

async function auditSubscription(req: AuthRequest, action: string, targetId: string, details: Record<string, unknown> = {}) {
  const adminName = await getAdminName(req.user!.userId);
  await db.insert(auditLogTable).values({ id: id(), adminId: req.user!.userId, adminName, action, target: "subscription", targetId, details, ip: req.ip ?? null });
}

// PUBLIC — list plans (logged-out users may also browse pricing)
router.get("/plans", async (req, res) => {
  const requestedAudience = String(req.query.audience || "");
  const rows = await db
    .select()
    .from(subscriptionPlansTable)
    .where(eq(subscriptionPlansTable.isActive, true))
    .orderBy(asc(subscriptionPlansTable.sortOrder), asc(subscriptionPlansTable.priceMonthly));
  const plans = requestedAudience === "provider" || requestedAudience === "customer"
    ? rows.filter((plan) => plan.audience === requestedAudience || plan.audience === "both")
    : rows;
  return res.json({ plans });
});

router.use(requireAuth);

// MY current subscription
router.get("/me", async (req: AuthRequest, res) => {
  const rows = await db
    .select()
    .from(userSubscriptionsTable)
    .where(eq(userSubscriptionsTable.userId, req.user!.userId))
    .orderBy(desc(userSubscriptionsTable.createdAt));
  const active = rows.find((r) => r.status === "active" || r.status === "cancellation_scheduled") ?? null;
  return res.json({ active, history: rows });
});

// SUBSCRIBE — creates a pending payment row, admin approves to activate
router.post("/subscribe", async (req: AuthRequest, res) => {
  try {
    const { planId, billingPeriod, paymentReference, screenshotUrl, clientRequestId } = req.body ?? {};
    const requestId = String(clientRequestId || "").trim();
    if (!requestId || requestId.length > 100) return res.status(400).json({ error: "clientRequestId is required" });
    const existingRequest = await db.query.userSubscriptionsTable.findFirst({ where: and(eq(userSubscriptionsTable.userId, req.user!.userId), eq(userSubscriptionsTable.clientRequestId, requestId)) });
    if (existingRequest) return res.json({ subscriptionId: existingRequest.id, duplicate: true });
    const plan = await db.query.subscriptionPlansTable.findFirst({
      where: eq(subscriptionPlansTable.id, String(planId ?? "")),
    });
    if (!plan || !plan.isActive) return res.status(404).json({ error: "Plan not found" });
    if (plan.audience !== "both" && plan.audience !== req.user!.role) {
      return res.status(403).json({ error: "This plan is not available for your account type" });
    }
    const period = billingPeriod === "yearly" ? "yearly" : "monthly";
    const amount = period === "yearly" ? plan.priceYearly ?? 0 : plan.priceMonthly ?? 0;
    if (amount > 0 && !String(paymentReference || "").trim()) {
      return res.status(400).json({ error: "Payment reference is required" });
    }
    if (amount > 0 && !String(screenshotUrl || "").trim()) {
      return res.status(400).json({ error: "Payment screenshot is required" });
    }
    const normalizedScreenshotUrl = normalizeStoredObjectPath(screenshotUrl);
    if (normalizedScreenshotUrl && !isOwnedUploadObjectPath(normalizedScreenshotUrl, req.user!.userId, ["private"])) {
      return res.status(400).json({ error: "Payment screenshot must be uploaded through your private Athoo storage" });
    }
    const pending = await db.query.userSubscriptionsTable.findFirst({ where: and(eq(userSubscriptionsTable.userId, req.user!.userId), eq(userSubscriptionsTable.status, "pending")) });
    if (pending) return res.status(409).json({ error: "You already have a pending subscription payment" });
    const newId = id();
    await db.insert(userSubscriptionsTable).values({
      id: newId,
      userId: req.user!.userId,
      planId: plan.id,
      billingPeriod: period,
      status: "pending",
      amount,
      paymentReference: paymentReference ? String(paymentReference) : null,
      screenshotUrl: normalizedScreenshotUrl || null,
      clientRequestId: requestId,
    });
    await db.insert(adminNotificationsTable).values({
      id: id(),
      title: "New subscription payment",
      message: `User submitted a ${period} payment for plan "${plan.name}"`,
      type: "info",
      link: `/admin/subscriptions/${newId}`,
    });
    return res.status(201).json({ subscriptionId: newId });
  } catch (e: any) {
    if (e?.code === "23505") {
      const requestId = String(req.body?.clientRequestId || "").trim();
      if (requestId) {
        const existing = await db.query.userSubscriptionsTable.findFirst({
          where: and(
            eq(userSubscriptionsTable.userId, req.user!.userId),
            eq(userSubscriptionsTable.clientRequestId, requestId),
          ),
        });
        if (existing) return res.json({ subscriptionId: existing.id, duplicate: true });
      }
      return res.status(409).json({ error: "A subscription request is already pending" });
    }
    logger.error({ err: e }, "subscriptions.subscribe error");
    return res.status(500).json({ error: "Failed to subscribe" });
  }
});

router.post("/cancel", async (req: AuthRequest, res) => {
  try {
    // Cancellation must never immediately strip already-paid Premium: benefits
    // already paid for stay active until the existing expiry date, with no
    // automatic refund. We only mark the row so the expiry sweep finalizes it
    // to "cancelled" (instead of "expired") once premiumExpiresAt passes.
    const alreadyScheduled = await db.query.userSubscriptionsTable.findFirst({
      where: and(eq(userSubscriptionsTable.userId, req.user!.userId), eq(userSubscriptionsTable.status, "cancellation_scheduled")),
    });
    if (alreadyScheduled) {
      return res.json({ success: true, effectiveAt: alreadyScheduled.expiresAt });
    }
    const [scheduled] = await db
      .update(userSubscriptionsTable)
      .set({ status: "cancellation_scheduled", updatedAt: new Date() })
      .where(
        and(
          eq(userSubscriptionsTable.userId, req.user!.userId),
          eq(userSubscriptionsTable.status, "active"),
        ),
      )
      .returning();
    if (!scheduled) {
      // No active subscription to cancel (idempotent no-op rather than an error).
      return res.json({ success: true });
    }
    const effectiveLabel = scheduled.expiresAt ? new Date(scheduled.expiresAt).toLocaleDateString() : "your current expiry date";
    notifyUser({
      userId: req.user!.userId,
      title: "Cancellation scheduled",
      body: "Your Premium subscription will not renew. You keep your benefits until " + effectiveLabel + ". No refund is issued for the remaining period.",
      type: "premium",
      link: "/premium",
      data: { subscriptionId: scheduled.id, effectiveAt: scheduled.expiresAt },
    
      email: { category: "transactional" },
    }).catch(() => undefined);
    return res.json({ success: true, effectiveAt: scheduled.expiresAt });
  } catch (e) {
    logger.error({ err: e }, "subscriptions.cancel error");
    return res.status(500).json({ error: "Failed to cancel subscription" });
  }
});

// ADMIN sub-router
const adminRouter = Router();
adminRouter.use(requireAuth, requireAdmin);

adminRouter.get("/plans", requirePermission("settings.read"), async (_req, res) => {
  const rows = await db
    .select()
    .from(subscriptionPlansTable)
    .orderBy(asc(subscriptionPlansTable.sortOrder), asc(subscriptionPlansTable.priceMonthly));
  return res.json({ plans: rows });
});

adminRouter.post("/plans", requirePermission("settings.write"), async (req: AuthRequest, res) => {
  try {
    const { name, description, audience, priceMonthly, priceYearly, features, isActive, sortOrder } = req.body ?? {};
    const validationError = validatePlanInput(req.body ?? {}, true);
    if (validationError) return res.status(400).json({ error: validationError });
    const duplicateName = await db.query.subscriptionPlansTable.findFirst({ where: ilike(subscriptionPlansTable.name, String(name).trim()) });
    if (duplicateName) return res.status(409).json({ error: "A plan with this name already exists" });
    const newId = id();
    await db.insert(subscriptionPlansTable).values({
      id: newId,
      name: name.trim(),
      description: description ? String(description) : null,
      audience: audience === "customer" || audience === "both" ? audience : "provider",
      priceMonthly: Number(priceMonthly) || 0,
      priceYearly: Number(priceYearly) || 0,
      features: Array.isArray(features) ? features.map(String) : [],
      isActive: isActive !== false,
      sortOrder: Number(sortOrder) || 0,
    });
    const adminDisplayName = await getAdminName(req.user!.userId);
    await db.insert(auditLogTable).values({
      id: id(),
      adminId: req.user!.userId,
      adminName: adminDisplayName,
      action: "plan.create",
      target: "subscription_plan",
      targetId: newId,
      ip: req.ip ?? null,
    });
    const row = await db.query.subscriptionPlansTable.findFirst({
      where: eq(subscriptionPlansTable.id, newId),
    });
    return res.status(201).json({ plan: row });
  } catch (e) {
    logger.error({ err: e }, "subscriptions.plan.create error");
    return res.status(500).json({ error: "Failed to create plan" });
  }
});

adminRouter.patch("/plans/:id", requirePermission("settings.write"), async (req: AuthRequest, res) => {
  try {
    const plan = await db.query.subscriptionPlansTable.findFirst({
      where: eq(subscriptionPlansTable.id, req.params.id),
    });
    if (!plan) return res.status(404).json({ error: "Plan not found" });
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    const { name, description, audience, priceMonthly, priceYearly, features, isActive, sortOrder } = req.body ?? {};
    const validationError = validatePlanInput({ ...plan, ...req.body }, false);
    if (validationError) return res.status(400).json({ error: validationError });
    if (name !== undefined) {
      const duplicateName = await db.query.subscriptionPlansTable.findFirst({ where: and(ilike(subscriptionPlansTable.name, String(name).trim()), ne(subscriptionPlansTable.id, plan.id)) });
      if (duplicateName) return res.status(409).json({ error: "A plan with this name already exists" });
    }
    if (typeof name === "string" && name.trim()) patch.name = name.trim();
    if (typeof description === "string") patch.description = description;
    if (audience === "provider" || audience === "customer" || audience === "both") patch.audience = audience;
    if (Number.isFinite(Number(priceMonthly))) patch.priceMonthly = Number(priceMonthly);
    if (Number.isFinite(Number(priceYearly))) patch.priceYearly = Number(priceYearly);
    if (Array.isArray(features)) patch.features = features.map(String);
    if (typeof isActive === "boolean") patch.isActive = isActive;
    if (Number.isFinite(Number(sortOrder))) patch.sortOrder = Number(sortOrder);
    await db.update(subscriptionPlansTable).set(patch).where(eq(subscriptionPlansTable.id, plan.id));
    const row = await db.query.subscriptionPlansTable.findFirst({ where: eq(subscriptionPlansTable.id, plan.id) });
    await auditSubscription(req, "plan.update", plan.id, { before: plan, after: row });
    return res.json({ plan: row });
  } catch (e) {
    logger.error({ err: e }, "subscriptions.plan.update error");
    return res.status(500).json({ error: "Failed to update plan" });
  }
});

adminRouter.delete("/plans/:id", requirePermission("settings.write"), async (req: AuthRequest, res) => {
  const [plan] = await db.update(subscriptionPlansTable).set({ isActive: false, updatedAt: new Date() }).where(eq(subscriptionPlansTable.id, req.params.id)).returning();
  if (!plan) return res.status(404).json({ error: "Plan not found" });
  await auditSubscription(req, "plan.deactivate", plan.id, { name: plan.name });
  return res.json({ success: true, plan });
});

// Subscription review
adminRouter.get("/", requirePermission("finance.read"), async (req, res) => {
  const status = String(req.query.status ?? "");
  const where = status ? eq(userSubscriptionsTable.status, status) : undefined;
  const rows = await db
    .select()
    .from(userSubscriptionsTable)
    .where(where as any)
    .orderBy(desc(userSubscriptionsTable.createdAt))
    .limit(200);
  return res.json({ subscriptions: rows });
});

adminRouter.post("/:id/approve", requirePermission("finance.write"), async (req: AuthRequest, res) => {
  try {
    const sub = await db.query.userSubscriptionsTable.findFirst({
      where: eq(userSubscriptionsTable.id, req.params.id),
    });
    if (!sub) return res.status(404).json({ error: "Subscription not found" });
    if (sub.status !== "pending") return res.status(409).json({ error: "Only pending subscriptions can be approved" });
    if (sub.amount > 0 && !sub.paymentReference) return res.status(400).json({ error: "Payment reference is missing" });
    const plan = await db.query.subscriptionPlansTable.findFirst({ where: eq(subscriptionPlansTable.id, sub.planId) });
    if (!plan || !plan.isActive) return res.status(409).json({ error: "This plan is no longer active" });
    const subscriber = await db.query.usersTable.findFirst({ where: eq(usersTable.id, sub.userId) });
    if (!subscriber || !["customer", "provider"].includes(subscriber.role)) {
      return res.status(409).json({ error: "Subscriber account is unavailable" });
    }
    if (plan.audience !== "both" && plan.audience !== subscriber.role) {
      return res.status(409).json({ error: "Plan audience no longer matches the subscriber" });
    }
    const startedAt = new Date();
    const expiresAt = new Date(
      startedAt.getTime() +
        (sub.billingPeriod === "yearly" ? 365 : 30) * 24 * 60 * 60 * 1000,
    );
    await db.transaction(async (tx) => {
      await tx.update(userSubscriptionsTable).set({ status: "expired", updatedAt: new Date() })
        .where(and(eq(userSubscriptionsTable.userId, sub.userId), eq(userSubscriptionsTable.status, "active")));
      await tx.update(userSubscriptionsTable).set({ status: "cancelled", updatedAt: new Date() })
        .where(and(eq(userSubscriptionsTable.userId, sub.userId), eq(userSubscriptionsTable.status, "cancellation_scheduled")));
      const activated = await tx.update(userSubscriptionsTable).set({
          status: "active",
          startedAt,
          expiresAt,
          reviewedBy: req.user!.userId,
          reviewedAt: new Date(),
          updatedAt: new Date(),
        }).where(and(eq(userSubscriptionsTable.id, sub.id), eq(userSubscriptionsTable.status, "pending"))).returning();
      if (activated.length === 0) throw new Error("SUBSCRIPTION_CONFLICT");
      await tx
        .update(usersTable)
        .set({
          isPremium: true,
          premiumPlanId: sub.planId,
          premiumExpiresAt: expiresAt,
          premiumReminderSentAt: null,
          updatedAt: new Date(),
        })
        .where(eq(usersTable.id, sub.userId));
      if (sub.amount > 0) {
        await tx.insert(financeLedgerTable).values({
          id: id(), entryType: "subscription_received", referenceType: "user_subscription",
          referenceId: sub.id, customerId: subscriber.role === "customer" ? sub.userId : null,
          providerId: subscriber.role === "provider" ? sub.userId : null, amount: sub.amount,
          paymentReference: sub.paymentReference, note: `${plan.name} (${sub.billingPeriod})`,
          createdBy: req.user!.userId, occurredAt: new Date(),
        }).onConflictDoNothing({ target: [financeLedgerTable.referenceType, financeLedgerTable.referenceId] });
      }
    });
    notifyUser({
      userId: sub.userId,
      title: "Premium activated",
      body: `Your ${plan.name} subscription is now active.`,
      type: "premium",
      link: "/premium",
      data: { subscriptionId: sub.id, planId: sub.planId },
    
      email: { category: "transactional" },
    }).catch(() => undefined);
    await auditSubscription(req, "subscription.approve", sub.id, { userId: sub.userId, planId: sub.planId, amount: sub.amount });
    return res.json({ success: true });
  } catch (e) {
    if (e instanceof Error && e.message === "SUBSCRIPTION_CONFLICT") return res.status(409).json({ error: "Subscription was already processed" });
    logger.error({ err: e }, "subscriptions.approve error");
    return res.status(500).json({ error: "Failed to approve" });
  }
});

adminRouter.post("/:id/reject", requirePermission("finance.write"), async (req: AuthRequest, res) => {
  const reason = String(req.body?.reason ?? "").trim();
  if (reason.length < 5 || reason.length > 500) return res.status(400).json({ error: "Rejection reason must be 5-500 characters" });
  const sub = await db.query.userSubscriptionsTable.findFirst({
    where: eq(userSubscriptionsTable.id, req.params.id),
  });
  if (!sub) return res.status(404).json({ error: "Subscription not found" });
  if (sub.status !== "pending") return res.status(409).json({ error: "Only pending subscriptions can be rejected" });
  const rejected = await db.update(userSubscriptionsTable).set({
      status: "rejected",
      rejectionNote: reason || null,
      reviewedBy: req.user!.userId,
      reviewedAt: new Date(),
      updatedAt: new Date(),
    }).where(and(eq(userSubscriptionsTable.id, sub.id), eq(userSubscriptionsTable.status, "pending"))).returning();
  if (rejected.length === 0) return res.status(409).json({ error: "Subscription was already processed" });
  await auditSubscription(req, "subscription.reject", sub.id, { userId: sub.userId, reason });
  notifyUser({
    userId: sub.userId,
    title: "Subscription rejected",
    body: reason || "Your subscription payment could not be verified.",
    type: "premium",
    link: "/premium",
    data: { subscriptionId: sub.id },
  
    email: { category: "transactional" },
  }).catch(() => undefined);
  return res.json({ success: true });
});

export { adminRouter as subscriptionsAdminRouter };
export default router;

export async function seedSubscriptionPlansIfEmpty() {
  try {
    const existing = await db.select().from(subscriptionPlansTable).limit(1);
    if (existing.length > 0) return;
    await db.insert(subscriptionPlansTable).values([
      {
        id: crypto.randomUUID(),
        name: "Customer Basic",
        description: "Perfect for occasional home service bookings",
        audience: "customer",
        priceMonthly: 299,
        priceYearly: 2990,
        features: ["Priority booking", "Free cancellation (2x/month)", "Dedicated support", "Rs. 200 discount per visit"],
        isActive: true,
        sortOrder: 1,
      },
      {
        id: crypto.randomUUID(),
        name: "Customer Premium",
        description: "Best value for regular home service users",
        audience: "customer",
        priceMonthly: 599,
        priceYearly: 5990,
        features: ["Priority booking", "Free cancellation (unlimited)", "VIP support", "Rs. 500 discount per visit", "Exclusive deals", "Home manager dashboard"],
        isActive: true,
        sortOrder: 2,
      },
      {
        id: crypto.randomUUID(),
        name: "Provider Starter",
        description: "Start receiving more orders",
        audience: "provider",
        priceMonthly: 499,
        priceYearly: 4990,
        features: ["Featured listing", "Priority leads", "Rs. 5,000/month commission limit", "Profile badge"],
        isActive: true,
        sortOrder: 3,
      },
      {
        id: crypto.randomUUID(),
        name: "Provider Pro",
        description: "Grow your business with maximum visibility",
        audience: "provider",
        priceMonthly: 999,
        priceYearly: 9990,
        features: ["Top-of-search listing", "Unlimited priority leads", "Rs. 10,000/month commission limit", "⭐ Premium badge", "Analytics dashboard", "Dedicated account manager"],
        isActive: true,
        sortOrder: 4,
      },
    ]);
  } catch {
    // non-fatal
  }
}

