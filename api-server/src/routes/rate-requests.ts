import { Router, type Response } from "express";
import { db } from "@workspace/db";
import {
  hourlyRateRequestsTable,
  usersTable,
  serviceCategoriesTable,
  auditLogTable,
  type User,
} from "@workspace/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { requireAuth, requireAdmin, requirePermission, type AuthRequest } from "../middlewares/auth";
import { logger } from "../lib/logger";
import { notifyUser } from "../lib/notifications";
import { emitToRole, emitToUser } from "../lib/eventBus";
import crypto from "crypto";

function generateId(): string { return crypto.randomUUID(); }

const providerRouter = Router();
const adminRouter = Router();

providerRouter.post("/", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    if (req.user!.role !== "provider") return res.status(403).json({ error: "Only providers can request rate changes" });
    const provider = await db.query.usersTable.findFirst({ where: eq(usersTable.id, req.user!.userId) });
    if (!provider) return res.status(404).json({ error: "Provider not found" });
    if (provider.verificationStatus !== "approved" || provider.isBlocked || provider.isDeactivated) {
      return res.status(403).json({ error: "Only active, approved providers can request rate changes" });
    }

    const service = String(req.body?.service || "").trim();
    const requestedRate = Number(req.body?.requestedRate);
    const reason = String(req.body?.reason || "").trim();
    if (!service || !Number.isInteger(requestedRate)) return res.status(400).json({ error: "Rate type and a whole-number requested rate are required" });
    if (reason.length > 500) return res.status(400).json({ error: "Reason must be 500 characters or fewer" });

    const isGeneralRate = service.toLowerCase() === "general";
    if (!isGeneralRate && !(provider.services || []).includes(service)) {
      return res.status(400).json({ error: "You can only request a rate for an approved service" });
    }

    const category = isGeneralRate
      ? null
      : await db.query.serviceCategoriesTable.findFirst({ where: eq(serviceCategoriesTable.slug, service) });
    const minRate = category?.minHourlyRate ?? 100;
    const maxRate = category?.maxHourlyRate ?? 50000;
    if (requestedRate < minRate || requestedRate > maxRate) {
      return res.status(400).json({ error: `Rate must be between Rs. ${minRate} and Rs. ${maxRate} per hour` });
    }
    if (requestedRate === provider.ratePerHour) return res.status(400).json({ error: "Requested rate is already active" });

    const pending = await db.query.hourlyRateRequestsTable.findFirst({
      where: and(eq(hourlyRateRequestsTable.providerId, provider.id), eq(hourlyRateRequestsTable.status, "pending")),
    });
    if (pending) return res.status(409).json({ error: "A rate change request is already pending", rateRequest: pending });

    const rateRequest = {
      id: generateId(), providerId: provider.id, providerName: provider.name,
      service, currentRate: provider.ratePerHour ?? null, requestedRate,
      reason: reason || null, status: "pending",
    };
    await db.insert(hourlyRateRequestsTable).values(rateRequest);
    return res.status(201).json({ rateRequest });
  } catch (e) {
    logger.error({ err: e }, "rate-request create error");
    return res.status(500).json({ error: "Failed to submit rate change request" });
  }
});

providerRouter.get("/", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    if (req.user!.role !== "provider") return res.status(403).json({ error: "Provider account required" });
    const requests = await db.select().from(hourlyRateRequestsTable)
      .where(eq(hourlyRateRequestsTable.providerId, req.user!.userId))
      .orderBy(desc(hourlyRateRequestsTable.createdAt));
    return res.json({ requests });
  } catch {
    return res.status(500).json({ error: "Failed to load rate requests" });
  }
});

adminRouter.use(requireAuth, requireAdmin);

adminRouter.get("/", requirePermission("providers.read"), async (_req, res: Response) => {
  try {
    const requests = await db.select().from(hourlyRateRequestsTable).orderBy(desc(hourlyRateRequestsTable.createdAt));
    return res.json({ requests });
  } catch {
    return res.status(500).json({ error: "Failed to load rate requests" });
  }
});

adminRouter.patch("/:id", requirePermission("providers.write"), async (req: AuthRequest, res: Response) => {
  try {
    const status = String(req.body?.status || "");
    const reviewNote = String(req.body?.reviewNote || "").trim();
    if (!["approved", "rejected"].includes(status)) return res.status(400).json({ error: "Status must be approved or rejected" });
    if (status === "rejected" && reviewNote.length < 3) return res.status(400).json({ error: "A rejection reason is required" });
    if (reviewNote.length > 500) return res.status(400).json({ error: "Review note must be 500 characters or fewer" });

    const request = await db.query.hourlyRateRequestsTable.findFirst({ where: eq(hourlyRateRequestsTable.id, req.params.id as string) });
    if (!request) return res.status(404).json({ error: "Rate request not found" });
    if (request.status !== "pending") return res.status(409).json({ error: "Rate request has already been reviewed" });
    const admin = await db.query.usersTable.findFirst({ where: eq(usersTable.id, req.user!.userId) });

    const updated = await db.transaction(async (tx) => {
      const [changed] = await tx.update(hourlyRateRequestsTable).set({
        status, reviewedBy: req.user!.userId, reviewNote: reviewNote || null,
        reviewedAt: new Date(), updatedAt: new Date(),
      }).where(and(eq(hourlyRateRequestsTable.id, request.id), eq(hourlyRateRequestsTable.status, "pending"))).returning();
      if (!changed) return null;
      let updatedProvider: User | null = null;
      if (status === "approved") {
        const [providerRow] = await tx.update(usersTable)
          .set({ ratePerHour: request.requestedRate, updatedAt: new Date() })
          .where(eq(usersTable.id, request.providerId))
          .returning();
        updatedProvider = providerRow || null;
      }
      await tx.insert(auditLogTable).values({
        id: generateId(), adminId: req.user!.userId, adminName: admin?.name || "Admin",
        adminRole: admin?.adminRole || null, action: `provider_rate.${status}`,
        target: "hourly_rate_request", targetId: request.id,
        details: { providerId: request.providerId, previousRate: request.currentRate, requestedRate: request.requestedRate, service: request.service, reviewNote },
        ip: req.ip || null,
      });
      return { rateRequest: changed, provider: updatedProvider };
    });
    if (!updated) return res.status(409).json({ error: "Rate request was processed by another action" });
    if (status === "approved") {
      const profileUpdatePayload = {
        resource: "providers",
        action: "rate_updated",
        providerId: request.providerId,
        ratePerHour: request.requestedRate,
      };
      emitToRole("customer", "admin:event", profileUpdatePayload);
      emitToUser(request.providerId, "admin:event", profileUpdatePayload);
    }

    notifyUser({
      userId: request.providerId,
      title: status === "approved" ? "Hourly rate approved" : "Hourly rate request rejected",
      body: status === "approved"
        ? `Your hourly rate is now Rs. ${request.requestedRate}.`
        : reviewNote,
      type: "system",
      link: "/profile",
    
      email: { category: "transactional" },
    }).catch(() => undefined);
    return res.json({ rateRequest: updated.rateRequest, provider: updated.provider });
  } catch (e) {
    logger.error({ err: e }, "rate-request review error");
    return res.status(500).json({ error: "Failed to review rate request" });
  }
});

export { providerRouter as rateRequestsProviderRouter, adminRouter as rateRequestsAdminRouter };
export default providerRouter;
