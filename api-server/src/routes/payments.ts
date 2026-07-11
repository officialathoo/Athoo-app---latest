import { Router } from "express";
import { logger } from "../lib/logger";
import crypto from "crypto";
import { getPlatformSettings } from "../lib/admin";
import { notifyUser } from "../lib/notifications";
import { db } from "@workspace/db";
import {
  commissionPaymentsTable,
  paymentAccountsTable,
  usersTable,
  adminNotificationsTable,
  auditLogTable,
  financeLedgerTable,
} from "@workspace/db/schema";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import {
  requireAuth,
  requireAdmin,
  requirePermission,
  type AuthRequest,
} from "../middlewares/auth";
import { canReviewCommissionPayment } from "../domain/financialPolicy";

const router = Router();
const id = () => crypto.randomUUID();

router.use(requireAuth);

// LIST active payment accounts (any logged-in user can see where to pay)
router.get("/accounts", async (_req, res) => {
  const rows = await db
    .select()
    .from(paymentAccountsTable)
    .where(eq(paymentAccountsTable.isActive, true))
    .orderBy(asc(paymentAccountsTable.sortOrder), asc(paymentAccountsTable.label));
  return res.json({ accounts: rows });
});

// LIST my commission payments
router.get("/me", async (req: AuthRequest, res) => {
  const providerId = req.user!.userId;
  const [rows, provider, reservedRows] = await Promise.all([
    db.select().from(commissionPaymentsTable)
      .where(eq(commissionPaymentsTable.providerId, providerId))
      .orderBy(desc(commissionPaymentsTable.createdAt)),
    db.query.usersTable.findFirst({ where: eq(usersTable.id, providerId) }),
    db.select({ total: sql<number>`COALESCE(SUM(${commissionPaymentsTable.amount}), 0)` })
      .from(commissionPaymentsTable)
      .where(and(eq(commissionPaymentsTable.providerId, providerId), eq(commissionPaymentsTable.status, "pending"))),
  ]);
  const pendingCommission = Number(provider?.pendingCommission || 0);
  const reservedCommission = Number(reservedRows[0]?.total || 0);
  return res.json({
    payments: rows,
    pendingCommission,
    reservedCommission,
    availableToSubmit: Math.max(0, pendingCommission - reservedCommission),
  });
});

// SUBMIT a new commission payment
router.post("/", async (req: AuthRequest, res) => {
  try {
    if (req.user!.role !== "provider") {
      return res.status(403).json({ error: "Only providers can submit commission payments" });
    }
    const providerId = req.user!.userId;
    const amount = Number(req.body?.amount);
    const accountId = String(req.body?.accountId || "").trim();
    const reference = String(req.body?.reference || "").trim();
    const screenshotUrl = String(req.body?.screenshotUrl || "").trim();
    const note = String(req.body?.note || "").trim() || null;
    const clientRequestId = String(req.body?.clientRequestId || "").trim();

    if (!Number.isInteger(amount) || amount <= 0) return res.status(400).json({ error: "Amount must be a positive whole number" });
    if (!clientRequestId || clientRequestId.length > 120) return res.status(400).json({ error: "A valid client request ID is required" });
    if (!accountId) return res.status(400).json({ error: "Payment account is required" });
    if (!reference || reference.length > 120) return res.status(400).json({ error: "Transaction reference is required" });
    if (!screenshotUrl) return res.status(400).json({ error: "Payment screenshot is required" });
    if (!screenshotUrl.startsWith(`uploads/private/${providerId}/`)) return res.status(400).json({ error: "Payment screenshot must be uploaded to your private storage" });
    if (note && note.length > 500) return res.status(400).json({ error: "Note must be 500 characters or fewer" });

    const account = await db.query.paymentAccountsTable.findFirst({ where: and(eq(paymentAccountsTable.id, accountId), eq(paymentAccountsTable.isActive, true)) });
    if (!account) return res.status(400).json({ error: "Selected payment account is not active" });

    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT id FROM users WHERE id = ${providerId} FOR UPDATE`);
      const existing = await tx.query.commissionPaymentsTable.findFirst({
        where: and(eq(commissionPaymentsTable.providerId, providerId), eq(commissionPaymentsTable.clientRequestId, clientRequestId)),
      });
      if (existing) return { existing };
      const provider = await tx.query.usersTable.findFirst({ where: eq(usersTable.id, providerId) });
      if (!provider) throw new Error("PROVIDER_NOT_FOUND");
      const [reserved] = await tx.select({ total: sql<number>`COALESCE(SUM(${commissionPaymentsTable.amount}), 0)` })
        .from(commissionPaymentsTable)
        .where(and(eq(commissionPaymentsTable.providerId, providerId), eq(commissionPaymentsTable.status, "pending")));
      const available = Math.max(0, Number(provider.pendingCommission || 0) - Number(reserved?.total || 0));
      if (amount > available) return { error: `Amount exceeds commission available for submission (Rs. ${available})`, available };
      const paymentId = id();
      const [payment] = await tx.insert(commissionPaymentsTable).values({
        id: paymentId, providerId, amount, accountId, reference, screenshotUrl, note,
        clientRequestId, status: "pending",
      }).returning();
      await tx.insert(adminNotificationsTable).values({
        id: id(), title: "New commission payment", message: `${provider.name} submitted a payment of Rs ${amount}`,
        type: "info", link: `/admin/payments/${paymentId}`,
      });
      return { payment };
    });
    if ("error" in result) return res.status(400).json({ error: result.error, availableToSubmit: result.available });
    return res.status("existing" in result ? 200 : 201).json({ payment: "existing" in result ? result.existing : result.payment, duplicate: "existing" in result });
  } catch (e: any) {
    if (String(e?.code) === "23505") return res.status(409).json({ error: "This transaction reference or request has already been submitted" });
    logger.error({ err: e }, "payments.submit error");
    return res.status(500).json({ error: "Failed to submit payment" });
  }
});

// ADMIN sub-router
const adminRouter = Router();
adminRouter.use(requireAuth, requireAdmin);

// Payment accounts CRUD
adminRouter.get("/accounts", requirePermission("finance.read"), async (_req, res) => {
  const rows = await db
    .select()
    .from(paymentAccountsTable)
    .orderBy(asc(paymentAccountsTable.sortOrder), asc(paymentAccountsTable.label));
  return res.json({ accounts: rows });
});

adminRouter.post("/accounts", requirePermission("finance.write"), async (req: AuthRequest, res) => {
  try {
    const { label, bankName, accountTitle, accountNumber, iban, instructions, isActive, sortOrder } =
      req.body ?? {};
    if (!label || !accountTitle || !accountNumber) {
      return res.status(400).json({ error: "label, accountTitle, accountNumber are required" });
    }
    const newId = id();
    await db.insert(paymentAccountsTable).values({
      id: newId,
      label: String(label).trim(),
      bankName: bankName ? String(bankName).trim() : null,
      accountTitle: String(accountTitle).trim(),
      accountNumber: String(accountNumber).trim(),
      iban: iban ? String(iban).trim() : null,
      instructions: instructions ? String(instructions) : null,
      isActive: isActive !== false,
      sortOrder: Number.isFinite(Number(sortOrder)) ? Number(sortOrder) : 0,
    });
    const adminUser = await db.query.usersTable.findFirst({ where: eq(usersTable.id, req.user!.userId) });
    await db.insert(auditLogTable).values({
      id: id(),
      adminId: req.user!.userId,
      adminName: adminUser?.name ?? "Admin",
      action: "payment_account.create",
      target: "payment_account",
      targetId: newId,
      ip: req.ip ?? null,
    });
    const row = await db.query.paymentAccountsTable.findFirst({
      where: eq(paymentAccountsTable.id, newId),
    });
    return res.status(201).json({ account: row });
  } catch (e) {
    logger.error({ err: e }, "payments.account.create error");
    return res.status(500).json({ error: "Failed to create account" });
  }
});

adminRouter.patch("/accounts/:id", requirePermission("finance.write"), async (req: AuthRequest, res) => {
  try {
    const acct = await db.query.paymentAccountsTable.findFirst({
      where: eq(paymentAccountsTable.id, req.params.id),
    });
    if (!acct) return res.status(404).json({ error: "Account not found" });
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    const { label, bankName, accountTitle, accountNumber, iban, instructions, isActive, sortOrder } =
      req.body ?? {};
    if (typeof label === "string" && label.trim()) patch.label = label.trim();
    if (typeof bankName === "string") patch.bankName = bankName.trim() || null;
    if (typeof accountTitle === "string" && accountTitle.trim()) patch.accountTitle = accountTitle.trim();
    if (typeof accountNumber === "string" && accountNumber.trim()) patch.accountNumber = accountNumber.trim();
    if (typeof iban === "string") patch.iban = iban.trim() || null;
    if (typeof instructions === "string") patch.instructions = instructions;
    if (typeof isActive === "boolean") patch.isActive = isActive;
    if (Number.isFinite(Number(sortOrder))) patch.sortOrder = Number(sortOrder);
    await db.update(paymentAccountsTable).set(patch).where(eq(paymentAccountsTable.id, acct.id));
    const adminUser = await db.query.usersTable.findFirst({ where: eq(usersTable.id, req.user!.userId) });
    await db.insert(auditLogTable).values({
      id: id(), adminId: req.user!.userId, adminName: adminUser?.name ?? "Admin",
      action: "payment_account.update", target: "payment_account", targetId: acct.id,
      details: { before: { label: acct.label, isActive: acct.isActive, sortOrder: acct.sortOrder }, patch }, ip: req.ip ?? null,
    });
    const row = await db.query.paymentAccountsTable.findFirst({
      where: eq(paymentAccountsTable.id, acct.id),
    });
    return res.json({ account: row });
  } catch (e) {
    logger.error({ err: e }, "payments.account.update error");
    return res.status(500).json({ error: "Failed to update account" });
  }
});

adminRouter.delete("/accounts/:id", requirePermission("finance.write"), async (req: AuthRequest, res) => {
  const account = await db.query.paymentAccountsTable.findFirst({ where: eq(paymentAccountsTable.id, req.params.id) });
  if (!account) return res.status(404).json({ error: "Payment account not found" });
  if (!account.isActive) return res.json({ success: true, duplicate: true });
  const activeCount = await db.$count(paymentAccountsTable, eq(paymentAccountsTable.isActive, true));
  if (Number(activeCount) <= 1) return res.status(409).json({ error: "At least one active payment account is required" });
  await db.update(paymentAccountsTable).set({ isActive: false, updatedAt: new Date() }).where(eq(paymentAccountsTable.id, account.id));
  const adminUser = await db.query.usersTable.findFirst({ where: eq(usersTable.id, req.user!.userId) });
  await db.insert(auditLogTable).values({
    id: id(), adminId: req.user!.userId, adminName: adminUser?.name ?? "Admin",
    action: "payment_account.deactivate", target: "payment_account", targetId: account.id,
    details: { label: account.label }, ip: req.ip ?? null,
  });
  return res.json({ success: true, duplicate: false });
});

// Commission payments — list/approve/reject
adminRouter.get("/commission", requirePermission("finance.read"), async (req, res) => {
  const status = String(req.query.status ?? "");
  const where = status ? eq(commissionPaymentsTable.status, status) : undefined;
  const rows = await db
    .select({
      id: commissionPaymentsTable.id,
      providerId: commissionPaymentsTable.providerId,
      providerName: usersTable.name,
      providerPhone: usersTable.phone,
      amount: commissionPaymentsTable.amount,
      accountId: commissionPaymentsTable.accountId,
      reference: commissionPaymentsTable.reference,
      screenshotUrl: commissionPaymentsTable.screenshotUrl,
      note: commissionPaymentsTable.note,
      status: commissionPaymentsTable.status,
      reviewedAt: commissionPaymentsTable.reviewedAt,
      rejectionNote: commissionPaymentsTable.rejectionNote,
      createdAt: commissionPaymentsTable.createdAt,
    })
    .from(commissionPaymentsTable)
    .leftJoin(usersTable, eq(commissionPaymentsTable.providerId, usersTable.id))
    .where(where as any)
    .orderBy(desc(commissionPaymentsTable.createdAt))
    .limit(200);
  return res.json({ payments: rows });
});

adminRouter.post("/commission/:id/approve", requirePermission("finance.write"), async (req: AuthRequest, res) => {
  try {
    const pay = await db.query.commissionPaymentsTable.findFirst({
      where: eq(commissionPaymentsTable.id, req.params.id),
    });
    if (!pay) return res.status(404).json({ error: "Payment not found" });
    if (!canReviewCommissionPayment(pay.status, "approved")) return res.status(409).json({ error: `Payment is already ${pay.status}` });

    const provider = await db.query.usersTable.findFirst({
      where: eq(usersTable.id, pay.providerId),
    });
    if (!provider) return res.status(404).json({ error: "Provider not found" });

    const newPending = Math.max(0, (provider.pendingCommission ?? 0) - pay.amount);
    const settings = await getPlatformSettings();
    const commissionLimit = Number(provider.commissionLimit || settings.defaultCommissionLimit || 5000);
    const shouldUnblock = provider.isBlocked && newPending < commissionLimit;

    const adminUser = await db.query.usersTable.findFirst({ where: eq(usersTable.id, req.user!.userId) });
    await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT id FROM users WHERE id = ${provider.id} FOR UPDATE`);
      const lockedProvider = await tx.query.usersTable.findFirst({ where: eq(usersTable.id, provider.id) });
      if (!lockedProvider) throw new Error("PROVIDER_NOT_FOUND");
      const lockedPending = lockedProvider.pendingCommission ?? 0;
      const lockedNewPending = Math.max(0, lockedPending - pay.amount);
      const lockedShouldUnblock = lockedProvider.isBlocked && lockedNewPending < commissionLimit;
      const changed = await tx
        .update(commissionPaymentsTable)
        .set({
          status: "approved",
          reviewedBy: req.user!.userId,
          reviewedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(and(eq(commissionPaymentsTable.id, pay.id), eq(commissionPaymentsTable.status, "pending")))
        .returning({ id: commissionPaymentsTable.id });
      if (changed.length !== 1) throw new Error("COMMISSION_PAYMENT_CONFLICT");
      await tx
        .update(usersTable)
        .set({
          pendingCommission: lockedNewPending,
          isBlocked: lockedShouldUnblock ? false : lockedProvider.isBlocked,
          blockedReason: lockedShouldUnblock ? null : lockedProvider.blockedReason,
          lastCommissionPaymentAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(usersTable.id, provider.id));
      await tx.insert(auditLogTable).values({
        id: id(),
        adminId: req.user!.userId,
        adminName: adminUser?.name ?? "Admin",
        action: "payment.approve",
        target: "commission_payment",
        targetId: pay.id,
        details: { providerId: provider.id, amount: pay.amount },
        ip: req.ip ?? null,
      });
      await tx.insert(financeLedgerTable).values({
        id: id(), entryType: "commission_received", referenceType: "commission_payment", referenceId: pay.id,
        providerId: provider.id, amount: pay.amount, paymentReference: pay.reference,
        note: pay.note, createdBy: req.user!.userId, occurredAt: new Date(),
      }).onConflictDoNothing({ target: [financeLedgerTable.referenceType, financeLedgerTable.referenceId] });
    });
    // Notify provider in real-time (DB insert + WS emit + push notification)
    await notifyUser({
      userId: provider.id,
      title: "Payment approved ✅",
      body: `Your commission payment of Rs ${pay.amount} has been approved.${shouldUnblock ? " Your account has been unblocked." : ""}`,
      type: "system",
    });
    return res.json({ success: true });
  } catch (e) {
    if (e instanceof Error && e.message === "COMMISSION_PAYMENT_CONFLICT") {
      return res.status(409).json({ error: "Payment was processed by another request" });
    }
    logger.error({ err: e }, "payments.approve error");
    return res.status(500).json({ error: "Failed to approve payment" });
  }
});

adminRouter.post("/commission/:id/reject", requirePermission("finance.write"), async (req: AuthRequest, res) => {
  try {
    const reason = String(req.body?.reason ?? "").trim();
    if (reason.length < 3) return res.status(400).json({ error: "A rejection reason is required" });
    const pay = await db.query.commissionPaymentsTable.findFirst({
      where: eq(commissionPaymentsTable.id, req.params.id),
    });
    if (!pay) return res.status(404).json({ error: "Payment not found" });
    if (!canReviewCommissionPayment(pay.status, "rejected")) return res.status(409).json({ error: `Payment is already ${pay.status}` });
    const changed = await db
      .update(commissionPaymentsTable)
      .set({
        status: "rejected",
        rejectionNote: reason || null,
        reviewedBy: req.user!.userId,
        reviewedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(commissionPaymentsTable.id, pay.id), eq(commissionPaymentsTable.status, "pending")))
      .returning({ id: commissionPaymentsTable.id });
    if (changed.length !== 1) return res.status(409).json({ error: "Payment was processed by another request" });
    // Notify provider in real-time (DB insert + WS emit + push notification)
    await notifyUser({
      userId: pay.providerId,
      title: "Payment rejected ❌",
      body: reason || "Your commission payment was rejected. Please contact support.",
      type: "system",
    });
    const adminUser = await db.query.usersTable.findFirst({ where: eq(usersTable.id, req.user!.userId) });
    await db.insert(auditLogTable).values({
      id: id(),
      adminId: req.user!.userId,
      adminName: adminUser?.name ?? "Admin",
      action: "payment.reject",
      target: "commission_payment",
      targetId: pay.id,
      details: { reason },
      ip: req.ip ?? null,
    });
    return res.json({ success: true });
  } catch (e) {
    logger.error({ err: e }, "payments.reject error");
    return res.status(500).json({ error: "Failed to reject payment" });
  }
});

export { adminRouter as paymentsAdminRouter };
export default router;

