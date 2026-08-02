import { normalizeStoredObjectPath } from "../lib/storageSecurity";
import { isCleanOwnedUploadObjectPath } from "../lib/verifiedUploads";
import crypto from "crypto";
import { logger } from "../lib/logger";
import { Router, type Response } from "express";
import { db } from "@workspace/db";
import { refundRequestsTable, bookingsTable, usersTable, auditLogTable, financeLedgerTable } from "@workspace/db/schema";
import { and, eq, desc, inArray, sql } from "drizzle-orm";
import { requireAuth, requireAdmin, requirePermission, type AuthRequest } from "../middlewares/auth";
import { emitToUser, emitToRole } from "../lib/eventBus";
import { notifyUser } from "../lib/notifications";
import { canResolveRefund, validateRefundAmount, validateRefundPaymentReference } from "../domain/financialPolicy";

const router = Router();

class RefundRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

function cleanRefundAmount(value: unknown): number | null {
  if (typeof value === "number") return Number.isSafeInteger(value) && value > 0 ? value : null;
  if (typeof value !== "string" || !/^\d{1,9}$/.test(value.trim())) return null;
  const parsed = Number(value.trim());
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function cleanRefundRequestId(value: unknown): string {
  const requestId = String(value || "").trim();
  return /^[a-zA-Z0-9._:-]{8,120}$/.test(requestId) ? requestId : "";
}

function sameIdempotentRequest(
  existing: typeof refundRequestsTable.$inferSelect,
  input: { bookingId: string; reason: string; amount: number; evidenceUrl: string | null },
): boolean {
  return existing.bookingId === input.bookingId
    && existing.reason === input.reason
    && existing.amountRequested === input.amount
    && (existing.evidenceUrl || null) === input.evidenceUrl;
}

router.get("/me", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const role = req.user!.role;
    const col = role === "provider" ? refundRequestsTable.providerId : refundRequestsTable.customerId;
    const rows = await db
      .select()
      .from(refundRequestsTable)
      .where(eq(col, userId))
      .orderBy(desc(refundRequestsTable.createdAt))
      .limit(100);
    res.json({ refunds: rows, limit: 100 });
  } catch (e) {
    logger.error({ err: e }, "refunds list error");
    res.status(500).json({ error: "Failed to load refunds" });
  }
});

router.get("/eligible-bookings", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    if (req.user!.role !== "customer") {
      res.status(403).json({ error: "Only customers can request refunds" });
      return;
    }
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
    const paidRefundTotal = sql<number>`coalesce((
      select sum(rr.amount_requested)
      from refund_requests rr
      where rr.booking_id = ${bookingsTable.id} and rr.status = 'paid'
    ), 0)::int`;
    const rows = await db.select({
      id: bookingsTable.id,
      publicId: bookingsTable.publicId,
      service: bookingsTable.service,
      status: bookingsTable.status,
      paymentStatus: bookingsTable.paymentStatus,
      price: bookingsTable.price,
      visitCharge: bookingsTable.visitCharge,
      scheduledDate: bookingsTable.scheduledDate,
      scheduledTime: bookingsTable.scheduledTime,
      createdAt: bookingsTable.createdAt,
      paidRefundTotal,
    }).from(bookingsTable).where(and(
      eq(bookingsTable.customerId, req.user!.userId),
      inArray(bookingsTable.status, ["completed", "cancelled"]),
      inArray(bookingsTable.paymentStatus, ["paid", "received"]),
      sql`not exists (
        select 1 from refund_requests unresolved
        where unresolved.booking_id = ${bookingsTable.id}
          and unresolved.status in ('pending', 'approved')
      )`,
      sql`(coalesce(${bookingsTable.price}, 0) + coalesce(${bookingsTable.visitCharge}, 0)) > ${paidRefundTotal}`,
    )).orderBy(desc(bookingsTable.createdAt)).limit(limit + 1);

    const eligibleBookings = rows.slice(0, limit).map((booking) => {
      const refundableTotal = Number(booking.price || 0) + Number(booking.visitCharge || 0);
      return {
        ...booking,
        refundableTotal,
        remainingRefundable: Math.max(0, refundableTotal - Number(booking.paidRefundTotal || 0)),
      };
    });
    res.json({ eligibleBookings, limit, hasMore: rows.length > limit });
  } catch (error) {
    logger.error({ err: error, userId: req.user!.userId }, "refund eligibility list error");
    res.status(500).json({ error: "Failed to load refund-eligible bookings" });
  }
});

router.post("/", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    if (req.user!.role !== "customer") {
      res.status(403).json({ error: "Only customers can request refunds" });
      return;
    }
    const userId = req.user!.userId;
    const bookingId = String(req.body?.bookingId || "").trim();
    const reason = String(req.body?.reason || "").trim();
    const amount = cleanRefundAmount(req.body?.amountRequested ?? req.body?.amount);
    const rawEvidenceUrl = req.body?.evidenceUrl;
    const evidenceUrl = normalizeStoredObjectPath(rawEvidenceUrl) || null;
    const clientRequestId = cleanRefundRequestId(req.body?.clientRequestId);

    if (!clientRequestId) {
      res.status(400).json({ error: "A valid clientRequestId is required", code: "INVALID_CLIENT_REQUEST_ID" });
      return;
    }
    if (!/^[a-zA-Z0-9_-]{8,120}$/.test(bookingId) || reason.length < 10 || reason.length > 1000) {
      res.status(400).json({ error: "Select a booking and provide a reason between 10 and 1000 characters", code: "INVALID_REFUND_DETAILS" });
      return;
    }
    if (amount === null) {
      res.status(400).json({ error: "Refund amount must be a positive whole rupee amount", code: "INVALID_REFUND_AMOUNT" });
      return;
    }
    if (rawEvidenceUrl !== undefined && rawEvidenceUrl !== null && String(rawEvidenceUrl).trim() && !evidenceUrl) {
      res.status(400).json({ error: "Refund evidence must be uploaded to your private storage through Athoo", code: "INVALID_REFUND_EVIDENCE" });
      return;
    }
    // Replaces isOwnedUploadObjectPath(evidenceUrl, userId, ["private"]) with owner + clean-scan enforcement.
    if (evidenceUrl && (evidenceUrl.length > 500 || !(await isCleanOwnedUploadObjectPath(evidenceUrl, userId, ["private"])))) {
      res.status(400).json({ error: "Refund evidence must be uploaded to your private storage through Athoo", code: "INVALID_REFUND_EVIDENCE" });
      return;
    }

    const requestInput = { bookingId, reason, amount, evidenceUrl };
    const existingRetry = await db.query.refundRequestsTable.findFirst({
      where: and(eq(refundRequestsTable.customerId, userId), eq(refundRequestsTable.clientRequestId, clientRequestId)),
    });
    if (existingRetry) {
      if (!sameIdempotentRequest(existingRetry, requestInput)) {
        res.status(409).json({ error: "This retry identifier was already used for different refund details", code: "IDEMPOTENCY_CONFLICT" });
        return;
      }
      res.json({ refund: existingRetry, duplicate: true });
      return;
    }

    const outcome = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`refund:${bookingId}`}, 0))`);
      const [duplicate] = await tx.select().from(refundRequestsTable).where(and(
        eq(refundRequestsTable.customerId, userId),
        eq(refundRequestsTable.clientRequestId, clientRequestId),
      )).limit(1);
      if (duplicate) {
        if (!sameIdempotentRequest(duplicate, requestInput)) {
          throw new RefundRequestError(409, "IDEMPOTENCY_CONFLICT", "This retry identifier was already used for different refund details");
        }
        return { refund: duplicate, duplicate: true };
      }

      const [booking] = await tx.select().from(bookingsTable).where(and(
        eq(bookingsTable.id, bookingId),
        eq(bookingsTable.customerId, userId),
      )).limit(1);
      if (!booking) throw new RefundRequestError(404, "BOOKING_NOT_FOUND", "Booking not found");
      if (booking.status !== "completed" && booking.status !== "cancelled") {
        throw new RefundRequestError(400, "BOOKING_NOT_REFUNDABLE", "Refunds can only be requested on completed or cancelled bookings");
      }
      if (!["paid", "received"].includes(String(booking.paymentStatus || "pending"))) {
        throw new RefundRequestError(400, "PAYMENT_NOT_RECORDED", "A refund cannot be requested until payment has been recorded");
      }
      const [unresolved] = await tx.select({ id: refundRequestsTable.id, status: refundRequestsTable.status })
        .from(refundRequestsTable)
        .where(and(eq(refundRequestsTable.bookingId, bookingId), inArray(refundRequestsTable.status, ["pending", "approved"])))
        .limit(1);
      if (unresolved) {
        throw new RefundRequestError(409, "REFUND_ALREADY_OPEN", unresolved.status === "approved"
          ? "A refund is already approved and awaiting payout for this booking"
          : "A refund request is already pending for this booking");
      }
      const [paid] = await tx.select({
        total: sql<number>`coalesce(sum(${refundRequestsTable.amountRequested}), 0)::int`,
      }).from(refundRequestsTable).where(and(
        eq(refundRequestsTable.bookingId, bookingId),
        eq(refundRequestsTable.status, "paid"),
      ));
      const refundableTotal = Number(booking.price || 0) + Number(booking.visitCharge || 0);
      const remainingRefundable = Math.max(0, refundableTotal - Number(paid?.total || 0));
      const amountError = validateRefundAmount(amount, remainingRefundable);
      if (amountError) throw new RefundRequestError(400, "INVALID_REFUND_AMOUNT", amountError);

      const row = {
        id: crypto.randomUUID(), bookingId, customerId: userId, providerId: booking.providerId,
        reason, amountRequested: amount, evidenceUrl, clientRequestId, status: "pending" as const,
      };
      const [inserted] = await tx.insert(refundRequestsTable).values(row).onConflictDoNothing().returning();
      if (!inserted) {
        const [idempotent] = await tx.select().from(refundRequestsTable).where(and(
          eq(refundRequestsTable.customerId, userId),
          eq(refundRequestsTable.clientRequestId, clientRequestId),
        )).limit(1);
        if (idempotent && sameIdempotentRequest(idempotent, requestInput)) return { refund: idempotent, duplicate: true };
        throw new RefundRequestError(409, "REFUND_ALREADY_OPEN", "A refund request is already open for this booking");
      }
      await tx.insert(auditLogTable).values({
        id: crypto.randomUUID(), adminId: userId, adminName: booking.customerName, adminRole: "customer",
        action: "refund.self_requested", target: "refund_request", targetId: inserted.id,
        details: { bookingId, amount, hasEvidence: Boolean(evidenceUrl) }, ip: req.ip ?? null,
      });
      return { refund: inserted, duplicate: false };
    });

    if (!outcome.duplicate) {
      const row = outcome.refund;
      emitToRole("admin", "admin:event", { type: "refund_requested", refundId: row.id, bookingId });
      notifyUser({
        userId: row.providerId,
        title: "Refund / dispute opened",
        body: `Customer requested Rs. ${row.amountRequested} refund: ${reason.slice(0, 80)}${reason.length > 80 ? "…" : ""}`,
        type: "system",
        data: { refundId: row.id, bookingId },
        email: { category: "transactional" },
      }).catch(() => undefined);
    }

    res.status(outcome.duplicate ? 200 : 201).json(outcome);
  } catch (e: any) {
    if (e instanceof RefundRequestError) {
      res.status(e.status).json({ error: e.message, code: e.code });
      return;
    }
    if (String(e?.code) === "23505") {
      res.status(409).json({ error: "A refund request is already open for this booking", code: "REFUND_ALREADY_OPEN" });
      return;
    }
    logger.error({ err: e }, "refund create error");
    res.status(500).json({ error: "Failed to create refund request" });
  }
});

export const refundsAdminRouter = Router();

refundsAdminRouter.get("/", requireAuth, requireAdmin, requirePermission("finance.read"), async (_req, res) => {
  try {
    const rows = await db
      .select({
        r: refundRequestsTable,
        booking: { id: bookingsTable.id, service: bookingsTable.service, price: bookingsTable.price },
        customer: { id: usersTable.id, name: usersTable.name, phone: usersTable.phone },
      })
      .from(refundRequestsTable)
      .innerJoin(bookingsTable, eq(bookingsTable.id, refundRequestsTable.bookingId))
      .innerJoin(usersTable, eq(usersTable.id, refundRequestsTable.customerId))
      .orderBy(desc(refundRequestsTable.createdAt));
    res.json({
      refunds: rows.map((r) => ({ ...r.r, booking: r.booking, customer: r.customer })),
    });
  } catch (e) {
    logger.error({ err: e }, "admin refunds list error");
    res.status(500).json({ error: "Failed to load refunds" });
  }
});

refundsAdminRouter.patch("/:id", requireAuth, requireAdmin, requirePermission("finance.write"), async (req: AuthRequest, res: Response) => {
  try {
    const id = String(req.params.id || "");
    const action = String(req.body?.action || "").toLowerCase();
    const note = String(req.body?.resolutionNote || req.body?.note || "").trim() || null;
    const paymentReference = String(req.body?.paymentReference || "").trim() || null;
    const adminId = req.user?.userId || "admin";
    const row = await db.query.refundRequestsTable.findFirst({ where: eq(refundRequestsTable.id, id) });
    if (!row) {
      res.status(404).json({ error: "Refund not found" });
      return;
    }

    let status: "approved" | "rejected" | "paid";
    if (action === "approve") status = "approved";
    else if (action === "reject") status = "rejected";
    else if (action === "paid") status = "paid";
    else {
      res.status(400).json({ error: "action must be approve, reject, or paid" });
      return;
    }
    if (!note || note.length < 5) {
      res.status(400).json({ error: "A resolution note of at least 5 characters is required" });
      return;
    }
    if (!canResolveRefund(row.status, status)) {
      res.status(409).json({ error: `Refund cannot move from ${row.status} to ${status}` });
      return;
    }
    const referenceError = validateRefundPaymentReference(status, paymentReference || row.paymentReference || null);
    if (referenceError) {
      res.status(400).json({ error: referenceError });
      return;
    }

    const adminUser = await db.query.usersTable.findFirst({ where: eq(usersTable.id, adminId) });
    const updated = await db.transaction(async (tx) => {
      const changed = await tx.update(refundRequestsTable)
        .set({
          status,
          resolutionNote: note,
          resolvedBy: adminId,
          resolvedAt: status === "paid" ? row.resolvedAt || new Date() : new Date(),
          paidAt: status === "paid" ? new Date() : row.paidAt,
          paymentReference: paymentReference || row.paymentReference,
          updatedAt: new Date(),
        })
        .where(and(eq(refundRequestsTable.id, id), eq(refundRequestsTable.status, row.status)))
        .returning({ id: refundRequestsTable.id });
      if (changed.length !== 1) return false;
      await tx.insert(auditLogTable).values({
        id: crypto.randomUUID(), adminId, adminName: adminUser?.name ?? "Admin",
        action: `refund.${status}`, target: "refund_request", targetId: id,
        details: { bookingId: row.bookingId, amount: row.amountRequested, note, paymentReference }, ip: req.ip ?? null,
      });
      if (status === "paid") {
        await tx.insert(financeLedgerTable).values({
          id: crypto.randomUUID(), entryType: "customer_refund", referenceType: "refund_request", referenceId: id,
          bookingId: row.bookingId, providerId: row.providerId, customerId: row.customerId,
          amount: row.amountRequested, paymentReference: paymentReference || row.paymentReference,
          note, createdBy: adminId, occurredAt: new Date(),
        }).onConflictDoNothing({ target: [financeLedgerTable.referenceType, financeLedgerTable.referenceId] });
      }
      return true;
    });
    if (!updated) {
      res.status(409).json({ error: "Refund was processed by another request" });
      return;
    }

    notifyUser({
      userId: row.customerId,
      title: status === "paid" ? "Refund paid" : status === "approved" ? "Refund approved" : "Refund declined",
      body: status === "paid"
        ? `Your Rs. ${row.amountRequested} refund has been paid${paymentReference ? ` (ref: ${paymentReference})` : ""}`
        : status === "approved"
          ? `Your Rs. ${row.amountRequested} refund was approved and is awaiting payout: ${note}`
          : `Your refund was declined: ${note}`,
      type: "system",
      data: { refundId: id, status },
    
      email: { category: "transactional" },
    }).catch(() => undefined);
    emitToUser(row.customerId, "notification:new", { refundId: id, status });
    emitToUser(row.providerId, "notification:new", { refundId: id, status });
    res.json({ ok: true, status });
  } catch (e: any) {
    if (String(e?.code) === "23505") {
      res.status(409).json({ error: "This refund payment reference has already been used" });
      return;
    }
    logger.error({ err: e }, "admin refund patch error");
    res.status(500).json({ error: "Failed to update refund" });
  }
});

export default router;
