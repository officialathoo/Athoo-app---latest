import { Router, type Response } from "express";
import { db } from "@workspace/db";
import { emergencyContactsTable } from "@workspace/db/schema";
import { eq, asc } from "drizzle-orm";
import { requireAuth, requireAdmin, requirePermission, type AuthRequest } from "../middlewares/auth";
import crypto from "crypto";

function generateId(): string { return crypto.randomUUID(); }

const publicRouter = Router();
const adminRouter = Router();

// GET /emergency-contacts — public, returns active contacts sorted
publicRouter.get("/", async (_req, res: Response) => {
  try {
    const contacts = await db
      .select()
      .from(emergencyContactsTable)
      .where(eq(emergencyContactsTable.isActive, true))
      .orderBy(asc(emergencyContactsTable.sortOrder));
    return res.json({ contacts });
  } catch {
    return res.status(500).json({ error: "Failed to load emergency contacts" });
  }
});

// Admin routes
adminRouter.use(requireAuth, requireAdmin);

adminRouter.get("/", async (_req, res: Response) => {
  try {
    const contacts = await db
      .select()
      .from(emergencyContactsTable)
      .orderBy(asc(emergencyContactsTable.sortOrder));
    return res.json({ contacts });
  } catch {
    return res.status(500).json({ error: "Failed to load emergency contacts" });
  }
});

adminRouter.post("/", requirePermission("settings.write"), async (req: AuthRequest, res: Response) => {
  try {
    const { name, number, description, icon, sortOrder, isActive } = req.body as Record<string, any>;
    if (!name?.trim() || !number?.trim()) {
      return res.status(400).json({ error: "Name and number are required" });
    }
    const contact = {
      id: generateId(),
      name: name.trim(),
      number: number.trim(),
      description: description?.trim() || null,
      icon: icon || "phone-call",
      sortOrder: sortOrder != null ? Number(sortOrder) : 0,
      isActive: isActive !== false,
    };
    await db.insert(emergencyContactsTable).values(contact);
    return res.json({ contact });
  } catch {
    return res.status(500).json({ error: "Failed to create emergency contact" });
  }
});

adminRouter.patch("/:id", requirePermission("settings.write"), async (req: AuthRequest, res: Response) => {
  try {
    const { name, number, description, icon, sortOrder, isActive } = req.body as Record<string, any>;
    const update: Record<string, any> = { updatedAt: new Date() };
    if (name !== undefined) update.name = name.trim();
    if (number !== undefined) update.number = number.trim();
    if (description !== undefined) update.description = description?.trim() || null;
    if (icon !== undefined) update.icon = icon;
    if (sortOrder !== undefined) update.sortOrder = Number(sortOrder);
    if (isActive !== undefined) update.isActive = Boolean(isActive);
    await db.update(emergencyContactsTable).set(update).where(eq(emergencyContactsTable.id, req.params.id as string));
    const updated = await db.query.emergencyContactsTable.findFirst({ where: eq(emergencyContactsTable.id, req.params.id as string) });
    return res.json({ contact: updated });
  } catch {
    return res.status(500).json({ error: "Failed to update emergency contact" });
  }
});

adminRouter.delete("/:id", requirePermission("settings.write"), async (req: AuthRequest, res: Response) => {
  try {
    await db.delete(emergencyContactsTable).where(eq(emergencyContactsTable.id, req.params.id as string));
    return res.json({ success: true });
  } catch {
    return res.status(500).json({ error: "Failed to delete emergency contact" });
  }
});

export { publicRouter as emergencyContactsPublicRouter, adminRouter as emergencyContactsAdminRouter };
export default publicRouter;
