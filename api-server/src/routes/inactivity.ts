import crypto from "crypto";
import { Router } from "express";
import { db } from "@workspace/db";
import { auditLogTable, usersTable } from "@workspace/db/schema";
import { and, asc, desc, eq, ilike, or, sql } from "drizzle-orm";
import { requireAdmin, requireAuth, requirePermission, type AuthRequest } from "../middlewares/auth";
import { queueEmail } from "../lib/emailDelivery";
import { sweepInactiveAccounts } from "../lib/inactivityLifecycle";
import { logger } from "../lib/logger";
import { notifyUser } from "../lib/notifications";
import { revokeAllUserSessions } from "../lib/session";

const router = Router();
router.use(requireAuth, requireAdmin);
const STATES = new Set(["all", "warning", "restricted", "review"]);

async function audit(req: AuthRequest, action: string, userId: string, details: Record<string, unknown>) {
  const admin = await db.query.usersTable.findFirst({ where: eq(usersTable.id, req.user!.userId) });
  await db.insert(auditLogTable).values({
    id: crypto.randomUUID(),
    adminId: req.user!.userId,
    adminName: admin?.name || "Admin",
    adminRole: admin?.adminRole || null,
    action,
    target: "user",
    targetId: userId,
    details,
    ip: req.ip || null,
  });
}

router.get("/", requirePermission("users.read"), async (req, res) => {
  try {
    const requestedState = String(req.query.state || "review");
    const state = STATES.has(requestedState) ? requestedState : "review";
    const search = String(req.query.search || "").trim();
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25));
    const offset = (page - 1) * limit;
    const conditions: any[] = [
      or(eq(usersTable.role, "customer"), eq(usersTable.role, "provider")),
      eq(usersTable.accountStatus, "active"),
      eq(usersTable.isDeactivated, false),
      eq(usersTable.isBlocked, false),
    ];
    if (state !== "all") conditions.push(eq(usersTable.inactivityState, state));
    else conditions.push(or(eq(usersTable.inactivityState, "warning"), eq(usersTable.inactivityState, "restricted"), eq(usersTable.inactivityState, "review")));
    if (search) conditions.push(or(
      ilike(usersTable.name, `%${search}%`),
      ilike(usersTable.phone, `%${search}%`),
      ilike(usersTable.email, `%${search}%`),
    ));
    const where = and(...conditions);
    const [users, [countRow], [summary]] = await Promise.all([
      db.select({
        id: usersTable.id,
        name: usersTable.name,
        phone: usersTable.phone,
        email: usersTable.email,
        role: usersTable.role,
        location: usersTable.location,
        isAvailable: usersTable.isAvailable,
        lastActiveAt: usersTable.lastActiveAt,
        inactivityState: usersTable.inactivityState,
        inactivityWarningSentAt: usersTable.inactivityWarningSentAt,
        inactivityRestrictedAt: usersTable.inactivityRestrictedAt,
        inactivityReviewAt: usersTable.inactivityReviewAt,
        joinedAt: usersTable.joinedAt,
      }).from(usersTable).where(where).orderBy(asc(usersTable.lastActiveAt), asc(usersTable.name)).limit(limit).offset(offset),
      db.select({ total: sql<number>`count(*)::int` }).from(usersTable).where(where),
      db.select({
        warning: sql<number>`count(*) filter (where ${usersTable.inactivityState} = 'warning')::int`,
        restricted: sql<number>`count(*) filter (where ${usersTable.inactivityState} = 'restricted')::int`,
        review: sql<number>`count(*) filter (where ${usersTable.inactivityState} = 'review')::int`,
      }).from(usersTable).where(and(
        or(eq(usersTable.role, "customer"), eq(usersTable.role, "provider")),
        eq(usersTable.accountStatus, "active"),
        eq(usersTable.isDeactivated, false),
        eq(usersTable.isBlocked, false),
      )),
    ]);
    return res.json({ users, total: Number(countRow?.total || 0), page, limit, summary: summary || { warning: 0, restricted: 0, review: 0 } });
  } catch (error) {
    logger.error({ err: error }, "inactive account list failed");
    return res.status(500).json({ error: "Failed to load inactive accounts" });
  }
});

router.post("/sweep", requirePermission("settings.write"), async (req: AuthRequest, res) => {
  try {
    const result = await sweepInactiveAccounts(true);
    await audit(req, "inactivity_sweep_triggered", "system", result);
    return res.json({ result });
  } catch (error) {
    logger.error({ err: error }, "manual inactivity sweep failed");
    return res.status(500).json({ error: "Failed to run inactivity review" });
  }
});

router.post("/:id/remind", requirePermission("users.write"), async (req: AuthRequest, res) => {
  try {
    const user = await db.query.usersTable.findFirst({ where: eq(usersTable.id, req.params.id) });
    if (!user || user.role === "admin") return res.status(404).json({ error: "User not found" });
    if (!user.inactivityState || user.inactivityState === "active") return res.status(409).json({ error: "This account is not in the inactivity lifecycle" });
    const reason = String(req.body?.reason || "Please sign in to review your Athoo account and keep your profile current.").trim().slice(0, 500);
    await Promise.allSettled([
      notifyUser({ userId: user.id, title: "Athoo account reminder", body: reason, type: "system", link: "/profile", data: { source: "admin_inactivity_review" } }),
      user.email ? queueEmail({
        userId: user.id,
        to: user.email,
        templateKey: "account_status",
        category: "security",
        dedupeKey: `admin-inactivity-reminder:${user.id}:${new Date().toISOString().slice(0, 10)}`,
        variables: { name: user.name, status: "inactive reminder", reason, category: "security" },
      }) : Promise.resolve(),
    ]);
    await audit(req, "inactive_account_reminded", user.id, { reason, previousState: user.inactivityState });
    return res.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, "inactive reminder failed");
    return res.status(500).json({ error: "Failed to send reminder" });
  }
});

router.post("/:id/clear", requirePermission("users.write"), async (req: AuthRequest, res) => {
  try {
    const reason = String(req.body?.reason || "").trim();
    if (reason.length < 5) return res.status(400).json({ error: "A review reason of at least 5 characters is required" });
    const user = await db.query.usersTable.findFirst({ where: eq(usersTable.id, req.params.id) });
    if (!user || user.role === "admin") return res.status(404).json({ error: "User not found" });
    if (!user.inactivityState || user.inactivityState === "active") return res.status(409).json({ error: "This account is not in the inactivity lifecycle" });
    await db.update(usersTable).set({
      inactivityState: "active",
      inactivityWarningSentAt: null,
      inactivityRestrictedAt: null,
      inactivityReviewAt: null,
      lastActiveAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(usersTable.id, user.id));
    await notifyUser({
      userId: user.id,
      title: "Inactivity review cleared",
      body: user.role === "provider" ? "Your account review was cleared. Turn availability on when you are ready to receive jobs." : "Your account review was cleared.",
      type: "system",
      link: "/profile",
      data: { source: "admin_inactivity_review" },
    }).catch(() => undefined);
    await audit(req, "inactive_account_cleared", user.id, { reason, previousState: user.inactivityState });
    return res.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, "inactive review clear failed");
    return res.status(500).json({ error: "Failed to clear inactivity review" });
  }
});

router.post("/:id/deactivate", requirePermission("users.write"), async (req: AuthRequest, res) => {
  try {
    const reason = String(req.body?.reason || "").trim();
    if (reason.length < 10) return res.status(400).json({ error: "A deactivation reason of at least 10 characters is required" });
    const user = await db.query.usersTable.findFirst({ where: eq(usersTable.id, req.params.id) });
    if (!user || user.role === "admin") return res.status(404).json({ error: "User not found" });
    if (!user.inactivityState || user.inactivityState === "active") return res.status(409).json({ error: "This account is not in the inactivity lifecycle" });
    await db.update(usersTable).set({
      isDeactivated: true,
      accountStatus: "deactivated",
      isAvailable: false,
      inactivityState: "review",
      updatedAt: new Date(),
    }).where(eq(usersTable.id, user.id));
    await revokeAllUserSessions(user.id, "inactive_account_deactivated_by_admin");
    await Promise.allSettled([
      notifyUser({ userId: user.id, title: "Account deactivated", body: reason, type: "system", data: { source: "admin_inactivity_review" } }),
      user.email ? queueEmail({
        userId: user.id,
        to: user.email,
        templateKey: "account_status",
        category: "security",
        dedupeKey: `inactive-admin-deactivated:${user.id}:${Date.now()}`,
        variables: { name: user.name, status: "deactivated", reason, category: "security" },
      }) : Promise.resolve(),
    ]);
    await db.update(usersTable).set({ expoPushToken: null, updatedAt: new Date() }).where(eq(usersTable.id, user.id));
    await audit(req, "inactive_account_deactivated", user.id, { reason, previousState: user.inactivityState });
    return res.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, "inactive account deactivation failed");
    return res.status(500).json({ error: "Failed to deactivate inactive account" });
  }
});

export default router;
