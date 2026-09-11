import { Router, type Response } from "express";
import { db } from "@workspace/db";
import { invoicesTable } from "@workspace/db/schema";
import { desc, eq, or } from "drizzle-orm";
import { requireAuth, type AuthRequest } from "../middlewares/auth";
import { logger } from "../lib/logger";
import {
  invoiceVerificationPayload,
  isValidInvoiceVerificationToken,
} from "../lib/invoiceVerification";

const router = Router();
const INVOICE_NUMBER_PATTERN = /^ATH-[0-9]{6,12}$/;

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function serializeInvoice<T extends { invoiceNumber: string }>(invoice: T): T & {
  verification: { verificationUrl: string; qrCodeDataUri: string };
} {
  return { ...invoice, verification: invoiceVerificationPayload(invoice.invoiceNumber) };
}

function publicVerificationHtml(invoice: typeof invoicesTable.$inferSelect): string {
  const validStatus = invoice.status === "cancelled" ? "CANCELLED" : "VERIFIED";
  const statusColor = invoice.status === "cancelled" ? "#DC2626" : "#059669";
  const issuedAt = invoice.createdAt ? new Date(invoice.createdAt).toLocaleDateString("en-PK", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }) : "";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Athoo Invoice Verification</title><style>
  :root{color-scheme:light}*{box-sizing:border-box}body{margin:0;background:#F8FAFC;color:#0F172A;font-family:Arial,sans-serif;padding:24px}.card{max-width:560px;margin:40px auto;background:#fff;border:1px solid #CBD5E1;border-radius:20px;overflow:hidden;box-shadow:0 16px 44px rgba(15,23,42,.10)}.head{padding:28px;background:linear-gradient(135deg,#1A6EE0,#1558B4);color:#fff}.brand{font-size:28px;font-weight:900}.sub{font-size:13px;opacity:.84;margin-top:4px}.body{padding:28px}.badge{display:inline-block;padding:7px 13px;border-radius:999px;background:${statusColor}18;color:${statusColor};font-weight:800;font-size:12px}.number{font-size:25px;font-weight:900;margin:16px 0 22px}.row{display:flex;justify-content:space-between;gap:20px;padding:12px 0;border-bottom:1px solid #E2E8F0}.label{color:#64748B}.value{text-align:right;font-weight:700}.note{margin-top:22px;padding:14px;border-radius:12px;background:#EFF6FF;color:#1E40AF;font-size:13px;line-height:1.5}.foot{text-align:center;color:#64748B;font-size:12px;margin-top:20px}</style></head><body><main class="card"><header class="head"><div class="brand">Athoo</div><div class="sub">Official invoice verification · Pakistan</div></header><section class="body"><div class="badge">${escapeHtml(validStatus)}</div><div class="number">${escapeHtml(invoice.invoiceNumber)}</div><div class="row"><span class="label">Service</span><span class="value">${escapeHtml(invoice.service)}</span></div><div class="row"><span class="label">Invoice status</span><span class="value">${escapeHtml(String(invoice.status || "issued").toUpperCase())}</span></div><div class="row"><span class="label">Scheduled date</span><span class="value">${escapeHtml(invoice.scheduledDate)}</span></div><div class="row"><span class="label">Issued</span><span class="value">${escapeHtml(issuedAt)}</span></div><div class="row"><span class="label">Total</span><span class="value">Rs. ${Number(invoice.totalAmount || 0).toLocaleString("en-PK")}</span></div><div class="note">This record was verified directly through the official Athoo system. Names, phone numbers, addresses and private booking details are intentionally hidden.</div><div class="foot">athoo.pk · official@athoo.pk · @athoo_services</div></section></main></body></html>`;
}

// Public by design: the QR contains a signed, unguessable HMAC token and this
// endpoint returns only a minimal, non-personal verification record.
router.get("/verify/:invoiceNumber", async (req, res: Response) => {
  const invoiceNumber = String(req.params.invoiceNumber || "").trim().toUpperCase();
  const token = typeof req.query.token === "string" ? req.query.token : "";
  if (!INVOICE_NUMBER_PATTERN.test(invoiceNumber) || !isValidInvoiceVerificationToken(invoiceNumber, token)) {
    return res.status(404).json({ error: "Invoice verification not found", code: "INVOICE_NOT_VERIFIED" });
  }
  try {
    const [invoice] = await db.select().from(invoicesTable).where(eq(invoicesTable.invoiceNumber, invoiceNumber)).limit(1);
    if (!invoice) return res.status(404).json({ error: "Invoice verification not found", code: "INVOICE_NOT_VERIFIED" });

    res.setHeader("Cache-Control", "no-store");
    const wantsHtml = String(req.headers.accept || "").includes("text/html");
    if (wantsHtml) {
      res.setHeader("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; frame-ancestors 'none'; form-action 'none'");
      return res.type("html").send(publicVerificationHtml(invoice));
    }
    return res.json({
      valid: true,
      invoice: {
        invoiceNumber: invoice.invoiceNumber,
        service: invoice.service,
        scheduledDate: invoice.scheduledDate,
        totalAmount: invoice.totalAmount,
        status: invoice.status,
        issuedAt: invoice.createdAt,
      },
    });
  } catch (err) {
    logger.error({ err, invoiceNumber }, "invoice verification error");
    return res.status(500).json({ error: "Unable to verify invoice" });
  }
});

router.get("/", requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.userId;
    const invoices = await db
      .select()
      .from(invoicesTable)
      .where(or(eq(invoicesTable.customerId, userId), eq(invoicesTable.providerId, userId)))
      .orderBy(desc(invoicesTable.createdAt));
    return res.json({ invoices: invoices.map(serializeInvoice) });
  } catch (err) {
    logger.error({ err }, "invoices list error");
    return res.status(500).json({ error: "Failed to load invoices" });
  }
});

router.get("/booking/:bookingId", requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.userId;
    const bookingId = String(req.params.bookingId || "").trim();
    if (!bookingId || bookingId.length > 128) return res.status(400).json({ error: "Invalid booking ID" });
    const [invoice] = await db.select().from(invoicesTable).where(eq(invoicesTable.bookingId, bookingId)).limit(1);
    if (!invoice) return res.status(404).json({ error: "Invoice not found" });
    if (invoice.customerId !== userId && invoice.providerId !== userId) {
      return res.status(403).json({ error: "Access denied" });
    }
    return res.json({ invoice: serializeInvoice(invoice) });
  } catch (err) {
    logger.error({ err }, "invoice by booking error");
    return res.status(500).json({ error: "Failed to load invoice" });
  }
});

router.get("/:id", requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.userId;
    const id = String(req.params.id || "").trim();
    if (!id || id.length > 128) return res.status(400).json({ error: "Invalid invoice ID" });
    const [invoice] = await db.select().from(invoicesTable).where(eq(invoicesTable.id, id)).limit(1);
    if (!invoice) return res.status(404).json({ error: "Invoice not found" });
    if (invoice.customerId !== userId && invoice.providerId !== userId) {
      return res.status(403).json({ error: "Access denied" });
    }
    return res.json({ invoice: serializeInvoice(invoice) });
  } catch (err) {
    logger.error({ err }, "invoice get error");
    return res.status(500).json({ error: "Failed to load invoice" });
  }
});

export default router;
