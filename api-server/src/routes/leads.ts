/**
 * Leads / Waitlist API
 *
 * Public:
 *   POST /api/leads          — Submit a lead (customer/provider/contact form)
 *
 * Admin (requireAdmin):
 *   GET  /api/admin/leads    — List with filters (type, status, search, date)
 *   GET  /api/admin/leads/:id
 *   PATCH /api/admin/leads/:id/status
 *   PATCH /api/admin/leads/:id/notes
 *   DELETE /api/admin/leads/:id
 *   GET  /api/admin/leads/export — CSV download
 *
 * Duplicate detection: if the same phone OR email is submitted within 30 days,
 * the new record is saved (for audit) but flagged as isDuplicate=true.
 * Admin notification is created for new non-duplicate leads.
 */

import { Router, type Response, type Request } from "express";
import { db } from "@workspace/db";
import { leadsTable, usersTable } from "@workspace/db/schema";
import { and, desc, eq, gte, ilike, or, sql } from "drizzle-orm";
import { requireAuth, requireAdmin, requirePermission, type AuthRequest } from "../middlewares/auth";
import { generateId } from "../lib/admin";
import { logger } from "../lib/logger";
import { sendEmail } from "../lib/email";
import { createAdminNotification } from "../lib/adminNotifications";
import { csvCell, escapeHtml } from "../lib/contentSecurity";

const router = Router();
const adminRouter = Router();
adminRouter.use(requireAuth, requireAdmin);

// ─── Rate limit: 5 submissions per IP per 10 min (spam protection) ────────────
const _ipLeadCount = new Map<string, { count: number; resetAt: number }>();
function checkLeadRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = _ipLeadCount.get(ip);
  if (!entry || now > entry.resetAt) {
    _ipLeadCount.set(ip, { count: 1, resetAt: now + 10 * 60 * 1000 });
    return true;
  }
  if (entry.count >= 5) return false;
  entry.count++;
  return true;
}

// ── POST /api/leads (public — no auth required) ───────────────────────────────
router.post("/", async (req: Request, res: Response) => {
  try {
    const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.socket.remoteAddress || "";
    if (!checkLeadRateLimit(ip)) {
      res.status(429).json({ error: "Too many submissions. Please wait a few minutes." });
      return;
    }

    const { type, name, phone, email, message, service, city, source } = req.body as Record<string, string | undefined>;

    if (!type || !["customer", "provider", "contact"].includes(type)) {
      res.status(400).json({ error: "type must be 'customer', 'provider', or 'contact'" });
      return;
    }
    if (!name?.trim()) { res.status(400).json({ error: "Name is required" }); return; }
    if (!phone?.trim()) { res.status(400).json({ error: "Phone number is required" }); return; }

    const cleanPhone = phone.trim().replace(/\s+/g, "");
    const cleanEmail = email?.trim().toLowerCase() || null;

    // Duplicate detection: same phone OR email in the last 30 days
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const conditions = [
      and(eq(leadsTable.phone, cleanPhone), gte(leadsTable.createdAt, thirtyDaysAgo)),
    ];
    if (cleanEmail) {
      conditions.push(and(eq(leadsTable.email, cleanEmail), gte(leadsTable.createdAt, thirtyDaysAgo)));
    }
    const existing = await db.select({ id: leadsTable.id })
      .from(leadsTable)
      .where(or(...conditions))
      .limit(1);

    const isDuplicate = existing.length > 0;

    const id = generateId();
    await db.insert(leadsTable).values({
      id,
      type,
      name: name.trim(),
      phone: cleanPhone,
      email: cleanEmail,
      message: message?.trim() || null,
      service: service?.trim() || null,
      city: city?.trim() || null,
      source: source?.trim() || "website",
      status: "new",
      isDuplicate,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Notify admins about new non-duplicate leads
    if (!isDuplicate) {
      await createAdminNotification({
        type: "lead",
        title: `New ${type} lead`,
        message: `${name.trim()} (${cleanPhone}) submitted a ${type} enquiry`,
        link: `/admin/leads/${id}`,
      }).catch(() => undefined); // non-critical

      // Also send email to support if SMTP is configured
      sendEmail({
        to: process.env.SMTP_USER || "admin@athoo.pk",
        subject: `New Athoo ${type} lead: ${name.trim()}`,
        html: `<div style="font-family:Arial,sans-serif;padding:20px"><h2>New Lead</h2><p><b>Type:</b> ${escapeHtml(type)}</p><p><b>Name:</b> ${escapeHtml(name.trim())}</p><p><b>Phone:</b> ${escapeHtml(cleanPhone)}</p>${cleanEmail ? `<p><b>Email:</b> ${escapeHtml(cleanEmail)}</p>` : ""}${message ? `<p><b>Message:</b> ${escapeHtml(message.trim())}</p>` : ""}${service ? `<p><b>Service:</b> ${escapeHtml(service)}</p>` : ""}${city ? `<p><b>City:</b> ${escapeHtml(city)}</p>` : ""}</div>`,
        text: `New ${type} lead: ${name.trim()} | ${cleanPhone}${cleanEmail ? ` | ${cleanEmail}` : ""}${message ? `\n${message}` : ""}`,
      }).catch(() => undefined);
    }

    res.status(201).json({ ok: true, isDuplicate });
  } catch (err) {
    logger.error({ err }, "leads submit error");
    res.status(500).json({ error: "Failed to submit. Please try again." });
  }
});

// ── GET /api/admin/leads ──────────────────────────────────────────────────────
adminRouter.get("/leads", requirePermission("users.read"), async (req: AuthRequest, res: Response) => {
  try {
    const { type, status, search, from, to, limit: lim, offset: off } = req.query as Record<string, string | undefined>;
    const pageLimit = Math.min(Number(lim) || 50, 200);
    const pageOffset = Number(off) || 0;

    const conditions: ReturnType<typeof eq>[] = [];
    if (type && type !== "all") conditions.push(eq(leadsTable.type, type));
    if (status && status !== "all") conditions.push(eq(leadsTable.status, status));
    if (from) conditions.push(gte(leadsTable.createdAt, new Date(from)));
    if (to) conditions.push(gte(leadsTable.createdAt, new Date(to)));

    let query = db.select().from(leadsTable).orderBy(desc(leadsTable.createdAt));

    let allRows = await query.limit(2000);

    // Search filter (name, phone, email, message)
    if (search?.trim()) {
      const q = search.trim().toLowerCase();
      allRows = allRows.filter(r =>
        r.name.toLowerCase().includes(q) ||
        r.phone.includes(q) ||
        (r.email || "").toLowerCase().includes(q) ||
        (r.message || "").toLowerCase().includes(q)
      );
    }

    // Type/status filters
    if (type && type !== "all") allRows = allRows.filter(r => r.type === type);
    if (status && status !== "all") allRows = allRows.filter(r => r.status === status);

    const total = allRows.length;
    const leads = allRows.slice(pageOffset, pageOffset + pageLimit);

    res.json({ leads, total, limit: pageLimit, offset: pageOffset });
  } catch (err) {
    logger.error({ err }, "admin leads list error");
    res.status(500).json({ error: "Failed to load leads" });
  }
});

// ── GET /api/admin/leads/export (CSV) ────────────────────────────────────────
adminRouter.get("/leads/export", requirePermission("users.read"), async (_req: AuthRequest, res: Response) => {
  try {
    const leads = await db.select().from(leadsTable).orderBy(desc(leadsTable.createdAt)).limit(5000);
    const header = ["ID", "Type", "Name", "Phone", "Email", "Service", "City", "Status", "Source", "Duplicate", "Message", "Created"].map(csvCell).join(",");
    const rows = leads.map((lead) => [
      lead.id, lead.type, lead.name, lead.phone, lead.email || "", lead.service || "",
      lead.city || "", lead.status, lead.source || "", lead.isDuplicate ? "Yes" : "No",
      String(lead.message || "").replace(/\r?\n/g, " "), lead.createdAt?.toISOString() || "",
    ].map(csvCell).join(","));
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="athoo-leads-${new Date().toISOString().split("T")[0]}.csv"`);
    res.send("\uFEFF" + [header, ...rows].join("\n"));
  } catch (err) {
    logger.error({ err }, "admin leads export error");
    res.status(500).json({ error: "Export failed" });
  }
});

// ── GET /api/admin/leads/:id ──────────────────────────────────────────────────
adminRouter.get("/leads/:id", requirePermission("users.read"), async (req: AuthRequest, res: Response) => {
  try {
    const lead = await db.query.leadsTable.findFirst({ where: eq(leadsTable.id, req.params.id) });
    if (!lead) { res.status(404).json({ error: "Lead not found" }); return; }
    res.json({ lead });
  } catch (err) {
    logger.error({ err }, "admin lead get error");
    res.status(500).json({ error: "Failed to load lead" });
  }
});

// ── PATCH /api/admin/leads/:id/status ────────────────────────────────────────
adminRouter.patch("/leads/:id/status", requirePermission("users.write"), async (req: AuthRequest, res: Response) => {
  try {
    const { status, notes } = req.body as { status?: string; notes?: string };
    const valid = ["new", "contacted", "converted", "not_interested", "duplicate", "archived"];
    if (!status || !valid.includes(status)) {
      res.status(400).json({ error: `status must be one of: ${valid.join(", ")}` });
      return;
    }
    const extra: Record<string, unknown> = { status, updatedAt: new Date() };
    if (status === "contacted") extra.contactedAt = new Date();
    if (notes?.trim()) extra.notes = notes.trim();
    await db.update(leadsTable).set(extra).where(eq(leadsTable.id, req.params.id));
    const updated = await db.query.leadsTable.findFirst({ where: eq(leadsTable.id, req.params.id) });
    res.json({ lead: updated });
  } catch (err) {
    logger.error({ err }, "admin lead status update error");
    res.status(500).json({ error: "Failed to update lead" });
  }
});

// ── PATCH /api/admin/leads/:id/notes ─────────────────────────────────────────
adminRouter.patch("/leads/:id/notes", requirePermission("users.write"), async (req: AuthRequest, res: Response) => {
  try {
    const { notes } = req.body as { notes?: string };
    await db.update(leadsTable).set({ notes: notes?.trim() || null, updatedAt: new Date() }).where(eq(leadsTable.id, req.params.id));
    const updated = await db.query.leadsTable.findFirst({ where: eq(leadsTable.id, req.params.id) });
    res.json({ lead: updated });
  } catch (err) {
    logger.error({ err }, "admin lead notes update error");
    res.status(500).json({ error: "Failed to update notes" });
  }
});

// ── DELETE /api/admin/leads/:id ───────────────────────────────────────────────
adminRouter.delete("/leads/:id", requirePermission("users.write"), async (req: AuthRequest, res: Response) => {
  try {
    await db.delete(leadsTable).where(eq(leadsTable.id, req.params.id));
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "admin lead delete error");
    res.status(500).json({ error: "Failed to delete lead" });
  }
});

export { router as leadsPublicRouter, adminRouter as leadsAdminRouter };
