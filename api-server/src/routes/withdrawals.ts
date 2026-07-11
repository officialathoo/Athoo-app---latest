import crypto from "crypto";
import { logger } from "../lib/logger";
import { Router, type Response } from "express";
import { db } from "@workspace/db";
import { withdrawalRequestsTable, usersTable, bookingsTable, auditLogTable, financeLedgerTable } from "@workspace/db/schema";
import { and, eq, desc, inArray, sql } from "drizzle-orm";
import { requireAuth, requireAdmin, requirePermission, type AuthRequest } from "../middlewares/auth";
import { emitToUser, emitToRole } from "../lib/eventBus";
import { notifyUser } from "../lib/notifications";
import { canTransitionWithdrawal, validateWithdrawalPaymentReference } from "../domain/financialPolicy";

const router = Router();

router.get("/me", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const rows = await db
      .select()
      .from(withdrawalRequestsTable)
      .where(eq(withdrawalRequestsTable.providerId, userId))
      .orderBy(desc(withdrawalRequestsTable.createdAt));
    res.json({ withdrawals: rows });
  } catch (e) {
    logger.error({ err: e }, "withdrawals list error");
    res.status(500).json({ error: "Failed to load withdrawals" });
  }
});

router.post("/", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    if (req.user!.role !== "provider") {
      res.status(403).json({ error: "Only providers can request withdrawals" });
      return;
    }
    const userId = req.user!.userId;
    const amount = Number(req.body?.amount);
    const accountTitle = String(req.body?.accountTitle || "").trim();
    const accountNumber = String(req.body?.accountNumber || "").trim();
    const bankName = String(req.body?.bankName || "").trim() || null;
    const iban = String(req.body?.iban || "").trim() || null;
    const note = String(req.body?.note || "").trim() || null;
    const clientRequestId = String(req.body?.clientRequestId || "").trim();

    if (!Number.isFinite(amount) || amount < 500) {
      res.status(400).json({ error: "Minimum withdrawal amount is Rs. 500" });
      return;
    }
    if (!accountTitle || !accountNumber) {
      res.status(400).json({ error: "Account title and number are required" });
      return;
    }
    if (!clientRequestId || clientRequestId.length > 120) {
      res.status(400).json({ error: "A valid client request ID is required" });
      return;
    }
    if (accountTitle.length > 120 || accountNumber.length > 80 || (note && note.length > 500)) {
      res.status(400).json({ error: "Withdrawal details are too long" });
      return;
    }

    const me = await db.query.usersTable.findFirst({ where: eq(usersTable.id, userId) });
    if (!me) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    if (me.isBlocked) {
      res.status(403).json({ error: "Blocked accounts cannot request withdrawals" });
      return;
    }

    // ─── Atomic balance check + insert ────────────────────────────────────
    // Wrapping the duplicate-pending check, the available-balance computation,
    // and the INSERT in a single transaction prevents a provider from firing
    // concurrent requests that each see the same balance and slip past the
    // "one pending request" guard before the other has been written.
    //
    // Available balance = Σ providerAmount on completed+received bookings
    //                   − Σ amount on prior pending/approved/paid withdrawals.
    // (Pending is subtracted as defense-in-depth — even if the duplicate-pending
    //  check is ever relaxed, balance arithmetic still holds.)
    const row = {
      id: crypto.randomUUID(),
      providerId: userId,
      amount: Math.round(amount),
      accountTitle,
      accountNumber,
      bankName,
      iban,
      note,
      clientRequestId,
      status: "pending" as const,
    };

    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`);
      const existing = await tx.query.withdrawalRequestsTable.findFirst({
        where: and(eq(withdrawalRequestsTable.providerId, userId), eq(withdrawalRequestsTable.clientRequestId, clientRequestId)),
      });
      if (existing) return { ok: true as const, existing };
      const pending = await tx.query.withdrawalRequestsTable.findFirst({
        where: and(
          eq(withdrawalRequestsTable.providerId, userId),
          eq(withdrawalRequestsTable.status, "pending"),
        ),
      });
      if (pending) return { ok: false as const, code: 409, error: "You already have a pending withdrawal request" };

      const [earnedRow] = await tx
        .select({ total: sql<number>`COALESCE(SUM(${bookingsTable.providerAmount}), 0)` })
        .from(bookingsTable)
        .where(
          and(
            eq(bookingsTable.providerId, userId),
            eq(bookingsTable.status, "completed"),
            eq(bookingsTable.paymentStatus, "received"),
          ),
        );
      const [paidOutRow] = await tx
        .select({ total: sql<number>`COALESCE(SUM(${withdrawalRequestsTable.amount}), 0)` })
        .from(withdrawalRequestsTable)
        .where(
          and(
            eq(withdrawalRequestsTable.providerId, userId),
            inArray(withdrawalRequestsTable.status, ["pending", "approved", "paid"]),
          ),
        );
      const earned = Number(earnedRow?.total ?? 0);
      const paidOut = Number(paidOutRow?.total ?? 0);
      const available = Math.max(0, earned - paidOut);
      if (row.amount > available) {
        return {
          ok: false as const,
          code: 400,
          error: `Withdrawal amount exceeds your available balance of Rs. ${available}.`,
          availableBalance: available,
        };
      }

      await tx.insert(withdrawalRequestsTable).values(row);
      return { ok: true as const, existing: null };
    });

    if (!result.ok) {
      const body: Record<string, unknown> = { error: result.error };
      if ("availableBalance" in result) body.availableBalance = result.availableBalance;
      res.status(result.code).json(body);
      return;
    }

    if (!result.existing) {
      emitToRole("admin", "notification:new", { type: "withdrawal", providerId: userId, amount: row.amount });
    }

    res.status(result.existing ? 200 : 201).json({ withdrawal: result.existing || row, duplicate: Boolean(result.existing) });
  } catch (e) {
    logger.error({ err: e }, "withdrawal create error");
    res.status(500).json({ error: "Failed to create withdrawal request" });
  }
});

export const withdrawalsAdminRouter = Router();

withdrawalsAdminRouter.get("/", requireAuth, requireAdmin, requirePermission("finance.read"), async (_req, res) => {
  try {
    const rows = await db
      .select({
        w: withdrawalRequestsTable,
        provider: { id: usersTable.id, name: usersTable.name, phone: usersTable.phone },
      })
      .from(withdrawalRequestsTable)
      .innerJoin(usersTable, eq(usersTable.id, withdrawalRequestsTable.providerId))
      .orderBy(desc(withdrawalRequestsTable.createdAt));
    res.json({ withdrawals: rows.map((r) => ({ ...r.w, provider: r.provider })) });
  } catch (e) {
    logger.error({ err: e }, "admin withdrawals list error");
    res.status(500).json({ error: "Failed to load withdrawals" });
  }
});

withdrawalsAdminRouter.patch("/:id", requireAuth, requireAdmin, requirePermission("finance.write"), async (req: AuthRequest, res: Response) => {
  try {
    const id = String(req.params.id || "");
    const action = String(req.body?.action || "").toLowerCase();
    const note = String(req.body?.note || "").trim() || null;
    const reference = String(req.body?.paymentReference || "").trim() || null;
    const adminId = req.user?.userId || "admin";

    const w = await db.query.withdrawalRequestsTable.findFirst({
      where: eq(withdrawalRequestsTable.id, id),
    });
    if (!w) {
      res.status(404).json({ error: "Withdrawal not found" });
      return;
    }

    let newStatus: "approved" | "rejected" | "paid" | null = null;
    if (action === "approve") newStatus = "approved";
    else if (action === "reject") newStatus = "rejected";
    else if (action === "paid") newStatus = "paid";
    else {
      res.status(400).json({ error: "action must be approve | reject | paid" });
      return;
    }

    if (newStatus === "rejected" && (!note || note.length < 3)) {
      res.status(400).json({ error: "A rejection reason is required" });
      return;
    }
    if (!canTransitionWithdrawal(w.status, newStatus)) {
      res.status(409).json({ error: `Withdrawal cannot move from ${w.status} to ${newStatus}` });
      return;
    }
    const referenceError = validateWithdrawalPaymentReference(newStatus, reference || w.paymentReference || null);
    if (referenceError) {
      res.status(400).json({ error: referenceError });
      return;
    }
    const adminUser = await db.query.usersTable.findFirst({ where: eq(usersTable.id, adminId) });
    const updated = await db.transaction(async (tx) => {
      const changed = await tx.update(withdrawalRequestsTable)
        .set({
          status: newStatus,
          reviewedBy: adminId,
          reviewedAt: new Date(),
          rejectionNote: newStatus === "rejected" ? note : null,
          paidAt: newStatus === "paid" ? new Date() : w.paidAt,
          paymentReference: reference || w.paymentReference,
          updatedAt: new Date(),
        })
        .where(and(eq(withdrawalRequestsTable.id, id), eq(withdrawalRequestsTable.status, w.status)))
        .returning({ id: withdrawalRequestsTable.id });
      if (changed.length !== 1) return false;
      await tx.insert(auditLogTable).values({
        id: crypto.randomUUID(), adminId, adminName: adminUser?.name ?? "Admin",
        action: `withdrawal.${newStatus}`, target: "withdrawal_request", targetId: id,
        details: { providerId: w.providerId, amount: w.amount, note, paymentReference: reference }, ip: req.ip ?? null,
      });
      if (newStatus === "paid") {
        await tx.insert(financeLedgerTable).values({
          id: crypto.randomUUID(), entryType: "provider_withdrawal", referenceType: "withdrawal_request", referenceId: id,
          providerId: w.providerId, amount: w.amount, paymentReference: reference || w.paymentReference,
          note, createdBy: adminId, occurredAt: new Date(),
        }).onConflictDoNothing({ target: [financeLedgerTable.referenceType, financeLedgerTable.referenceId] });
      }
      return true;
    });
    if (!updated) {
      res.status(409).json({ error: "Withdrawal was processed by another request" });
      return;
    }

    notifyUser({
      userId: w.providerId,
      title: newStatus === "paid" ? "Withdrawal paid" : `Withdrawal ${newStatus}`,
      body: newStatus === "rejected"
        ? `Your Rs. ${w.amount} withdrawal was rejected${note ? `: ${note}` : ""}`
        : newStatus === "paid"
          ? `Your Rs. ${w.amount} withdrawal has been paid${reference ? ` (ref: ${reference})` : ""}`
          : `Your Rs. ${w.amount} withdrawal was approved and is being processed`,
      type: "system",
      data: { withdrawalId: id, status: newStatus },
    }).catch(() => undefined);
    emitToUser(w.providerId, "notification:new", { withdrawalId: id, status: newStatus });

    res.json({ ok: true, status: newStatus });
  } catch (e) {
    logger.error({ err: e }, "admin withdrawal patch error");
    res.status(500).json({ error: "Failed to update withdrawal" });
  }
});

export default router;

