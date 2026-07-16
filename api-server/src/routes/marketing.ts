import { Router } from "express";
import { db } from "@workspace/db";
import {
  marketingBannersTable,
  appAnnouncementsTable,
  faqsTable,
  serviceAreasTable,
  auditLogTable,
  usersTable,
  customerHomeSettingsTable,
} from "@workspace/db/schema";
import { and, asc, desc, eq, gte, isNull, or } from "drizzle-orm";
import { requireAuth, requireAdmin, requirePermission, type AuthRequest } from "../middlewares/auth";
import { generateId } from "../lib/admin";
import { logger } from "../lib/logger";
import { sanitizeHttpsOrAppPath, sanitizeHttpsUrl } from "../lib/contentSecurity";

const publicRouter = Router();
const adminRouter = Router();

const AUDIENCES = new Set(["all", "customer", "provider"]);
const LINK_TYPES = new Set(["none", "category", "url", "booking"]);

function validAudience(value: unknown): value is string { return AUDIENCES.has(String(value ?? "all")); }
function validDate(value: unknown): boolean { return !value || !Number.isNaN(new Date(String(value)).getTime()); }

function sanitizeBannerTarget(linkType: unknown, linkTarget: unknown): { ok: true; value: string | null } | { ok: false } {
  const type = String(linkType || "none");
  const raw = String(linkTarget || "").trim();
  if (type === "none") return { ok: true, value: null };
  if (!raw || raw.length > 500 || /[\u0000-\u001f\u007f]/.test(raw)) return { ok: false };
  if (type === "url") {
    const value = sanitizeHttpsUrl(raw, 500);
    return value ? { ok: true, value } : { ok: false };
  }
  if (type === "category" && /^[a-z0-9][a-z0-9-]{0,99}$/i.test(raw)) return { ok: true, value: raw };
  if (type === "booking" && /^[A-Za-z0-9_-]{1,128}$/.test(raw)) return { ok: true, value: raw };
  return { ok: false };
}

function publicAnnouncement<T extends { buttonLink?: string | null; imageUrl?: string | null }>(value: T): T {
  return {
    ...value,
    buttonLink: sanitizeHttpsOrAppPath(value.buttonLink),
    imageUrl: sanitizeHttpsUrl(value.imageUrl),
  };
}

function publicBanner<T extends { linkType?: string | null; linkTarget?: string | null; imageUrl?: string | null }>(value: T) {
  const linkType = String(value.linkType || "none");
  const target = sanitizeBannerTarget(linkType, value.linkTarget);
  return {
    ...value,
    linkType: target.ok ? linkType : "none",
    linkTarget: target.ok ? target.value : null,
    imageUrl: sanitizeHttpsUrl(value.imageUrl),
  };
}

async function auditMarketing(req: AuthRequest, action: string, target: string, targetId: string, details: Record<string, unknown> = {}) {
  const admin = await db.query.usersTable.findFirst({ where: eq(usersTable.id, req.user!.userId) });
  await db.insert(auditLogTable).values({
    id: generateId(), adminId: req.user!.userId, adminName: admin?.name || "Admin",
    adminRole: admin?.adminRole || null, action, target, targetId, details, ip: req.ip ?? null,
  });
}

adminRouter.use(requireAuth, requireAdmin);


// ── PUBLIC: GET /api/marketing/home-config ───────────────────────────────────
publicRouter.get("/home-config", async (_req, res) => {
  try {
    let config = await db.query.customerHomeSettingsTable.findFirst({
      where: eq(customerHomeSettingsTable.id, "default"),
    });
    if (!config) {
      const [created] = await db.insert(customerHomeSettingsTable).values({ id: "default" }).returning();
      config = created;
    }
    return res.json({ config });
  } catch (err) {
    logger.error({ err }, "get home config error");
    return res.status(500).json({ error: "Failed to load home configuration" });
  }
});

// ── PUBLIC: GET /api/marketing/banners ────────────────────────────────────────
// Returns active banners for all or specific audience (customer/provider)
publicRouter.get("/banners", async (req, res) => {
  try {
    const requestedAudience = String(req.query.audience || "customer");
    const audience = AUDIENCES.has(requestedAudience) ? requestedAudience : "customer";
    const now = new Date();

    const banners = await db
      .select()
      .from(marketingBannersTable)
      .where(
        and(
          eq(marketingBannersTable.isActive, true),
          or(
            eq(marketingBannersTable.targetAudience, "all"),
            eq(marketingBannersTable.targetAudience, audience)
          ),
          or(
            isNull(marketingBannersTable.expiresAt),
            gte(marketingBannersTable.expiresAt, now)
          )
        )
      )
      .orderBy(asc(marketingBannersTable.sortOrder), desc(marketingBannersTable.createdAt));

    return res.json({ banners: banners.map(publicBanner) });
  } catch (err) {
    logger.error({ err }, "get banners error");
    return res.status(500).json({ error: "Failed to load banners" });
  }
});

// ── PUBLIC: GET /api/marketing/announcements ──────────────────────────────────
publicRouter.get("/announcements", async (req, res) => {
  try {
    const requestedAudience = String(req.query.audience || "customer");
    const audience = AUDIENCES.has(requestedAudience) ? requestedAudience : "customer";
    const now = new Date();

    const announcements = await db
      .select()
      .from(appAnnouncementsTable)
      .where(
        and(
          eq(appAnnouncementsTable.isActive, true),
          or(
            eq(appAnnouncementsTable.targetAudience, "all"),
            eq(appAnnouncementsTable.targetAudience, audience)
          ),
          or(
            isNull(appAnnouncementsTable.expiresAt),
            gte(appAnnouncementsTable.expiresAt, now)
          )
        )
      )
      .orderBy(desc(appAnnouncementsTable.priority), desc(appAnnouncementsTable.createdAt));

    return res.json({ announcements: announcements.map(publicAnnouncement) });
  } catch (err) {
    logger.error({ err }, "get announcements error");
    return res.status(500).json({ error: "Failed to load announcements" });
  }
});

// ── PUBLIC: GET /api/faqs ─────────────────────────────────────────────────────
publicRouter.get("/faqs", async (req, res) => {
  try {
    const requestedAudience = String(req.query.audience || "customer");
    const audience = AUDIENCES.has(requestedAudience) ? requestedAudience : "customer";

    const faqs = await db
      .select()
      .from(faqsTable)
      .where(
        and(
          eq(faqsTable.isActive, true),
          or(
            eq(faqsTable.targetAudience, "all"),
            eq(faqsTable.targetAudience, audience)
          )
        )
      )
      .orderBy(asc(faqsTable.sortOrder), asc(faqsTable.createdAt));

    return res.json({ faqs });
  } catch (err) {
    logger.error({ err }, "get faqs error");
    return res.status(500).json({ error: "Failed to load FAQs" });
  }
});

// ── PUBLIC: GET /api/marketing/areas ─────────────────────────────────────────
publicRouter.get("/areas", async (_req, res) => {
  try {
    const areas = await db
      .select()
      .from(serviceAreasTable)
      .where(eq(serviceAreasTable.isActive, true))
      .orderBy(asc(serviceAreasTable.sortOrder), asc(serviceAreasTable.name));
    return res.json({ areas });
  } catch (err) {
    logger.error({ err }, "get areas error");
    return res.status(500).json({ error: "Failed to load service areas" });
  }
});


// ── ADMIN: Customer home configuration ──────────────────────────────────────
adminRouter.get("/home-config", requirePermission("marketing.read"), async (_req, res) => {
  try {
    let config = await db.query.customerHomeSettingsTable.findFirst({ where: eq(customerHomeSettingsTable.id, "default") });
    if (!config) {
      const [created] = await db.insert(customerHomeSettingsTable).values({ id: "default" }).returning();
      config = created;
    }
    return res.json({ config });
  } catch (err) {
    logger.error({ err }, "admin get home config error");
    return res.status(500).json({ error: "Failed to load home configuration" });
  }
});

adminRouter.patch("/home-config", requirePermission("marketing.write"), async (req: AuthRequest, res) => {
  try {
    const body = req.body ?? {};
    const maxCategories = Number(body.maxCategories ?? 12);
    const maxProviders = Number(body.maxProviders ?? 4);
    if (!Number.isInteger(maxCategories) || maxCategories < 1 || maxCategories > 30) {
      return res.status(400).json({ error: "maxCategories must be between 1 and 30" });
    }
    if (!Number.isInteger(maxProviders) || maxProviders < 1 || maxProviders > 12) {
      return res.status(400).json({ error: "maxProviders must be between 1 and 12" });
    }
    const values = {
      id: "default",
      locationLabel: String(body.locationLabel || "Pakistan").trim().slice(0, 80),
      showBroadcastCta: body.showBroadcastCta !== false,
      showPlatformStats: body.showPlatformStats !== false,
      showTopProviders: body.showTopProviders !== false,
      showEmergencyContacts: body.showEmergencyContacts !== false,
      maxCategories,
      maxProviders,
      updatedAt: new Date(),
    };
    const [config] = await db.insert(customerHomeSettingsTable).values(values).onConflictDoUpdate({
      target: customerHomeSettingsTable.id,
      set: values,
    }).returning();
    await db.insert(auditLogTable).values({
      id: generateId(),
      adminId: req.user!.userId,
      action: "UPDATE_CUSTOMER_HOME_CONFIG",
      entityType: "customer_home_settings",
      entityId: "default",
      details: values,
      createdAt: new Date(),
    } as any);
    return res.json({ config });
  } catch (err) {
    logger.error({ err }, "admin update home config error");
    return res.status(500).json({ error: "Failed to update home configuration" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN: Banners CRUD
// ─────────────────────────────────────────────────────────────────────────────
adminRouter.get("/banners", requirePermission("marketing.read"), async (_req, res) => {
  try {
    const banners = await db
      .select()
      .from(marketingBannersTable)
      .orderBy(asc(marketingBannersTable.sortOrder), desc(marketingBannersTable.createdAt));
    return res.json({ banners });
  } catch (err) {
    logger.error({ err }, "admin get banners error");
    return res.status(500).json({ error: "Failed to load banners" });
  }
});

adminRouter.post("/banners", requirePermission("marketing.write"), async (req: AuthRequest, res) => {
  try {
    const {
      title, subtitle, imageUrl, bgColorFrom, bgColorTo, iconName,
      linkType, linkTarget, targetAudience, isActive, sortOrder, expiresAt,
    } = req.body;

    const cleanTitle = String(title || "").trim();
    if (cleanTitle.length < 2 || cleanTitle.length > 120) return res.status(400).json({ error: "Title must be 2-120 characters" });
    if (subtitle && String(subtitle).trim().length > 240) return res.status(400).json({ error: "Subtitle must be 240 characters or fewer" });
    if (!validAudience(targetAudience)) return res.status(400).json({ error: "Invalid target audience" });
    if (!LINK_TYPES.has(String(linkType || "none"))) return res.status(400).json({ error: "Invalid link type" });
    if (!validDate(expiresAt)) return res.status(400).json({ error: "Invalid expiry date" });
    const safeBannerTarget = sanitizeBannerTarget(linkType, linkTarget);
    if (!safeBannerTarget.ok) return res.status(400).json({ error: "Banner destination is invalid" });
    const safeBannerImage = imageUrl ? sanitizeHttpsUrl(imageUrl) : null;
    if (imageUrl && !safeBannerImage) return res.status(400).json({ error: "Banner images must use a valid HTTPS URL" });

    const id = generateId();
    const [banner] = await db.insert(marketingBannersTable).values({
      id,
      title: cleanTitle,
      subtitle: subtitle?.trim() || null,
      imageUrl: safeBannerImage,
      bgColorFrom: bgColorFrom || "#1A6EE0",
      bgColorTo: bgColorTo || "#0D4BA0",
      iconName: iconName || "star",
      linkType: linkType || "none",
      linkTarget: safeBannerTarget.value,
      targetAudience: targetAudience || "all",
      isActive: isActive !== false,
      sortOrder: sortOrder ?? 0,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
    }).returning();

    const admin = await db.query.usersTable.findFirst({ where: eq(usersTable.id, req.user!.userId) });
    await db.insert(auditLogTable).values({
      id: generateId(),
      adminId: req.user!.userId,
      adminName: admin?.name || "Admin",
      adminRole: admin?.adminRole || null,
      action: "marketing.banner.create",
      target: "marketing_banner",
      targetId: id,
      details: { title },
    });

    return res.status(201).json({ banner });
  } catch (err) {
    logger.error({ err }, "create banner error");
    return res.status(500).json({ error: "Failed to create banner" });
  }
});

adminRouter.patch("/banners/:id", requirePermission("marketing.write"), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const {
      title, subtitle, imageUrl, bgColorFrom, bgColorTo, iconName,
      linkType, linkTarget, targetAudience, isActive, sortOrder, expiresAt,
    } = req.body;

    if (title !== undefined && (String(title).trim().length < 2 || String(title).trim().length > 120)) return res.status(400).json({ error: "Title must be 2-120 characters" });
    if (subtitle !== undefined && String(subtitle || "").trim().length > 240) return res.status(400).json({ error: "Subtitle must be 240 characters or fewer" });
    if (targetAudience !== undefined && !validAudience(targetAudience)) return res.status(400).json({ error: "Invalid target audience" });
    if (linkType !== undefined && !LINK_TYPES.has(String(linkType))) return res.status(400).json({ error: "Invalid link type" });
    if (expiresAt !== undefined && !validDate(expiresAt)) return res.status(400).json({ error: "Invalid expiry date" });
    const currentBanner = await db.query.marketingBannersTable.findFirst({ where: eq(marketingBannersTable.id, id) });
    if (!currentBanner) return res.status(404).json({ error: "Banner not found" });
    const nextLinkType = linkType !== undefined ? linkType : currentBanner.linkType;
    const nextLinkTarget = linkTarget !== undefined ? linkTarget : currentBanner.linkTarget;
    const safeBannerTarget = sanitizeBannerTarget(nextLinkType, nextLinkTarget);
    if (!safeBannerTarget.ok) return res.status(400).json({ error: "Banner destination is invalid" });
    const safeBannerImage = imageUrl !== undefined ? (imageUrl ? sanitizeHttpsUrl(imageUrl) : null) : currentBanner.imageUrl;
    if (imageUrl && !safeBannerImage) return res.status(400).json({ error: "Banner images must use a valid HTTPS URL" });
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (title !== undefined) updates.title = String(title).trim();
    if (subtitle !== undefined) updates.subtitle = subtitle?.trim() || null;
    if (imageUrl !== undefined) updates.imageUrl = safeBannerImage;
    if (bgColorFrom !== undefined) updates.bgColorFrom = bgColorFrom;
    if (bgColorTo !== undefined) updates.bgColorTo = bgColorTo;
    if (iconName !== undefined) updates.iconName = iconName;
    if (linkType !== undefined) updates.linkType = linkType;
    if (linkType !== undefined || linkTarget !== undefined) updates.linkTarget = safeBannerTarget.value;
    if (targetAudience !== undefined) updates.targetAudience = targetAudience;
    if (isActive !== undefined) updates.isActive = isActive;
    if (sortOrder !== undefined) updates.sortOrder = sortOrder;
    if (expiresAt !== undefined) updates.expiresAt = expiresAt ? new Date(expiresAt) : null;

    const [updated] = await db
      .update(marketingBannersTable)
      .set(updates as any)
      .where(eq(marketingBannersTable.id, id))
      .returning();

    if (!updated) return res.status(404).json({ error: "Banner not found" });

    const admin = await db.query.usersTable.findFirst({ where: eq(usersTable.id, req.user!.userId) });
    await db.insert(auditLogTable).values({
      id: generateId(),
      adminId: req.user!.userId,
      adminName: admin?.name || "Admin",
      adminRole: admin?.adminRole || null,
      action: "marketing.banner.update",
      target: "marketing_banner",
      targetId: id,
      details: {},
    });

    return res.json({ banner: updated });
  } catch (err) {
    logger.error({ err }, "update banner error");
    return res.status(500).json({ error: "Failed to update banner" });
  }
});

adminRouter.delete("/banners/:id", requirePermission("marketing.write"), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const [deactivated] = await db.update(marketingBannersTable).set({ isActive: false, updatedAt: new Date() }).where(eq(marketingBannersTable.id, id)).returning();
    if (!deactivated) return res.status(404).json({ error: "Banner not found" });

    const admin = await db.query.usersTable.findFirst({ where: eq(usersTable.id, req.user!.userId) });
    await db.insert(auditLogTable).values({
      id: generateId(),
      adminId: req.user!.userId,
      adminName: admin?.name || "Admin",
      adminRole: admin?.adminRole || null,
      action: "marketing.banner.deactivate",
      target: "marketing_banner",
      targetId: id,
      details: {},
    });

    return res.json({ success: true });
  } catch (err) {
    logger.error({ err }, "delete banner error");
    return res.status(500).json({ error: "Failed to delete banner" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN: Announcements CRUD
// ─────────────────────────────────────────────────────────────────────────────
adminRouter.get("/announcements", requirePermission("marketing.read"), async (_req, res) => {
  try {
    const announcements = await db
      .select()
      .from(appAnnouncementsTable)
      .orderBy(desc(appAnnouncementsTable.priority), desc(appAnnouncementsTable.createdAt));
    return res.json({ announcements });
  } catch (err) {
    logger.error({ err }, "admin get announcements error");
    return res.status(500).json({ error: "Failed to load announcements" });
  }
});

adminRouter.post("/announcements", requirePermission("marketing.write"), async (req: AuthRequest, res) => {
  try {
    const {
      title, message, buttonText, buttonLink, imageUrl,
      targetAudience, isActive, showOnce, priority, expiresAt,
    } = req.body;

    const cleanTitle = String(title || "").trim();
    const cleanMessage = String(message || "").trim();
    if (cleanTitle.length < 2 || cleanTitle.length > 120) return res.status(400).json({ error: "Title must be 2-120 characters" });
    if (cleanMessage.length < 2 || cleanMessage.length > 2000) return res.status(400).json({ error: "Message must be 2-2000 characters" });
    if (!validAudience(targetAudience)) return res.status(400).json({ error: "Invalid target audience" });
    if (!validDate(expiresAt)) return res.status(400).json({ error: "Invalid expiry date" });
    const safeButtonLink = buttonLink ? sanitizeHttpsOrAppPath(buttonLink) : null;
    if (buttonLink && !safeButtonLink) return res.status(400).json({ error: "Announcement action must be an HTTPS URL or a valid in-app path" });
    const safeAnnouncementImage = imageUrl ? sanitizeHttpsUrl(imageUrl) : null;
    if (imageUrl && !safeAnnouncementImage) return res.status(400).json({ error: "Announcement images must use a valid HTTPS URL" });

    const id = generateId();
    const [announcement] = await db.insert(appAnnouncementsTable).values({
      id,
      title: cleanTitle,
      message: cleanMessage,
      buttonText: buttonText || "Got it",
      buttonLink: safeButtonLink,
      imageUrl: safeAnnouncementImage,
      targetAudience: targetAudience || "all",
      isActive: isActive !== false,
      showOnce: showOnce !== false,
      priority: priority ?? 0,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
    }).returning();

    const admin = await db.query.usersTable.findFirst({ where: eq(usersTable.id, req.user!.userId) });
    await db.insert(auditLogTable).values({
      id: generateId(),
      adminId: req.user!.userId,
      adminName: admin?.name || "Admin",
      adminRole: admin?.adminRole || null,
      action: "marketing.announcement.create",
      target: "app_announcement",
      targetId: id,
      details: { title },
    });

    return res.status(201).json({ announcement });
  } catch (err) {
    logger.error({ err }, "create announcement error");
    return res.status(500).json({ error: "Failed to create announcement" });
  }
});

adminRouter.patch("/announcements/:id", requirePermission("marketing.write"), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const {
      title, message, buttonText, buttonLink, imageUrl,
      targetAudience, isActive, showOnce, priority, expiresAt,
    } = req.body;

    if (title !== undefined && (String(title).trim().length < 2 || String(title).trim().length > 120)) return res.status(400).json({ error: "Title must be 2-120 characters" });
    if (message !== undefined && (String(message).trim().length < 2 || String(message).trim().length > 2000)) return res.status(400).json({ error: "Message must be 2-2000 characters" });
    if (targetAudience !== undefined && !validAudience(targetAudience)) return res.status(400).json({ error: "Invalid target audience" });
    if (expiresAt !== undefined && !validDate(expiresAt)) return res.status(400).json({ error: "Invalid expiry date" });
    const safeButtonLink = buttonLink !== undefined ? (buttonLink ? sanitizeHttpsOrAppPath(buttonLink) : null) : undefined;
    if (buttonLink && !safeButtonLink) return res.status(400).json({ error: "Announcement action must be an HTTPS URL or a valid in-app path" });
    const safeAnnouncementImage = imageUrl !== undefined ? (imageUrl ? sanitizeHttpsUrl(imageUrl) : null) : undefined;
    if (imageUrl && !safeAnnouncementImage) return res.status(400).json({ error: "Announcement images must use a valid HTTPS URL" });
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (title !== undefined) updates.title = String(title).trim();
    if (message !== undefined) updates.message = String(message).trim();
    if (buttonText !== undefined) updates.buttonText = buttonText;
    if (buttonLink !== undefined) updates.buttonLink = safeButtonLink;
    if (imageUrl !== undefined) updates.imageUrl = safeAnnouncementImage;
    if (targetAudience !== undefined) updates.targetAudience = targetAudience;
    if (isActive !== undefined) updates.isActive = isActive;
    if (showOnce !== undefined) updates.showOnce = showOnce;
    if (priority !== undefined) updates.priority = priority;
    if (expiresAt !== undefined) updates.expiresAt = expiresAt ? new Date(expiresAt) : null;

    const [updated] = await db
      .update(appAnnouncementsTable)
      .set(updates as any)
      .where(eq(appAnnouncementsTable.id, id))
      .returning();

    if (!updated) return res.status(404).json({ error: "Announcement not found" });
    await auditMarketing(req, "marketing.announcement.update", "app_announcement", id, { updates });
    return res.json({ announcement: updated });
  } catch (err) {
    logger.error({ err }, "update announcement error");
    return res.status(500).json({ error: "Failed to update announcement" });
  }
});

adminRouter.delete("/announcements/:id", requirePermission("marketing.write"), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const [announcement] = await db.update(appAnnouncementsTable).set({ isActive: false, updatedAt: new Date() }).where(eq(appAnnouncementsTable.id, id)).returning();
    if (!announcement) return res.status(404).json({ error: "Announcement not found" });
    await auditMarketing(req, "marketing.announcement.deactivate", "app_announcement", id, { title: announcement.title });
    return res.json({ success: true, announcement });
  } catch (err) {
    logger.error({ err }, "delete announcement error");
    return res.status(500).json({ error: "Failed to delete announcement" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN: FAQs CRUD
// ─────────────────────────────────────────────────────────────────────────────
adminRouter.get("/faqs", requirePermission("marketing.read"), async (_req, res) => {
  try {
    const faqs = await db
      .select()
      .from(faqsTable)
      .orderBy(asc(faqsTable.sortOrder), asc(faqsTable.createdAt));
    return res.json({ faqs });
  } catch (err) {
    logger.error({ err }, "admin get faqs error");
    return res.status(500).json({ error: "Failed to load FAQs" });
  }
});

adminRouter.post("/faqs", requirePermission("marketing.write"), async (req: AuthRequest, res) => {
  try {
    const { question, answer, category, targetAudience, sortOrder, isActive } = req.body;

    const cleanQuestion = String(question || "").trim();
    const cleanAnswer = String(answer || "").trim();
    if (cleanQuestion.length < 5 || cleanQuestion.length > 300) return res.status(400).json({ error: "Question must be 5-300 characters" });
    if (cleanAnswer.length < 5 || cleanAnswer.length > 5000) return res.status(400).json({ error: "Answer must be 5-5000 characters" });
    if (!validAudience(targetAudience)) return res.status(400).json({ error: "Invalid target audience" });

    const id = generateId();
    const [faq] = await db.insert(faqsTable).values({
      id,
      question: cleanQuestion,
      answer: cleanAnswer,
      category: category || "general",
      targetAudience: targetAudience || "all",
      sortOrder: sortOrder ?? 0,
      isActive: isActive !== false,
    }).returning();

    await auditMarketing(req, "marketing.faq.create", "faq", id, { question: cleanQuestion });
    return res.status(201).json({ faq });
  } catch (err) {
    logger.error({ err }, "create faq error");
    return res.status(500).json({ error: "Failed to create FAQ" });
  }
});

adminRouter.patch("/faqs/:id", requirePermission("marketing.write"), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { question, answer, category, targetAudience, sortOrder, isActive } = req.body;

    if (question !== undefined && (String(question).trim().length < 5 || String(question).trim().length > 300)) return res.status(400).json({ error: "Question must be 5-300 characters" });
    if (answer !== undefined && (String(answer).trim().length < 5 || String(answer).trim().length > 5000)) return res.status(400).json({ error: "Answer must be 5-5000 characters" });
    if (targetAudience !== undefined && !validAudience(targetAudience)) return res.status(400).json({ error: "Invalid target audience" });
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (question !== undefined) updates.question = String(question).trim();
    if (answer !== undefined) updates.answer = String(answer).trim();
    if (category !== undefined) updates.category = category;
    if (targetAudience !== undefined) updates.targetAudience = targetAudience;
    if (sortOrder !== undefined) updates.sortOrder = sortOrder;
    if (isActive !== undefined) updates.isActive = isActive;

    const [updated] = await db
      .update(faqsTable)
      .set(updates as any)
      .where(eq(faqsTable.id, id))
      .returning();

    if (!updated) return res.status(404).json({ error: "FAQ not found" });
    await auditMarketing(req, "marketing.faq.update", "faq", id, { updates });
    return res.json({ faq: updated });
  } catch (err) {
    logger.error({ err }, "update faq error");
    return res.status(500).json({ error: "Failed to update FAQ" });
  }
});

adminRouter.delete("/faqs/:id", requirePermission("marketing.write"), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const [faq] = await db.update(faqsTable).set({ isActive: false, updatedAt: new Date() }).where(eq(faqsTable.id, id)).returning();
    if (!faq) return res.status(404).json({ error: "FAQ not found" });
    await auditMarketing(req, "marketing.faq.deactivate", "faq", id, { question: faq.question });
    return res.json({ success: true, faq });
  } catch (err) {
    logger.error({ err }, "delete faq error");
    return res.status(500).json({ error: "Failed to delete FAQ" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN: Service Areas CRUD
// ─────────────────────────────────────────────────────────────────────────────
adminRouter.get("/areas", requirePermission("marketing.read"), async (_req, res) => {
  try {
    const areas = await db
      .select()
      .from(serviceAreasTable)
      .orderBy(asc(serviceAreasTable.sortOrder), asc(serviceAreasTable.name));
    return res.json({ areas });
  } catch (err) {
    logger.error({ err }, "admin get areas error");
    return res.status(500).json({ error: "Failed to load service areas" });
  }
});

adminRouter.post("/areas", requirePermission("marketing.write"), async (_req: AuthRequest, res) => res.status(410).json({ error: "Use /api/admin/service-areas for service-area management" }));

adminRouter.patch("/areas/:id", requirePermission("marketing.write"), async (_req: AuthRequest, res) => res.status(410).json({ error: "Use /api/admin/service-areas for service-area management" }));

adminRouter.delete("/areas/:id", requirePermission("marketing.write"), async (_req: AuthRequest, res) => res.status(410).json({ error: "Use /api/admin/service-areas for service-area management" }));

export { publicRouter as marketingPublicRouter, adminRouter as marketingAdminRouter };
