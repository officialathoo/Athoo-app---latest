import { Router } from "express";
import { logger } from "../lib/logger";
import crypto from "crypto";
import { db } from "@workspace/db";
import { serviceCategoriesTable, auditLogTable, usersTable } from "@workspace/db/schema";
import { and, asc, eq, ne } from "drizzle-orm";
import {
  requireAuth,
  requireAdmin,
  requirePermission,
  type AuthRequest,
} from "../middlewares/auth";
import { emitToRole } from "../lib/eventBus";

async function getAdminName(userId: string): Promise<string> {
  try {
    const row = await db.query.usersTable.findFirst({ where: eq(usersTable.id, userId) });
    return row?.name || userId;
  } catch {
    return userId;
  }
}

const router = Router();

const id = () => crypto.randomUUID();
const slugify = (s: string) =>
  s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60);

function validateCategoryValues(input: Record<string, unknown>, creating = false): string | null {
  const name = String(input.name ?? "").trim();
  const visitCharge = Number(input.visitCharge ?? 0);
  const minRate = input.minHourlyRate == null || input.minHourlyRate === "" ? null : Number(input.minHourlyRate);
  const maxRate = input.maxHourlyRate == null || input.maxHourlyRate === "" ? null : Number(input.maxHourlyRate);
  const sortOrder = Number(input.sortOrder ?? 0);
  const color = String(input.color ?? "#1A6EE0");
  if ((creating || input.name !== undefined) && (name.length < 2 || name.length > 100)) return "Category name must be 2-100 characters";
  if (!Number.isInteger(visitCharge) || visitCharge < 0 || visitCharge > 100_000) return "Invalid visit charge";
  if (minRate !== null && (!Number.isInteger(minRate) || minRate < 0 || minRate > 1_000_000)) return "Invalid minimum hourly rate";
  if (maxRate !== null && (!Number.isInteger(maxRate) || maxRate < 0 || maxRate > 1_000_000)) return "Invalid maximum hourly rate";
  if (minRate !== null && maxRate !== null && maxRate < minRate) return "Maximum hourly rate cannot be lower than minimum hourly rate";
  if (!Number.isInteger(sortOrder) || sortOrder < -10000 || sortOrder > 10000) return "Invalid sort order";
  if (!/^#[0-9A-Fa-f]{6}$/.test(color)) return "Color must be a 6-digit hex value";
  const keywords = Array.isArray(input.searchKeywords) ? input.searchKeywords.map(String) : String(input.searchKeywords ?? "").split(",");
  if (keywords.filter((x) => x.trim()).length > 30 || keywords.some((x) => x.trim().length > 60)) return "Search keywords are invalid";
  return null;
}

function emitCategoryChanged(action: string, category?: any) {
  const payload = { resource: "categories", action, category, updatedAt: new Date().toISOString() };
  emitToRole("customer", "admin:event", payload);
  emitToRole("provider", "admin:event", payload);
  emitToRole("admin", "admin:event", payload);
}

// PUBLIC — list active categories (used by both customer & provider apps)
router.get("/", async (req, res) => {
  try {
    const all = req.query.all === "true";
    const where = all ? undefined : eq(serviceCategoriesTable.isActive, true);
    const rows = await db
      .select()
      .from(serviceCategoriesTable)
      .where(where as any)
      .orderBy(asc(serviceCategoriesTable.sortOrder), asc(serviceCategoriesTable.name));
    return res.json({ categories: rows });
  } catch (e) {
    logger.error({ err: e }, "categories.list error");
    return res.status(500).json({ error: "Failed to load categories" });
  }
});

router.get("/:slug", async (req, res) => {
  try {
    const row = await db.query.serviceCategoriesTable.findFirst({
      where: eq(serviceCategoriesTable.slug, req.params.slug),
    });
    if (!row) return res.status(404).json({ error: "Category not found" });
    return res.json({ category: row });
  } catch (e) {
    logger.error({ err: e }, "categories.get error");
    return res.status(500).json({ error: "Failed to load category" });
  }
});

// ADMIN — full CRUD
const adminRouter = Router();
adminRouter.use(requireAuth, requireAdmin);

adminRouter.get("/", requirePermission("marketing.read"), async (_req, res) => {
  const rows = await db
    .select()
    .from(serviceCategoriesTable)
    .orderBy(asc(serviceCategoriesTable.sortOrder), asc(serviceCategoriesTable.name));
  return res.json({ categories: rows });
});

adminRouter.post("/", requirePermission("marketing.write"), async (req: AuthRequest, res) => {
  try {
    const {
      name,
      slug,
      icon,
      color,
      visitCharge,
      minHourlyRate,
      maxHourlyRate,
      description,
      searchKeywords,
      isFeatured,
      isActive,
      sortOrder,
    } = req.body ?? {};
    const validationError = validateCategoryValues(req.body ?? {}, true);
    if (validationError) return res.status(400).json({ error: validationError });
    const finalSlug = slugify(slug || name);
    const existing = await db.query.serviceCategoriesTable.findFirst({
      where: eq(serviceCategoriesTable.slug, finalSlug),
    });
    if (existing) {
      return res.status(409).json({ error: "A category with this slug already exists" });
    }
    const newId = id();
    await db.insert(serviceCategoriesTable).values({
      id: newId,
      name: name.trim(),
      slug: finalSlug,
      icon: typeof icon === "string" ? icon : "tool",
      color: typeof color === "string" ? color : "#1A6EE0",
      visitCharge: Number.isFinite(Number(visitCharge)) ? Number(visitCharge) : 0,
      minHourlyRate: Number.isFinite(Number(minHourlyRate)) ? Number(minHourlyRate) : null,
      maxHourlyRate: Number.isFinite(Number(maxHourlyRate)) ? Number(maxHourlyRate) : null,
      description: typeof description === "string" ? description.trim() : null,
      searchKeywords: Array.isArray(searchKeywords)
        ? searchKeywords.map((item) => String(item).trim()).filter(Boolean).join(",")
        : typeof searchKeywords === "string" ? searchKeywords.trim() : "",
      isFeatured: isFeatured === true,
      isActive: isActive !== false,
      sortOrder: Number.isFinite(Number(sortOrder)) ? Number(sortOrder) : 0,
      createdBy: req.user?.userId,
    });
    const adminDisplayName = await getAdminName(req.user!.userId);
    await db.insert(auditLogTable).values({
      id: id(),
      adminId: req.user!.userId,
      adminName: adminDisplayName,
      action: "category.create",
      target: "service_category",
      targetId: newId,
      details: { name, slug: finalSlug },
      ip: req.ip ?? null,
    });
    const row = await db.query.serviceCategoriesTable.findFirst({
      where: eq(serviceCategoriesTable.id, newId),
    });
    emitCategoryChanged("created", row);
    return res.status(201).json({ category: row });
  } catch (e) {
    logger.error({ err: e }, "categories.create error");
    return res.status(500).json({ error: "Failed to create category" });
  }
});

adminRouter.patch("/:id", requirePermission("marketing.write"), async (req: AuthRequest, res) => {
  try {
    const cat = await db.query.serviceCategoriesTable.findFirst({
      where: eq(serviceCategoriesTable.id, req.params.id),
    });
    if (!cat) return res.status(404).json({ error: "Category not found" });
    const validationError = validateCategoryValues({ ...cat, ...req.body }, false);
    if (validationError) return res.status(400).json({ error: validationError });
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    const { name, slug, icon, color, visitCharge, minHourlyRate, maxHourlyRate, description, searchKeywords, isFeatured, isActive, sortOrder } = req.body ?? {};
    if (typeof name === "string" && name.trim()) patch.name = name.trim();
    if (typeof slug === "string" && slug.trim()) {
      const nextSlug = slugify(slug);
      const duplicate = await db.query.serviceCategoriesTable.findFirst({
        where: and(eq(serviceCategoriesTable.slug, nextSlug), ne(serviceCategoriesTable.id, cat.id)),
      });
      if (duplicate) return res.status(409).json({ error: "A category with this slug already exists" });
      patch.slug = nextSlug;
    }
    if (typeof icon === "string") patch.icon = icon;
    if (typeof color === "string") patch.color = color;
    if (typeof description === "string") patch.description = description.trim();
    if (Array.isArray(searchKeywords)) patch.searchKeywords = searchKeywords.map((item) => String(item).trim()).filter(Boolean).join(",");
    else if (typeof searchKeywords === "string") patch.searchKeywords = searchKeywords.trim();
    if (typeof isFeatured === "boolean") patch.isFeatured = isFeatured;
    if (Number.isFinite(Number(visitCharge))) patch.visitCharge = Number(visitCharge);
    if (minHourlyRate !== undefined) patch.minHourlyRate = minHourlyRate === null ? null : Number(minHourlyRate);
    if (maxHourlyRate !== undefined) patch.maxHourlyRate = maxHourlyRate === null ? null : Number(maxHourlyRate);
    if (Number.isFinite(Number(sortOrder))) patch.sortOrder = Number(sortOrder);
    if (typeof isActive === "boolean") patch.isActive = isActive;
    await db.update(serviceCategoriesTable).set(patch).where(eq(serviceCategoriesTable.id, cat.id));
    const adminDisplayName2 = await getAdminName(req.user!.userId);
    await db.insert(auditLogTable).values({
      id: id(),
      adminId: req.user!.userId,
      adminName: adminDisplayName2,
      action: "category.update",
      target: "service_category",
      targetId: cat.id,
      details: patch as object,
      ip: req.ip ?? null,
    });
    const row = await db.query.serviceCategoriesTable.findFirst({
      where: eq(serviceCategoriesTable.id, cat.id),
    });
    emitCategoryChanged("updated", row);
    return res.json({ category: row });
  } catch (e) {
    logger.error({ err: e }, "categories.update error");
    return res.status(500).json({ error: "Failed to update category" });
  }
});

adminRouter.delete("/:id", requirePermission("marketing.write"), async (req: AuthRequest, res) => {
  try {
    const [category] = await db.update(serviceCategoriesTable)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(serviceCategoriesTable.id, req.params.id)).returning();
    if (!category) return res.status(404).json({ error: "Category not found" });
    const adminDisplayName3 = await getAdminName(req.user!.userId);
    await db.insert(auditLogTable).values({
      id: id(),
      adminId: req.user!.userId,
      adminName: adminDisplayName3,
      action: "category.deactivate",
      target: "service_category",
      targetId: req.params.id,
      ip: req.ip ?? null,
    });
    emitCategoryChanged("deactivated", { id: req.params.id });
    return res.json({ success: true });
  } catch (e) {
    logger.error({ err: e }, "categories.delete error");
    return res.status(500).json({ error: "Failed to delete category" });
  }
});

export { adminRouter as categoriesAdminRouter };
export default router;

