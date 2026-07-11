import crypto from "crypto";
import { Router } from "express";
import { db } from "@workspace/db";
import { auditLogTable, serviceAreasTable, usersTable } from "@workspace/db/schema";
import { and, asc, eq, isNull, ne, sql } from "drizzle-orm";
import { requireAuth, requireAdmin, requirePermission, type AuthRequest } from "../middlewares/auth";
import { logger } from "../lib/logger";
import { emitToRole } from "../lib/eventBus";

function genId() { return crypto.randomUUID(); }

function normalize(value: unknown, max: number): string {
  return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, max);
}

async function audit(req: AuthRequest, action: string, targetId: string, details: Record<string, unknown>) {
  const admin = await db.query.usersTable.findFirst({ where: eq(usersTable.id, req.user!.userId) });
  await db.insert(auditLogTable).values({
    id: genId(), adminId: req.user!.userId, adminName: admin?.name || "Admin",
    adminRole: admin?.adminRole || null, action, target: "service_area", targetId,
    details, ip: req.ip ?? null,
  });
}

function emitServiceAreasChanged(action: string, area?: unknown) {
  const payload = { resource: "service-areas", action, area, updatedAt: new Date().toISOString() };
  emitToRole("customer", "admin:event", payload);
  emitToRole("provider", "admin:event", payload);
  emitToRole("admin", "admin:event", payload);
}

export const serviceAreasPublicRouter = Router();
export const serviceAreasAdminRouter = Router();

serviceAreasPublicRouter.get("/", async (_req, res) => {
  try {
    const areas = await db.select().from(serviceAreasTable)
      .where(eq(serviceAreasTable.isActive, true))
      .orderBy(asc(serviceAreasTable.sortOrder), asc(serviceAreasTable.name));
    return res.json({ areas });
  } catch (e) {
    logger.error({ err: e }, "service-areas list error");
    return res.status(500).json({ error: "Failed to load service areas" });
  }
});

serviceAreasAdminRouter.use(requireAuth, requireAdmin);
serviceAreasAdminRouter.get("/", requirePermission("settings.read"), async (_req, res) => {
  const areas = await db.select().from(serviceAreasTable)
    .orderBy(asc(serviceAreasTable.sortOrder), asc(serviceAreasTable.name));
  return res.json({ areas });
});

serviceAreasAdminRouter.post("/", requirePermission("settings.write"), async (req: AuthRequest, res) => {
  try {
    const name = normalize(req.body?.name, 80);
    const province = normalize(req.body?.province, 80) || null;
    const sortOrder = Number(req.body?.sortOrder ?? 0);
    if (name.length < 2) return res.status(400).json({ error: "City name must be at least 2 characters" });
    if (!Number.isInteger(sortOrder) || sortOrder < -10000 || sortOrder > 10000) return res.status(400).json({ error: "Invalid sort order" });
    const duplicate = await db.query.serviceAreasTable.findFirst({ where: and(
      eq(serviceAreasTable.name, name),
      province ? eq(serviceAreasTable.province, province) : isNull(serviceAreasTable.province),
    ) });
    if (duplicate) return res.status(409).json({ error: "This service area already exists" });
    const area = { id: genId(), name, province, isActive: req.body?.isActive !== false, sortOrder, createdAt: new Date(), updatedAt: new Date() };
    await db.insert(serviceAreasTable).values(area);
    await audit(req, "service_area.create", area.id, { name, province, sortOrder });
    emitServiceAreasChanged("created", area);
    return res.status(201).json({ area });
  } catch (e) {
    logger.error({ err: e }, "service-areas create error");
    return res.status(500).json({ error: "Failed to create service area" });
  }
});

serviceAreasAdminRouter.patch("/:id", requirePermission("settings.write"), async (req: AuthRequest, res) => {
  try {
    const current = await db.query.serviceAreasTable.findFirst({ where: eq(serviceAreasTable.id, req.params.id as string) });
    if (!current) return res.status(404).json({ error: "Service area not found" });
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    const nextName = req.body?.name !== undefined ? normalize(req.body.name, 80) : current.name;
    const nextProvince = req.body?.province !== undefined ? (normalize(req.body.province, 80) || null) : current.province;
    if (nextName.length < 2) return res.status(400).json({ error: "City name must be at least 2 characters" });
    const duplicate = await db.query.serviceAreasTable.findFirst({ where: and(
      eq(serviceAreasTable.name, nextName),
      nextProvince ? eq(serviceAreasTable.province, nextProvince) : isNull(serviceAreasTable.province),
      ne(serviceAreasTable.id, current.id),
    ) });
    if (duplicate) return res.status(409).json({ error: "This service area already exists" });
    if (req.body?.name !== undefined) updates.name = nextName;
    if (req.body?.province !== undefined) updates.province = nextProvince;
    if (typeof req.body?.isActive === "boolean") updates.isActive = req.body.isActive;
    if (req.body?.sortOrder !== undefined) {
      const sortOrder = Number(req.body.sortOrder);
      if (!Number.isInteger(sortOrder) || sortOrder < -10000 || sortOrder > 10000) return res.status(400).json({ error: "Invalid sort order" });
      updates.sortOrder = sortOrder;
    }
    const [area] = await db.update(serviceAreasTable).set(updates).where(eq(serviceAreasTable.id, current.id)).returning();
    await audit(req, "service_area.update", current.id, { before: current, after: area });
    emitServiceAreasChanged("updated", area);
    return res.json({ area });
  } catch (e) {
    logger.error({ err: e }, "service-areas update error");
    return res.status(500).json({ error: "Failed to update service area" });
  }
});

serviceAreasAdminRouter.delete("/:id", requirePermission("settings.write"), async (req: AuthRequest, res) => {
  try {
    const [area] = await db.update(serviceAreasTable).set({ isActive: false, updatedAt: new Date() })
      .where(eq(serviceAreasTable.id, req.params.id as string)).returning();
    if (!area) return res.status(404).json({ error: "Service area not found" });
    await audit(req, "service_area.deactivate", area.id, { name: area.name });
    emitServiceAreasChanged("deactivated", area);
    return res.json({ success: true, area });
  } catch (e) {
    logger.error({ err: e }, "service-areas deactivate error");
    return res.status(500).json({ error: "Failed to deactivate service area" });
  }
});

export async function seedServiceAreasIfEmpty() {
  try {
    const existing = await db.select().from(serviceAreasTable).limit(1);
    if (existing.length > 0) return;
    const defaults = [
      ["Islamabad", "Islamabad Capital Territory"], ["Rawalpindi", "Punjab"], ["Lahore", "Punjab"], ["Karachi", "Sindh"],
      ["Faisalabad", "Punjab"], ["Peshawar", "Khyber Pakhtunkhwa"], ["Quetta", "Balochistan"], ["Multan", "Punjab"],
    ];
    await db.insert(serviceAreasTable).values(defaults.map(([name, province], sortOrder) => ({ id: genId(), name, province, sortOrder, isActive: true, createdAt: new Date(), updatedAt: new Date() })));
  } catch (e) { logger.error({ err: e }, "Failed to seed service areas"); }
}
