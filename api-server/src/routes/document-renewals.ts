import crypto from "node:crypto";
import { Router, type Response } from "express";
import { db } from "@workspace/db";
import {
  auditLogTable,
  providerDocumentsTable,
  providerDocumentUpdateRequestsTable,
  usersTable,
} from "@workspace/db/schema";
import { and, desc, eq, sql } from "drizzle-orm";
import {
  requireAdmin,
  requireAuth,
  requirePermission,
  type AuthRequest,
} from "../middlewares/auth";
import {
  EXPIRING_DOCUMENT_TYPES,
  loadProviderCompliance,
  persistProviderCompliance,
  type ExpiringDocumentType,
} from "../lib/documentCompliance";
import { createAdminNotification } from "../lib/adminNotifications";
import { validateDocumentValidity } from "../lib/documentValidity";
import { cleanupReplacedOwnedMedia } from "../lib/mediaLifecycle";
import { logger } from "../lib/logger";
import { notifyUser } from "../lib/notifications";
import { isOwnedUploadObjectPath, normalizeStoredObjectPath } from "../lib/storageSecurity";

const providerRouter = Router();
const adminRouter = Router();

function postgresErrorCode(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : null;
}

providerRouter.use(requireAuth);
adminRouter.use(requireAuth, requireAdmin);

async function writeAudit(req: AuthRequest, action: string, targetId: string, details: Record<string, unknown>) {
  try {
    const admin = await db.query.usersTable.findFirst({ where: eq(usersTable.id, req.user!.userId) });
    await db.insert(auditLogTable).values({
      id: crypto.randomUUID(),
      adminId: req.user!.userId,
      adminName: admin?.name || "Admin",
      adminRole: admin?.adminRole || req.user!.adminRole,
      action,
      target: "provider_document_update_request",
      targetId,
      details,
      ip: req.ip || req.socket?.remoteAddress || null,
    });
  } catch {
    // Audit persistence must not hide the primary review result.
  }
}

providerRouter.get("/", async (req: AuthRequest, res: Response) => {
  try {
    const loaded = await loadProviderCompliance(req.user!.userId);
    if (!loaded) return res.status(403).json({ error: "Provider account required" });
    const requests = await db.select().from(providerDocumentUpdateRequestsTable)
      .where(eq(providerDocumentUpdateRequestsTable.providerId, req.user!.userId))
      .orderBy(desc(providerDocumentUpdateRequestsTable.createdAt))
      .limit(50);
    return res.json({
      documents: loaded.documents,
      requests,
      compliance: loaded.summary,
    });
  } catch (error) {
    logger.error({ err: error, userId: req.user?.userId }, "provider document renewal load failed");
    return res.status(500).json({ error: "Failed to load document renewal status" });
  }
});

providerRouter.post("/", async (req: AuthRequest, res: Response) => {
  try {
    const provider = await db.query.usersTable.findFirst({ where: eq(usersTable.id, req.user!.userId) });
    if (!provider || provider.role !== "provider") return res.status(403).json({ error: "Provider account required" });

    const documentType = String(req.body?.documentType || "").trim() as ExpiringDocumentType;
    if (!EXPIRING_DOCUMENT_TYPES.includes(documentType)) return res.status(400).json({ error: "Only CNIC and police verification documents can be renewed here" });
    const url = normalizeStoredObjectPath(req.body?.url);
    if (!url || !isOwnedUploadObjectPath(url, provider.id, ["private"])) return res.status(400).json({ error: "The replacement must use your private upload path" });

    let validity: ReturnType<typeof validateDocumentValidity>;
    try {
      validity = validateDocumentValidity({
        documentType,
        issuedAt: req.body?.issuedAt,
        expiresAt: req.body?.expiresAt,
        expiryNotApplicable: req.body?.expiryNotApplicable,
      });
    } catch (error) {
      return res.status(400).json({ error: error instanceof Error ? error.message : "Invalid document validity" });
    }

    const existingPending = await db.query.providerDocumentUpdateRequestsTable.findFirst({
      where: and(
        eq(providerDocumentUpdateRequestsTable.providerId, provider.id),
        eq(providerDocumentUpdateRequestsTable.documentType, documentType),
        eq(providerDocumentUpdateRequestsTable.status, "pending"),
      ),
    });
    if (existingPending) return res.status(409).json({ error: "A replacement for this document is already waiting for review", request: existingPending });

    const [request] = await db.insert(providerDocumentUpdateRequestsTable).values({
      id: crypto.randomUUID(),
      providerId: provider.id,
      documentType,
      label: String(req.body?.label || "").trim().slice(0, 120) || null,
      url,
      issuedAt: validity.issuedAt,
      expiresAt: validity.expiresAt,
      expiryNotApplicable: validity.expiryNotApplicable,
      status: "pending",
    }).returning();

    if (provider.documentComplianceStatus !== "suspended") {
      await db.update(usersTable).set({
        documentComplianceStatus: "renewal_pending",
        documentComplianceReason: "Your replacement documents are waiting for Athoo review.",
        updatedAt: new Date(),
      }).where(eq(usersTable.id, provider.id));
    }

    await Promise.allSettled([
      createAdminNotification({
        title: "New document renewal request",
        message: `${provider.name} submitted an updated ${documentType === "police" ? "police verification certificate" : "CNIC image"}.`,
        type: "verification",
        link: `/admin/document-renewals?focus=${request.id}`,
      }),
      notifyUser({
        userId: provider.id,
        title: "Document submitted for review",
        body: `Your updated ${documentType === "police" ? "police verification" : "CNIC"} document was received.`,
        type: "system",
        link: "/provider/verification-documents",
        data: { source: "document_renewal", requestId: request.id, documentType },
      }),
    ]);

    return res.status(201).json({ request });
  } catch (error) {
    if (postgresErrorCode(error) === "23505") {
      return res.status(409).json({ error: "A replacement for this document is already waiting for review" });
    }
    logger.error({ err: error, userId: req.user?.userId }, "provider document renewal submission failed");
    return res.status(500).json({ error: "Failed to submit document renewal request" });
  }
});

providerRouter.delete("/:id", async (req: AuthRequest, res: Response) => {
  try {
    const [cancelled] = await db.update(providerDocumentUpdateRequestsTable).set({
      status: "cancelled",
      updatedAt: new Date(),
    }).where(and(
      eq(providerDocumentUpdateRequestsTable.id, req.params.id),
      eq(providerDocumentUpdateRequestsTable.providerId, req.user!.userId),
      eq(providerDocumentUpdateRequestsTable.status, "pending"),
    )).returning();
    if (!cancelled) return res.status(404).json({ error: "Pending renewal request not found" });
    const loaded = await loadProviderCompliance(req.user!.userId);
    if (loaded) await persistProviderCompliance(loaded.provider, loaded.summary);
    return res.json({ request: cancelled });
  } catch (error) {
    logger.error({ err: error, userId: req.user?.userId }, "provider document renewal cancellation failed");
    return res.status(500).json({ error: "Failed to cancel document renewal request" });
  }
});

adminRouter.get("/", requirePermission("verification.read"), async (req: AuthRequest, res: Response) => {
  try {
    const status = String(req.query.status || "pending").trim();
    const validStatuses = ["pending", "approved", "rejected", "cancelled", "all"];
    if (!validStatuses.includes(status)) return res.status(400).json({ error: "Invalid status filter" });
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 100));
    const baseQuery = db.select({
      request: providerDocumentUpdateRequestsTable,
      providerName: usersTable.name,
      providerPhone: usersTable.phone,
      providerEmail: usersTable.email,
      providerComplianceStatus: usersTable.documentComplianceStatus,
      providerSuspendedAt: usersTable.documentSuspendedAt,
    }).from(providerDocumentUpdateRequestsTable)
      .innerJoin(usersTable, eq(usersTable.id, providerDocumentUpdateRequestsTable.providerId));
    const rows = status === "all"
      ? await baseQuery.orderBy(desc(providerDocumentUpdateRequestsTable.createdAt)).limit(limit)
      : await baseQuery
          .where(eq(providerDocumentUpdateRequestsTable.status, status))
          .orderBy(desc(providerDocumentUpdateRequestsTable.createdAt))
          .limit(limit);
    return res.json({ requests: rows.map((row) => ({ ...row.request, provider: {
      id: row.request.providerId,
      name: row.providerName,
      phone: row.providerPhone,
      email: row.providerEmail,
      documentComplianceStatus: row.providerComplianceStatus,
      documentSuspendedAt: row.providerSuspendedAt,
    } })) });
  } catch (error) {
    logger.error({ err: error }, "admin document renewal list failed");
    return res.status(500).json({ error: "Failed to load document renewal requests" });
  }
});

adminRouter.get("/counts", requirePermission("verification.read"), async (_req, res) => {
  try {
    const [pending] = await db.select({ count: sql<number>`count(*)::int` })
      .from(providerDocumentUpdateRequestsTable)
      .where(eq(providerDocumentUpdateRequestsTable.status, "pending"));
    return res.json({ pending: Number(pending?.count || 0) });
  } catch {
    return res.status(500).json({ error: "Failed to load renewal counts" });
  }
});

adminRouter.patch("/:id", requirePermission("verification.write"), async (req: AuthRequest, res: Response) => {
  try {
    const decision = String(req.body?.status || "").trim();
    const note = String(req.body?.rejectionNote || "").trim();
    if (!['approved', 'rejected'].includes(decision)) return res.status(400).json({ error: "status must be approved or rejected" });
    if (decision === "rejected" && note.length < 3) return res.status(400).json({ error: "A clear rejection reason is required" });

    const request = await db.query.providerDocumentUpdateRequestsTable.findFirst({ where: eq(providerDocumentUpdateRequestsTable.id, req.params.id) });
    if (!request) return res.status(404).json({ error: "Renewal request not found" });
    if (request.status !== "pending") return res.status(409).json({ error: `This request is already ${request.status}` });
    const provider = await db.query.usersTable.findFirst({ where: eq(usersTable.id, request.providerId) });
    if (!provider || provider.role !== "provider") return res.status(404).json({ error: "Provider not found" });

    let previousUrl: string | null = null;
    await db.transaction(async (tx) => {
      const [reviewed] = await tx.update(providerDocumentUpdateRequestsTable).set({
        status: decision,
        rejectionNote: decision === "rejected" ? note : null,
        reviewedBy: req.user!.userId,
        reviewedAt: new Date(),
        updatedAt: new Date(),
      }).where(and(
        eq(providerDocumentUpdateRequestsTable.id, request.id),
        eq(providerDocumentUpdateRequestsTable.status, "pending"),
      )).returning({ id: providerDocumentUpdateRequestsTable.id });
      if (!reviewed) throw new Error("RENEWAL_ALREADY_REVIEWED");

      if (decision === "approved") {
        const current = await tx.query.providerDocumentsTable.findFirst({ where: and(
          eq(providerDocumentsTable.providerId, provider.id),
          eq(providerDocumentsTable.type, request.documentType),
        ) });
        previousUrl = current?.url || null;
        const documentPatch = {
          label: request.label,
          url: request.url,
          status: "approved",
          rejectionNote: null,
          reviewedBy: req.user!.userId,
          reviewedAt: new Date(),
          issuedAt: request.issuedAt,
          expiresAt: request.expiresAt,
          expiryNotApplicable: request.expiryNotApplicable,
          expiryReminder30SentAt: null,
          expiryReminder7SentAt: null,
          expiryReminder1SentAt: null,
          expiryNoticeSentAt: null,
          updatedAt: new Date(),
        };
        if (current) await tx.update(providerDocumentsTable).set(documentPatch).where(eq(providerDocumentsTable.id, current.id));
        else await tx.insert(providerDocumentsTable).values({
          id: crypto.randomUUID(),
          providerId: provider.id,
          type: request.documentType,
          createdAt: new Date(),
          ...documentPatch,
        });

        if (request.documentType === "cnic_front" || request.documentType === "cnic_back") {
          await tx.update(usersTable).set({
            cnicExpiry: request.expiresAt ? request.expiresAt.toISOString().slice(0, 10) : null,
            cnicLifetime: request.expiryNotApplicable,
            updatedAt: new Date(),
          }).where(eq(usersTable.id, provider.id));
        }
      }
    });

    if (decision === "approved" && previousUrl && previousUrl !== request.url) {
      cleanupReplacedOwnedMedia(previousUrl, request.url, provider.id);
    }

    const loaded = await loadProviderCompliance(provider.id);
    if (loaded) await persistProviderCompliance(loaded.provider, loaded.summary);

    await notifyUser({
      userId: provider.id,
      title: decision === "approved" ? "Updated document approved" : "Updated document needs correction",
      body: decision === "approved"
        ? `Your updated ${request.documentType === "police" ? "police verification" : "CNIC"} document was approved.`
        : note,
      type: "system",
      link: "/provider/verification-documents",
      data: { source: "document_renewal", requestId: request.id, documentType: request.documentType, status: decision },
      email: {
        category: "security",
        templateKey: "account_status",
        dedupeKey: `document-renewal-review:${request.id}:${decision}`,
        variables: {
          status: decision === "approved" ? "document approved" : "document rejected",
          reason: decision === "approved" ? "Your updated verification document was approved." : note,
        },
      },
    }).catch(() => undefined);
    await writeAudit(req, `provider_document_renewal_${decision}`, request.id, {
      providerId: provider.id,
      providerName: provider.name,
      documentType: request.documentType,
      rejectionNote: decision === "rejected" ? note : null,
    });

    const updated = await db.query.providerDocumentUpdateRequestsTable.findFirst({ where: eq(providerDocumentUpdateRequestsTable.id, request.id) });
    return res.json({ request: updated });
  } catch (error) {
    if (error instanceof Error && error.message === "RENEWAL_ALREADY_REVIEWED") return res.status(409).json({ error: "This request was reviewed by another administrator" });
    logger.error({ err: error, requestId: req.params.id }, "admin document renewal review failed");
    return res.status(500).json({ error: "Failed to review document renewal request" });
  }
});

export { adminRouter as documentRenewalsAdminRouter };
export default providerRouter;
