import crypto from "crypto";
import { Router } from "express";
import { db } from "@workspace/db";
import { auditLogTable, policyDocumentsTable, usersTable } from "@workspace/db/schema";
import { and, asc, desc, eq, or } from "drizzle-orm";
import { requireAdmin, requireAuth, requirePermission, type AuthRequest } from "../middlewares/auth";
import { LEGAL_VERSION } from "../lib/legal";
import { logger } from "../lib/logger";

const publicRouter = Router();
const adminRouter = Router();
const AUDIENCES = new Set(["all", "customer", "provider"]);
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function cleanText(value: unknown, max: number): string {
  return String(value ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim().slice(0, max);
}

function cleanOptional(value: unknown, max: number): string | null {
  const text = cleanText(value, max);
  return text || null;
}

function parseAudience(value: unknown): "all" | "customer" | "provider" | null {
  const audience = String(value ?? "all");
  return AUDIENCES.has(audience) ? audience as "all" | "customer" | "provider" : null;
}

function validatePolicyInput(body: Record<string, unknown>, existingSlug?: string) {
  const slug = cleanText(body.slug ?? existingSlug, 80).toLowerCase();
  const title = cleanText(body.title, 120);
  const bodyEn = cleanText(body.bodyEn, 20_000);
  const version = cleanText(body.version || "1.0", 32);
  const audience = parseAudience(body.audience);
  const requiresAcceptance = Boolean(body.requiresAcceptance);

  if (!SLUG_PATTERN.test(slug)) throw new Error("Slug must use lowercase letters, numbers, and hyphens only");
  if (title.length < 3) throw new Error("Policy title must be at least 3 characters");
  if (bodyEn.length < 40) throw new Error("English policy content must be at least 40 characters");
  if (!/^\d+(?:\.\d+){1,2}(?:[-+][A-Za-z0-9.-]+)?$/.test(version)) throw new Error("Version must look like 1.0 or 1.0.0");
  if (!audience) throw new Error("Audience must be all, customer, or provider");
  if (requiresAcceptance && !new Set(["privacy", "terms"]).has(slug)) {
    throw new Error("Only Privacy Policy and Terms of Service may require account acceptance");
  }
  if (requiresAcceptance && version !== LEGAL_VERSION) {
    throw new Error(`Required-acceptance policy version must match the app legal version ${LEGAL_VERSION}`);
  }

  return {
    slug,
    title,
    titleUr: cleanOptional(body.titleUr, 160),
    summary: cleanOptional(body.summary, 500),
    summaryUr: cleanOptional(body.summaryUr, 700),
    bodyEn,
    bodyUr: cleanOptional(body.bodyUr, 25_000),
    version,
    audience,
    requiresAcceptance,
  };
}

async function audit(req: AuthRequest, action: string, policyId: string, details: Record<string, unknown>) {
  const admin = await db.query.usersTable.findFirst({ where: eq(usersTable.id, req.user!.userId) });
  await db.insert(auditLogTable).values({
    id: crypto.randomUUID(),
    adminId: req.user!.userId,
    adminName: admin?.name || "Admin",
    adminRole: admin?.adminRole || null,
    action,
    target: "policy_document",
    targetId: policyId,
    details,
    ip: req.ip || null,
  });
}

publicRouter.get("/", async (req, res) => {
  try {
    const audience = parseAudience(req.query.audience) || "all";
    const policies = await db
      .select({
        slug: policyDocumentsTable.slug,
        title: policyDocumentsTable.title,
        titleUr: policyDocumentsTable.titleUr,
        summary: policyDocumentsTable.summary,
        summaryUr: policyDocumentsTable.summaryUr,
        version: policyDocumentsTable.version,
        audience: policyDocumentsTable.audience,
        requiresAcceptance: policyDocumentsTable.requiresAcceptance,
        publishedAt: policyDocumentsTable.publishedAt,
        updatedAt: policyDocumentsTable.updatedAt,
      })
      .from(policyDocumentsTable)
      .where(and(
        eq(policyDocumentsTable.isPublished, true),
        audience === "all"
          ? eq(policyDocumentsTable.audience, "all")
          : or(eq(policyDocumentsTable.audience, "all"), eq(policyDocumentsTable.audience, audience)),
      ))
      .orderBy(asc(policyDocumentsTable.title));
    res.set("Cache-Control", "public, max-age=300");
    return res.json({ policies });
  } catch (error) {
    logger.error({ err: error }, "public policy list failed");
    return res.status(500).json({ error: "Failed to load policies" });
  }
});

publicRouter.get("/:slug", async (req, res) => {
  try {
    const slug = String(req.params.slug || "").toLowerCase();
    if (!SLUG_PATTERN.test(slug)) return res.status(404).json({ error: "Policy not found" });
    const policy = await db.query.policyDocumentsTable.findFirst({
      where: and(eq(policyDocumentsTable.slug, slug), eq(policyDocumentsTable.isPublished, true)),
    });
    if (!policy) return res.status(404).json({ error: "Policy not found" });
    res.set("Cache-Control", "public, max-age=300");
    return res.json({ policy });
  } catch (error) {
    logger.error({ err: error }, "public policy detail failed");
    return res.status(500).json({ error: "Failed to load policy" });
  }
});

adminRouter.use(requireAuth, requireAdmin);

adminRouter.get("/", requirePermission("settings.read"), async (_req, res) => {
  try {
    const policies = await db.select().from(policyDocumentsTable).orderBy(desc(policyDocumentsTable.updatedAt));
    return res.json({ policies, legalVersion: LEGAL_VERSION });
  } catch (error) {
    logger.error({ err: error }, "admin policy list failed");
    return res.status(500).json({ error: "Failed to load policy documents" });
  }
});

adminRouter.post("/", requirePermission("settings.write"), async (req: AuthRequest, res) => {
  try {
    const values = validatePolicyInput(req.body || {});
    const [policy] = await db.insert(policyDocumentsTable).values({
      id: crypto.randomUUID(),
      ...values,
      isPublished: false,
      updatedBy: req.user!.userId,
      updatedAt: new Date(),
    }).returning();
    await audit(req, "policy_created", policy.id, { slug: policy.slug, version: policy.version });
    return res.status(201).json({ policy });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create policy";
    if (message.includes("duplicate key")) return res.status(409).json({ error: "A policy with this slug already exists" });
    if (error instanceof Error && !message.startsWith("Failed")) return res.status(400).json({ error: message });
    logger.error({ err: error }, "admin policy create failed");
    return res.status(500).json({ error: "Failed to create policy" });
  }
});

adminRouter.patch("/:id", requirePermission("settings.write"), async (req: AuthRequest, res) => {
  try {
    const existing = await db.query.policyDocumentsTable.findFirst({ where: eq(policyDocumentsTable.id, req.params.id) });
    if (!existing) return res.status(404).json({ error: "Policy not found" });
    const values = validatePolicyInput({ ...existing, ...req.body }, existing.slug);
    const [policy] = await db.update(policyDocumentsTable).set({
      ...values,
      isPublished: false,
      publishedAt: null,
      updatedBy: req.user!.userId,
      updatedAt: new Date(),
    }).where(eq(policyDocumentsTable.id, existing.id)).returning();
    await audit(req, "policy_updated", policy.id, { slug: policy.slug, fromVersion: existing.version, toVersion: policy.version, unpublishedForReview: true });
    return res.json({ policy });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update policy";
    if (error instanceof Error && !message.startsWith("Failed")) return res.status(400).json({ error: message });
    logger.error({ err: error }, "admin policy update failed");
    return res.status(500).json({ error: "Failed to update policy" });
  }
});

adminRouter.post("/:id/publish", requirePermission("settings.write"), async (req: AuthRequest, res) => {
  try {
    const existing = await db.query.policyDocumentsTable.findFirst({ where: eq(policyDocumentsTable.id, req.params.id) });
    if (!existing) return res.status(404).json({ error: "Policy not found" });
    validatePolicyInput(existing as unknown as Record<string, unknown>, existing.slug);
    const now = new Date();
    const [policy] = await db.update(policyDocumentsTable).set({
      isPublished: true,
      publishedAt: now,
      updatedBy: req.user!.userId,
      updatedAt: now,
    }).where(eq(policyDocumentsTable.id, existing.id)).returning();
    await audit(req, "policy_published", policy.id, { slug: policy.slug, version: policy.version });
    return res.json({ policy });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to publish policy";
    if (error instanceof Error && !message.startsWith("Failed")) return res.status(400).json({ error: message });
    logger.error({ err: error }, "admin policy publish failed");
    return res.status(500).json({ error: "Failed to publish policy" });
  }
});

adminRouter.post("/:id/unpublish", requirePermission("settings.write"), async (req: AuthRequest, res) => {
  try {
    const [policy] = await db.update(policyDocumentsTable).set({
      isPublished: false,
      publishedAt: null,
      updatedBy: req.user!.userId,
      updatedAt: new Date(),
    }).where(eq(policyDocumentsTable.id, req.params.id)).returning();
    if (!policy) return res.status(404).json({ error: "Policy not found" });
    await audit(req, "policy_unpublished", policy.id, { slug: policy.slug, version: policy.version });
    return res.json({ policy });
  } catch (error) {
    logger.error({ err: error }, "admin policy unpublish failed");
    return res.status(500).json({ error: "Failed to unpublish policy" });
  }
});

export { publicRouter as policiesPublicRouter, adminRouter as policiesAdminRouter };
