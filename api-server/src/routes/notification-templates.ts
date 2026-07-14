import crypto from "crypto";
import { Router, type Response } from "express";
import { db } from "@workspace/db";
import { auditLogTable, notificationTemplatesTable, usersTable } from "@workspace/db/schema";
import { asc, eq } from "drizzle-orm";
import { requireAuth, requireAdmin, requirePermission, type AuthRequest } from "../middlewares/auth";

const router = Router();
const CHANNELS = new Set(["push", "sms", "email"]);
const AUDIENCES = new Set(["all", "customer", "provider"]);
const keyPattern = /^[a-z][a-z0-9_]{2,63}$/;

async function audit(req: AuthRequest, action: string, targetId: string, details: Record<string, unknown>) {
  const admin = await db.query.usersTable.findFirst({ where: eq(usersTable.id, req.user!.userId) });
  await db.insert(auditLogTable).values({
    id: crypto.randomUUID(), adminId: req.user!.userId, adminName: admin?.name || "Admin",
    adminRole: admin?.adminRole || null, action, target: "notification_template", targetId,
    details, ip: req.ip ?? null,
  });
}

function validate(input: Record<string, unknown>, creating: boolean) {
  const key = String(input.key ?? "").trim();
  const name = String(input.name ?? "").trim();
  const channel = String(input.channel ?? "").trim();
  const audience = String(input.targetAudience ?? "all").trim();
  const subject = String(input.subject ?? "").trim();
  const body = String(input.body ?? "").trim();
  if (creating && !keyPattern.test(key)) return "Template key must use lowercase letters, numbers, and underscores";
  if (name && (name.length < 3 || name.length > 100)) return "Template name must be 3-100 characters";
  if (creating && !CHANNELS.has(channel)) return "Unsupported template channel";
  if (input.targetAudience !== undefined && !AUDIENCES.has(audience)) return "Unsupported target audience";
  if (body && body.length > 2000) return "Template body must be 2000 characters or fewer";
  if (subject.length > 200) return "Template subject must be 200 characters or fewer";
  if (creating && (!name || !body)) return "Name and body are required";
  if ((creating ? channel : input.channel) === "email" && creating && !subject) return "Email templates require a subject";
  return null;
}

router.use(requireAuth, requireAdmin);
router.get("/", requirePermission("settings.read"), async (_req, res: Response) => {
  try {
    const templates = await db.select().from(notificationTemplatesTable)
      .orderBy(asc(notificationTemplatesTable.channel), asc(notificationTemplatesTable.name));
    return res.json({ templates });
  } catch { return res.status(500).json({ error: "Failed to load templates" }); }
});

router.post("/", requirePermission("settings.write"), async (req: AuthRequest, res: Response) => {
  try {
    const body = req.body as Record<string, unknown>;
    const error = validate(body, true);
    if (error) return res.status(400).json({ error });
    const key = String(body.key).trim();
    const existing = await db.query.notificationTemplatesTable.findFirst({ where: eq(notificationTemplatesTable.key, key) });
    if (existing) return res.status(409).json({ error: "A template with this key already exists" });
    const template = {
      id: crypto.randomUUID(), key, name: String(body.name).trim(), channel: String(body.channel).trim(),
      targetAudience: String(body.targetAudience || "all"), subject: String(body.subject || "").trim() || null,
      body: String(body.body).trim(), isActive: body.isActive !== false,
    };
    await db.insert(notificationTemplatesTable).values(template);
    await audit(req, "notification_template.create", template.id, { key, channel: template.channel });
    return res.status(201).json({ template });
  } catch { return res.status(500).json({ error: "Failed to create template" }); }
});

router.patch("/:id", requirePermission("settings.write"), async (req: AuthRequest, res: Response) => {
  try {
    const current = await db.query.notificationTemplatesTable.findFirst({ where: eq(notificationTemplatesTable.id, req.params.id as string) });
    if (!current) return res.status(404).json({ error: "Template not found" });
    const error = validate(req.body as Record<string, unknown>, false);
    if (error) return res.status(400).json({ error });
    const update: Record<string, unknown> = { updatedAt: new Date() };
    for (const field of ["name", "subject", "body"] as const) if (req.body?.[field] !== undefined) update[field] = String(req.body[field]).trim() || (field === "subject" ? null : "");
    if (typeof req.body?.isActive === "boolean") update.isActive = req.body.isActive;
    if (req.body?.targetAudience !== undefined) update.targetAudience = String(req.body.targetAudience);
    const [updated] = await db.update(notificationTemplatesTable).set(update).where(eq(notificationTemplatesTable.id, current.id)).returning();
    await audit(req, "notification_template.update", current.id, { before: current, after: updated });
    return res.json({ template: updated });
  } catch { return res.status(500).json({ error: "Failed to update template" }); }
});

router.delete("/:id", requirePermission("settings.write"), async (req: AuthRequest, res: Response) => {
  try {
    const [updated] = await db.update(notificationTemplatesTable).set({ isActive: false, updatedAt: new Date() })
      .where(eq(notificationTemplatesTable.id, req.params.id as string)).returning();
    if (!updated) return res.status(404).json({ error: "Template not found" });
    await audit(req, "notification_template.deactivate", updated.id, { key: updated.key });
    return res.json({ success: true, template: updated });
  } catch { return res.status(500).json({ error: "Failed to deactivate template" }); }
});

export default router;
