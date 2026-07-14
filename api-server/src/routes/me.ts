import { Router } from "express";
import { logger } from "../lib/logger";
import { db } from "@workspace/db";
import { isOwnedUploadObjectPath, normalizeStoredObjectPath } from "../lib/storageSecurity";
import { cleanupReplacedOwnedMedia } from "../lib/mediaLifecycle";
import {
  appSettingsTable,
  notificationsTable,
  providerDocumentsTable,
  savedProvidersTable,
  usersTable,
} from "@workspace/db/schema";
import { and, desc, eq, inArray, lt, sql } from "drizzle-orm";
import crypto from "crypto";
import { requireAuth, type AuthRequest } from "../middlewares/auth";
import { toPublicProvider } from "../lib/admin";
import { LEGAL_VERSION } from "../lib/legal";
import { getProviderSchedule, saveProviderSchedule, validateProviderSchedule, validateTravelRadius } from "../lib/providerAvailability";

const router = Router();
router.use(requireAuth);

const id = () => crypto.randomUUID();

// ───────── Get current user profile ─────────

router.get("/", async (req: AuthRequest, res) => {
  try {
    const user = await db.query.usersTable.findFirst({
      where: (u, { eq }) => eq(u.id, req.user!.userId),
    });
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    const { password, ...safe } = user as any;
    return res.json({ user: safe });
  } catch (e) {
    return res.status(500).json({ error: "Failed to load profile" });
  }
});

// ───────── Accept the current legal version (re-consent on version bump) ─────────
//
// The server is authoritative. We deliberately ignore any client-supplied
// `legalVersion` in the request body — the only value ever written to the
// `users.legal_version` column is the server constant `LEGAL_VERSION`. This
// prevents a malicious or out-of-date client from persisting an arbitrary
// version string and slipping past the in-app re-consent gate.

router.post("/legal-accept", async (req: AuthRequest, res) => {
  try {
    const now = new Date();
    const [updated] = await db
      .update(usersTable)
      .set({
        termsAcceptedAt: now,
        privacyAcceptedAt: now,
        legalVersion: LEGAL_VERSION,
        updatedAt: now,
      })
      .where(eq(usersTable.id, req.user!.userId))
      .returning();
    if (!updated) {
      return res.status(404).json({ error: "User not found" });
    }
    const { password: _password, ...safe } = updated;
    return res.json({ success: true, user: safe, legalVersion: LEGAL_VERSION });
  } catch (e) {
    logger.error({ err: e }, "Failed to accept legal version");
    return res.status(500).json({ error: "Failed to accept legal version" });
  }
});

// ───────── Update current user profile ─────────

router.patch("/", async (req: AuthRequest, res) => {
  try {
    const user = await db.query.usersTable.findFirst({ where: eq(usersTable.id, req.user!.userId) });
    if (!user) return res.status(404).json({ error: "User not found" });
    const body = req.body ?? {};
    const update: Record<string, any> = { updatedAt: new Date() };
    if (body.name !== undefined) {
      const name = String(body.name).trim();
      if (name.length < 2 || name.length > 80) return res.status(400).json({ error: "Name must be between 2 and 80 characters" });
      update.name = name;
    }
    if (body.bio !== undefined) {
      const bio = String(body.bio ?? "").trim();
      if (bio.length > 500) return res.status(400).json({ error: "Bio must be 500 characters or fewer" });
      update.bio = bio || null;
    }
    if (body.experience !== undefined) {
      if (user.role !== "provider") return res.status(403).json({ error: "Provider account required" });
      const experience = String(body.experience ?? "").trim();
      if (experience.length > 120) return res.status(400).json({ error: "Experience must be 120 characters or fewer" });
      update.experience = experience || null;
    }
    if (body.location !== undefined) {
      const location = String(body.location ?? "").trim();
      if (location.length > 160) return res.status(400).json({ error: "Location must be 160 characters or fewer" });
      update.location = location || null;
    }
    if (body.profileImage !== undefined) {
      const profileImage = normalizeStoredObjectPath(body.profileImage);
      if (profileImage && !isOwnedUploadObjectPath(profileImage, req.user!.userId, ["shared", "private"])) return res.status(400).json({ error: "Profile photo must be uploaded through your Athoo account" });
      update.profileImage = profileImage || null;
    }
    if (body.profileColor !== undefined) {
      const color = String(body.profileColor || "").trim();
      if (color && !/^#[0-9a-f]{6}$/i.test(color)) return res.status(400).json({ error: "Invalid profile color" });
      update.profileColor = color || null;
    }
    const forbidden = ["email", "phone", "role", "services", "ratePerHour", "isAvailable", "maxTravelDistanceKm", "verificationStatus", "isVerified"];
    const attempted = forbidden.filter((field) => body[field] !== undefined);
    if (attempted.length) return res.status(403).json({ error: `Profile field changes require the approved workflow: ${attempted.join(", ")}` });
    if (Object.keys(update).length === 1) return res.status(400).json({ error: "No valid fields to update" });
    const [updated] = await db.update(usersTable).set(update).where(eq(usersTable.id, req.user!.userId)).returning();
    if (body.profileImage !== undefined) cleanupReplacedOwnedMedia(user.profileImage, updated.profileImage, req.user!.userId);
    const { password, ...safe } = updated as any;
    return res.json({ user: safe });
  } catch (e) {
    logger.error({ err: e }, "me profile update error");
    return res.status(500).json({ error: "Failed to update profile" });
  }
});

// ───────── Preferences (language, location) ─────────

router.patch("/preferences", async (req: AuthRequest, res) => {
  try {
    const { language, latitude, longitude } = req.body as {
      language?: string;
      latitude?: number | string | null;
      longitude?: number | string | null;
    };
    const update: Record<string, any> = { updatedAt: new Date() };
    if (language === "en" || language === "ur") update.language = language;
    if (latitude !== undefined) {
      const lat = latitude === null ? null : Number(latitude);
      if (lat === null || (Number.isFinite(lat) && lat >= -90 && lat <= 90)) update.latitude = lat;
    }
    if (longitude !== undefined) {
      const lng = longitude === null ? null : Number(longitude);
      if (lng === null || (Number.isFinite(lng) && lng >= -180 && lng <= 180)) update.longitude = lng;
    }
    if (Object.keys(update).length === 1) {
      return res.status(400).json({ error: "No valid fields to update" });
    }
    const [updated] = await db
      .update(usersTable)
      .set(update)
      .where(eq(usersTable.id, req.user!.userId))
      .returning();
    const { password, ...safe } = updated as any;
    return res.json({ user: safe });
  } catch (e) {
    logger.error({ err: e }, "preferences update error");
    return res.status(500).json({ error: "Failed to update preferences" });
  }
});

// ───────── Saved providers (favorites) ─────────

router.get("/saved-providers", async (req: AuthRequest, res) => {
  try {
    const rows = await db
      .select()
      .from(savedProvidersTable)
      .where(eq(savedProvidersTable.userId, req.user!.userId))
      .orderBy(desc(savedProvidersTable.createdAt));

    if (rows.length === 0) return res.json({ providers: [], ids: [] });

    const providerIds = rows.map((r) => r.providerId);
    const providers = await db.query.usersTable.findMany({
      where: (u, { inArray }) => inArray(u.id, providerIds),
    });
    const byId = new Map(
      providers
        .filter((provider) => provider.role === "provider" && !provider.isDeactivated)
        .map((provider) => [provider.id, provider]),
    );
    const availableIds = providerIds.filter((providerId) => byId.has(providerId));

    return res.json({
      ids: availableIds,
      providers: availableIds.map((providerId) => toPublicProvider(byId.get(providerId)!)),
    });
  } catch (e) {
    logger.error({ err: e }, "saved providers list error");
    return res.status(500).json({ error: "Failed to load saved providers" });
  }
});

router.post("/saved-providers/:providerId", async (req: AuthRequest, res) => {
  try {
    const providerId = String(req.params.providerId || "").trim();
    if (!providerId || providerId === req.user!.userId) {
      return res.status(400).json({ error: "Invalid provider" });
    }

    const provider = await db.query.usersTable.findFirst({
      where: eq(usersTable.id, providerId),
    });
    if (!provider || provider.role !== "provider" || provider.isDeactivated) {
      return res.status(404).json({ error: "Provider not available" });
    }

    await db
      .insert(savedProvidersTable)
      .values({
        id: id(),
        userId: req.user!.userId,
        providerId,
      })
      .onConflictDoNothing({
        target: [savedProvidersTable.userId, savedProvidersTable.providerId],
      });

    return res.json({ success: true, providerId });
  } catch (e) {
    logger.error({ err: e }, "save provider error");
    return res.status(500).json({ error: "Failed to save provider" });
  }
});

router.delete("/saved-providers/:providerId", async (req: AuthRequest, res) => {
  try {
    await db
      .delete(savedProvidersTable)
      .where(
        and(
          eq(savedProvidersTable.userId, req.user!.userId),
          eq(savedProvidersTable.providerId, req.params.providerId)
        )
      );
    return res.json({ success: true });
  } catch (e) {
    return res.status(500).json({ error: "Failed to remove saved provider" });
  }
});

// ───────── Provider documents (own) ─────────

router.get("/documents", async (req: AuthRequest, res) => {
  try {
    const docs = await db
      .select()
      .from(providerDocumentsTable)
      .where(eq(providerDocumentsTable.providerId, req.user!.userId))
      .orderBy(desc(providerDocumentsTable.createdAt));
    return res.json({ documents: docs });
  } catch (e) {
    return res.status(500).json({ error: "Failed to load documents" });
  }
});

router.post("/documents", async (req: AuthRequest, res) => {
  try {
    const user = await db.query.usersTable.findFirst({ where: eq(usersTable.id, req.user!.userId) });
    if (!user || user.role !== "provider") return res.status(403).json({ error: "Provider account required" });

    const { type, label, url } = req.body as { type?: string; label?: string; url?: string };
    const allowedTypes = ["cnic_front", "cnic_back", "selfie", "police", "diploma", "video", "license", "other"];
    const normalizedType = String(type || "").trim();
    const normalizedUrl = normalizeStoredObjectPath(url);
    if (!allowedTypes.includes(normalizedType) || !normalizedUrl) return res.status(400).json({ error: "Invalid document type or URL" });
    if (!isOwnedUploadObjectPath(normalizedUrl, req.user!.userId, ["private"])) {
      return res.status(400).json({ error: "Verification documents must use your private upload path" });
    }

    const existing = await db.query.providerDocumentsTable.findFirst({
      where: and(eq(providerDocumentsTable.providerId, req.user!.userId), eq(providerDocumentsTable.type, normalizedType)),
    });
    const now = new Date();
    const doc = existing
      ? (await db.update(providerDocumentsTable).set({
          label: label?.trim() || existing.label, url: normalizedUrl, status: "pending", rejectionNote: null, reviewedBy: null, reviewedAt: null, updatedAt: now,
        }).where(eq(providerDocumentsTable.id, existing.id)).returning())[0]
      : (await db.insert(providerDocumentsTable).values({
          id: id(), providerId: req.user!.userId, type: normalizedType, label: label?.trim() || null, url: normalizedUrl, status: "pending",
        }).returning())[0];

    const requiredTypes = ["cnic_front", "cnic_back", "selfie", "police"];
    const currentDocs = await db.select({ type: providerDocumentsTable.type }).from(providerDocumentsTable)
      .where(and(eq(providerDocumentsTable.providerId, req.user!.userId), inArray(providerDocumentsTable.type, requiredTypes)));
    const complete = requiredTypes.every((required) => currentDocs.some((item) => item.type === required));
    const verificationStatus = complete ? "in_process" : "pending";
    await db.update(usersTable).set({ verificationStatus, verificationNote: null, isVerified: false, updatedAt: now })
      .where(eq(usersTable.id, req.user!.userId));

    return res.json({ document: doc, verificationStatus });
  } catch (e) {
    logger.error({ err: e }, "upload document error");
    return res.status(500).json({ error: "Failed to save document" });
  }
});

router.delete("/documents/:docId", async (req: AuthRequest, res) => {
  try {
    await db
      .delete(providerDocumentsTable)
      .where(
        and(
          eq(providerDocumentsTable.id, req.params.docId),
          eq(providerDocumentsTable.providerId, req.user!.userId)
        )
      );
    return res.json({ success: true });
  } catch (e) {
    return res.status(500).json({ error: "Failed to delete document" });
  }
});

// ───────── In-app notifications ─────────

router.get("/notifications", async (req: AuthRequest, res) => {
  try {
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
    const cursor = req.query.cursor ? new Date(String(req.query.cursor)) : null;
    if (cursor && Number.isNaN(cursor.getTime())) return res.status(400).json({ error: "Invalid notification cursor" });
    const where = cursor
      ? and(eq(notificationsTable.userId, req.user!.userId), lt(notificationsTable.createdAt, cursor))
      : eq(notificationsTable.userId, req.user!.userId);
    const [items, [unreadRow]] = await Promise.all([
      db.select().from(notificationsTable).where(where).orderBy(desc(notificationsTable.createdAt)).limit(limit + 1),
      db.select({ unread: sql<number>`count(*)::int` }).from(notificationsTable)
        .where(and(eq(notificationsTable.userId, req.user!.userId), eq(notificationsTable.isRead, false))),
    ]);
    const hasMore = items.length > limit;
    const page = hasMore ? items.slice(0, limit) : items;
    const nextCursor = hasMore && page.length ? page[page.length - 1]?.createdAt?.toISOString() || null : null;
    return res.json({ notifications: page, unread: Number(unreadRow?.unread || 0), hasMore, nextCursor });
  } catch (e) {
    return res.status(500).json({ error: "Failed to load notifications" });
  }
});

router.post("/notifications/read-all", async (req: AuthRequest, res) => {
  try {
    await db
      .update(notificationsTable)
      .set({ isRead: true })
      .where(eq(notificationsTable.userId, req.user!.userId));
    return res.json({ success: true });
  } catch (e) {
    return res.status(500).json({ error: "Failed to mark notifications" });
  }
});

router.patch("/notifications/:notifId/read", async (req: AuthRequest, res) => {
  try {
    await db
      .update(notificationsTable)
      .set({ isRead: true })
      .where(
        and(
          eq(notificationsTable.id, req.params.notifId),
          eq(notificationsTable.userId, req.user!.userId)
        )
      );
    return res.json({ success: true });
  } catch (e) {
    return res.status(500).json({ error: "Failed to update notification" });
  }
});

router.delete("/notifications/:notifId", async (req: AuthRequest, res) => {
  try {
    await db
      .delete(notificationsTable)
      .where(
        and(
          eq(notificationsTable.id, req.params.notifId),
          eq(notificationsTable.userId, req.user!.userId)
        )
      );
    return res.json({ success: true });
  } catch (e) {
    return res.status(500).json({ error: "Failed to delete notification" });
  }
});

router.delete("/notifications", async (req: AuthRequest, res) => {
  try {
    await db
      .delete(notificationsTable)
      .where(eq(notificationsTable.userId, req.user!.userId));
    return res.json({ success: true });
  } catch (e) {
    return res.status(500).json({ error: "Failed to clear notifications" });
  }
});

// ───────── Availability schedule ─────────

router.get("/schedule", async (req: AuthRequest, res) => {
  try {
    if (req.user!.role !== "provider") return res.status(403).json({ error: "Provider account required" });
    return res.json({ schedule: await getProviderSchedule(req.user!.userId) });
  } catch (e) {
    logger.error({ err: e }, "get schedule error");
    return res.status(500).json({ error: "Failed to load schedule" });
  }
});

router.patch("/schedule", async (req: AuthRequest, res) => {
  try {
    if (req.user!.role !== "provider") return res.status(403).json({ error: "Provider account required" });
    const checked = validateProviderSchedule(req.body);
    if (!checked.schedule) return res.status(400).json({ error: checked.error });
    await saveProviderSchedule(req.user!.userId, checked.schedule);
    return res.json({ schedule: checked.schedule });
  } catch (e) {
    logger.error({ err: e }, "update schedule error");
    return res.status(500).json({ error: "Failed to update schedule" });
  }
});

export default router;

