import { isOwnedUploadObjectPath, normalizeStoredObjectPath } from "../lib/storageSecurity";
import crypto from "crypto";
import { logger } from "../lib/logger";
import { Router, type Response } from "express";
import { db } from "@workspace/db";
import { refundRequestsTable, bookingsTable, usersTable, auditLogTable, financeLedgerTable } from "@workspace/db/schema";
import { and, eq, desc, gte, ilike, lte, or } from "drizzle-orm";
import { requireAuth, requireAdmin, requirePermission, type AuthRequest } from "../middlewares/auth";
import { emitToUser, emitToRole } from "../lib/eventBus";
import { notifyUser } from "../lib/notifications";
import { canResolveRefund, validateRefundAmount, validateRefundPaymentReference } from "../domain/financialPolicy";

const router = Router();

router.get("/me", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const role = req.user!.role;
    const col = role === "provider" ? refundRequestsTable.providerId : refundRequestsTable.customerId;
    const rows = await db
      .select()
      .from(refundRequestsTable)
      .where(eq(col, userId))
      .orderBy(desc(refundRequestsTable.createdAt));
    res.json({ refunds: rows });
  } catch (e) {
    logger.error({ err: e }, "refunds list error");
    res.status(500).json({ error: "Failed to load refunds" });
  }
});

router.post("/", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    if (req.user!.role !== "customer") {
      res.status(403).json({ error: "Only customers can request refunds" });
      return;
    }
    const userId = req.user!.userId;
    const bookingId = String(req.body?.bookingId || "");
    const reason = String(req.body?.reason || "").trim();
    const amount = Number(req.body?.amountRequested || req.body?.amount);
    const evidenceUrl = normalizeStoredObjectPath(req.body?.evidenceUrl) || null;
    const clientRequestId = String(req.body?.clientRequestId || "").trim();

    if (!clientRequestId || clientRequestId.length > 120) {
      res.status(400).json({ error: "A valid clientRequestId is required" });
      return;
    }
    const duplicateRequest = await db.query.refundRequestsTable.findFirst({
      where: and(eq(refundRequestsTable.customerId, userId), eq(refundRequestsTable.clientRequestId, clientRequestId)),
    });
    if (duplicateRequest) {
      res.json({ refund: duplicateRequest, duplicate: true });
      return;
    }
    if (!bookingId || !reason || reason.length < 10) {
      res.status(400).json({ error: "bookingId and a reason of at least 10 characters are required" });
      return;
    }
    if (!Number.isFinite(amount)) {
      res.status(400).json({ error: "Valid refund amount required" });
      return;
    }
    const booking = await db.query.bookingsTable.findFirst({ where: eq(bookingsTable.id, bookingId) });
    if (!booking || booking.customerId !== userId) {
      res.status(404).json({ error: "Booking not found" });
      return;
    }
    const refundableTotal = Number(booking.price ?? 0) + Number(booking.visitCharge ?? 0);
    const amountError = validateRefundAmount(Math.round(amount), refundableTotal);
    if (amountError) {
      res.status(400).json({ error: amountError });
      return;
    }
    if (booking.status !== "completed" && booking.status !== "cancelled") {
      res.status(400).json({ error: "Refunds can only be requested on completed or cancelled bookings" });
      return;
    }
    if (!['paid', 'received'].includes(String(booking.paymentStatus || 'pending'))) {
      res.status(400).json({ error: "A refund cannot be requested until payment has been recorded" });
      return;
    }
    if (evidenceUrl && !isOwnedUploadObjectPath(evidenceUrl, userId, ["private"])) {
      res.status(400).json({ error: "Refund evidence must be uploaded to your private storage" });
      return;
    }
    const existing = await db.query.refundRequestsTable.findFirst({
      where: and(
        eq(refundRequestsTable.bookingId, bookingId),
        eq(refundRequestsTable.status, "pending"),
      ),
    });
    if (existing) {
      res.status(409).json({ error: "A refund request is already pending for this booking" });
      return;
    }

    const row = {
      id: crypto.randomUUID(),
      bookingId,
      customerId: userId,
      providerId: booking.providerId,
      reason,
      amountRequested: Math.round(amount),
      evidenceUrl: evidenceUrl || null,
      clientRequestId,
      status: "pending" as const,
    };
    const inserted = await db.insert(refundRequestsTable).values(row).onConflictDoNothing().returning();
    if (inserted.length === 0) {
      const existingRetry = await db.query.refundRequestsTable.findFirst({
        where: and(eq(refundRequestsTable.customerId, userId), eq(refundRequestsTable.clientRequestId, clientRequestId)),
      });
      if (existingRetry) {
        res.json({ refund: existingRetry, duplicate: true });
        return;
      }
      res.status(409).json({ error: "A refund request is already pending for this booking" });
      return;
    }

    emitToRole("admin", "admin:event", { type: "refund_requested", refundId: row.id, bookingId });
    notifyUser({
      userId: booking.providerId,
      title: "Refund / dispute opened",
      body: `Customer requested Rs. ${row.amountRequested} refund on ${booking.service}: ${reason.slice(0, 80)}${reason.length > 80 ? "…" : ""}`,
      type: "system",
      data: { refundId: row.id, bookingId },
    
      email: { category: "transactional" },
    }).catch(() => undefined);

    res.json({ refund: row, duplicate: false });
  } catch (e: any) {
    if (String(e?.code) === "23505") {
      res.status(409).json({ error: "A refund request is already pending for this booking" });
      return;
    }
    logger.error({ err: e }, "refund create error");
    res.status(500).json({ error: "Failed to create refund request" });
  }
});

export const refundsAdminRouter = Router();

refundsAdminRouter.get("/", requireAuth, requireAdmin, requirePermission("finance.read"), async (req, res) => {
  try {
    const search = String(req.query.search || "").trim().slice(0, 120);
    const status = String(req.query.status || "all").trim();
    const focus = String(req.query.focus || "").trim();
    const from = typeof req.query.from === "string" && req.query.from ? new Date(`${req.query.from}T00:00:00.000Z`) : null;
    const to = typeof req.query.to === "string" && req.query.to ? new Date(`${req.query.to}T23:59:59.999Z`) : null;
    const conditions: any[] = [];
    if (focus) {
      conditions.push(eq(refundRequestsTable.id, focus));
    } else {
      if (["pending", "approved", "rejected", "paid"].includes(status)) conditions.push(eq(refundRequestsTable.status, status));
      if (from && !Number.isNaN(from.getTime())) conditions.push(gte(refundRequestsTable.createdAt, from));
      if (to && !Number.isNaN(to.getTime())) conditions.push(lte(refundRequestsTable.createdAt, to));
      if (search) {
        const like = `%${search}%`;
        conditions.push(or(
          ilike(usersTable.publicId, like),
          ilike(usersTable.name, like),
          ilike(usersTable.phone, like),
          ilike(bookingsTable.service, like),
          ilike(refundRequestsTable.reason, like),
        ));
      }
    }
    const rows = await db
      .select({
        r: refundRequestsTable,
        booking: { id: bookingsTable.id, publicId: bookingsTable.publicId, service: bookingsTable.service, price: bookingsTable.price },
        customer: { id: usersTable.id, publicId: usersTable.publicId, name: usersTable.name, phone: usersTable.phone },
      })
      .from(refundRequestsTable)
      .innerJoin(bookingsTable, eq(bookingsTable.id, refundRequestsTable.bookingId))
      .innerJoin(usersTable, eq(usersTable.id, refundRequestsTable.customerId))
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(refundRequestsTable.createdAt))
      .limit(focus ? 1 : 500);
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

