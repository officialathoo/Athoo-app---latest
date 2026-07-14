import { Router } from "express";
import { logger } from "../lib/logger";
import { db } from "@workspace/db";
import { usersTable, bookingsTable, serviceCategoriesTable, reviewsTable, notificationsTable, negotiationsTable } from "@workspace/db/schema";
import { eq, and, or, arrayContains, isNotNull, isNull, desc, gt, lt, ne, sql, inArray, gte } from "drizzle-orm";
import { requireAuth, AuthRequest } from "../middlewares/auth";
import { toPublicProvider, toSafeUser } from "../lib/admin";
import { getProviderActiveWorkBlock, activeWorkHttpPayload } from "../lib/businessRules";
import { ReviewSubmissionError, submitBookingReview } from "../domain/reviews";
import { emitToUser } from "../lib/eventBus";
import { providerWithinRadius } from "../lib/providerAvailability";

const router = Router();

// Public platform stats for home screen
router.get("/stats", async (_req, res) => {
  try {
    const [providerCount, categoryCount, ratingRows] = await Promise.all([
      db.$count(usersTable, and(eq(usersTable.role, "provider"), eq(usersTable.isDeactivated, false))),
      db.$count(serviceCategoriesTable, eq(serviceCategoriesTable.isActive, true)),
      db.select({ avg: sql<number>`round(coalesce(avg(${usersTable.rating}::numeric), 4.8), 1)` })
        .from(usersTable)
        .where(and(eq(usersTable.role, "provider"), isNotNull(usersTable.rating), gt(usersTable.rating, 0))),
    ]);
    const avgRating = ratingRows[0]?.avg ?? 4.8;
    return res.json({ providerCount: providerCount || 0, categoryCount: categoryCount || 0, avgRating });
  } catch (e) {
    logger.error({ err: e }, "providers stats error");
    return res.status(500).json({ error: "Failed to load stats" });
  }
});

// Haversine distance (km) — straight-line, accurate enough for matching.
function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const km = 2 * R * Math.asin(Math.sqrt(a));
  return km < 0.05 ? 0 : km;
}

// Nearest available providers — Haversine sort, 100% free, OpenStreetMap-compatible.
// Skips blocked / unavailable / cooldown providers automatically.
router.get("/nearest", async (req, res) => {
  try {
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
    const serviceId = req.query.serviceId ? String(req.query.serviceId) : null;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      res.status(400).json({ error: "lat and lng query params are required" });
      return;
    }
    const now = new Date();
    const rows = await db
      .select()
      .from(usersTable)
      .where(
        and(
          eq(usersTable.role, "provider"),
          eq(usersTable.isDeactivated, false),
          eq(usersTable.isBlocked, false),
          eq(usersTable.isAvailable, true),
          eq(usersTable.verificationStatus, "approved"),
          or(isNull(usersTable.cooldownUntil), lt(usersTable.cooldownUntil, now)),
          serviceId ? arrayContains(usersTable.services, [serviceId]) : isNotNull(usersTable.id),
        )
      );
    const ranked = rows
      .map((p) => {
        const pl = Number(p.latitude);
        const pn = Number(p.longitude);
        const match = providerWithinRadius(p, lat, lng);
        return match.allowed ? { ...toPublicProvider(p), distanceKm: match.distanceKm, serviceRadiusKm: match.radiusKm } : null;
      })
      .filter((provider): provider is NonNullable<typeof provider> => provider !== null)
      .sort((a, b) => {
        const ad = a.distanceKm ?? Number.POSITIVE_INFINITY;
        const bd = b.distanceKm ?? Number.POSITIVE_INFINITY;
        if (ad !== bd) return ad - bd;
        return (b.rating || 0) - (a.rating || 0);
      })
      .slice(0, limit);
    res.json({ providers: ranked });
  } catch (e) {
    logger.error({ err: e }, "nearest providers error");
    res.status(500).json({ error: "Failed to load nearest providers" });
  }
});

router.get("/", async (req, res) => {
  try {
    const { serviceId } = req.query as { serviceId?: string };
    const providers = await db
      .select()
      .from(usersTable)
      .where(
        serviceId
          ? and(
              eq(usersTable.role, "provider"),
              eq(usersTable.isDeactivated, false),
              eq(usersTable.isBlocked, false),
              eq(usersTable.verificationStatus, "approved"),
              // Case-insensitive service match: handles slugs ('plumber') or display names ('Plumber')
              sql`lower(${serviceId}) = ANY(SELECT lower(unnest(${usersTable.services})))`
            )
          : and(
              eq(usersTable.role, "provider"),
              eq(usersTable.isDeactivated, false),
              eq(usersTable.isBlocked, false),
              eq(usersTable.verificationStatus, "approved")
            )
      );

    res.json({ providers: providers.map((provider) => toPublicProvider(provider)) });
  } catch (e) {
    logger.error({ err: e }, "providers list error");
    res.status(500).json({ error: "Failed to load providers" });
  }
});

router.get("/dashboard", requireAuth, async (req: AuthRequest, res) => {
  try {
    const providerId = req.user!.userId;
    const provider = await db.query.usersTable.findFirst({ where: eq(usersTable.id, providerId) });
    if (!provider || provider.role !== "provider") {
      res.status(403).json({ error: "Provider account required" });
      return;
    }

    const activeStatuses = ["accepted", "on_the_way", "arrived", "started", "in_progress"];
    const [summary] = await db.select({
      totalJobs: sql<number>`count(*)::int`,
      pendingJobs: sql<number>`count(*) filter (where ${bookingsTable.status} = 'pending')::int`,
      activeJobs: sql<number>`count(*) filter (where ${bookingsTable.status} in ('accepted','on_the_way','arrived','started','in_progress'))::int`,
      completedJobs: sql<number>`count(*) filter (where ${bookingsTable.status} = 'completed')::int`,
      cancelledJobs: sql<number>`count(*) filter (where ${bookingsTable.status} = 'cancelled')::int`,
      grossEarnings: sql<number>`coalesce(sum(case when ${bookingsTable.status} = 'completed' then coalesce(${bookingsTable.price}, 0) else 0 end), 0)::int`,
      netEarnings: sql<number>`coalesce(sum(case when ${bookingsTable.status} = 'completed' then coalesce(${bookingsTable.providerAmount}, ${bookingsTable.price}, 0) else 0 end), 0)::int`,
    }).from(bookingsTable).where(eq(bookingsTable.providerId, providerId));

    const [pendingNegotiations, unreadNotifications, recentJobs, weeklyRows] = await Promise.all([
      db.$count(negotiationsTable, and(eq(negotiationsTable.providerId, providerId), inArray(negotiationsTable.status, ["customer_offer", "provider_counter"]))),
      db.$count(notificationsTable, and(eq(notificationsTable.userId, providerId), eq(notificationsTable.isRead, false))),
      db.select().from(bookingsTable).where(eq(bookingsTable.providerId, providerId)).orderBy(desc(bookingsTable.updatedAt)).limit(5),
      db.select({ completedAt: bookingsTable.jobCompletedAt, amount: bookingsTable.providerAmount, price: bookingsTable.price })
        .from(bookingsTable)
        .where(and(eq(bookingsTable.providerId, providerId), eq(bookingsTable.status, "completed"), gte(bookingsTable.jobCompletedAt, new Date(Date.now() - 7 * 86400000)))),
    ]);

    const days = Array.from({ length: 7 }, (_, index) => {
      const date = new Date();
      date.setHours(0, 0, 0, 0);
      date.setDate(date.getDate() - (6 - index));
      return { date: date.toISOString().slice(0, 10), label: date.toLocaleDateString("en-US", { weekday: "short" }), amount: 0 };
    });
    for (const row of weeklyRows) {
      if (!row.completedAt) continue;
      const key = row.completedAt.toISOString().slice(0, 10);
      const day = days.find((item) => item.date === key);
      if (day) day.amount += Number(row.amount ?? row.price ?? 0);
    }

    const totalJobs = Number(summary?.totalJobs || 0);
    const completedJobs = Number(summary?.completedJobs || 0);
    res.json({
      dashboard: {
        provider: {
          isAvailable: Boolean(provider.isAvailable),
          isVerified: Boolean(provider.isVerified),
          verificationStatus: provider.verificationStatus,
          isBlocked: Boolean(provider.isBlocked),
          blockedReason: provider.blockedReason,
          cooldownUntil: provider.cooldownUntil,
          rating: provider.rating || 0,
          ratingCount: provider.ratingCount || 0,
          pendingCommission: provider.pendingCommission || 0,
          commissionLimit: provider.commissionLimit || 0,
        },
        summary: {
          totalJobs,
          pendingJobs: Number(summary?.pendingJobs || 0),
          activeJobs: Number(summary?.activeJobs || 0),
          completedJobs,
          cancelledJobs: Number(summary?.cancelledJobs || 0),
          pendingNegotiations,
          unreadNotifications,
          grossEarnings: Number(summary?.grossEarnings || 0),
          netEarnings: Number(summary?.netEarnings || 0),
          completionRate: totalJobs > 0 ? Math.round((completedJobs / totalJobs) * 100) : 0,
        },
        week: days,
        recentJobs,
        hasActiveWork: Number(summary?.activeJobs || 0) > 0,
        activeStatuses,
      },
    });
  } catch (error) {
    logger.error({ err: error }, "provider dashboard error");
    res.status(500).json({ error: "Failed to load provider dashboard" });
  }
});

router.get("/availability", requireAuth, async (req: AuthRequest, res) => {
  try {
    const user = await db.query.usersTable.findFirst({ where: eq(usersTable.id, req.user!.userId) });
    if (!user) { res.status(404).json({ error: "User not found" }); return; }
    res.json({ user: toSafeUser(user) });
  } catch {
    res.status(500).json({ error: "Failed to load availability" });
  }
});

router.patch("/availability", requireAuth, async (req: AuthRequest, res) => {
  try {
    const { isAvailable } = req.body as { isAvailable: boolean };
    if (typeof isAvailable !== "boolean") {
      res.status(400).json({ error: "isAvailable must be a boolean" });
      return;
    }

    const me = await db.query.usersTable.findFirst({ where: eq(usersTable.id, req.user!.userId) });
    if (!me) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    if (me.role !== "provider") {
      res.status(403).json({ error: "Provider account required" });
      return;
    }
    if (isAvailable && (me.isDeactivated || me.accountStatus !== "active")) {
      res.status(403).json({ error: "Your account is not active" });
      return;
    }
    if (isAvailable && (!me.isVerified || me.verificationStatus !== "approved")) {
      res.status(403).json({ error: "Provider verification approval is required before going online" });
      return;
    }
    if (me.isBlocked && isAvailable) {
      res.status(400).json({ error: me.blockedReason || "Your account is blocked from receiving new jobs until dues are cleared." });
      return;
    }
    if (isAvailable && me.cooldownUntil && me.cooldownUntil > new Date()) {
      res.status(409).json({ error: "Your availability cooldown is still active", cooldownUntil: me.cooldownUntil });
      return;
    }
    if (isAvailable) {
      const activeBlock = await getProviderActiveWorkBlock(req.user!.userId);
      if (activeBlock.blocked) {
        res.status(409).json(activeWorkHttpPayload({
          ...activeBlock,
          message: `You have an active job (${activeBlock.entityId || "current job"}). Please complete it before turning availability back on. Athoo will automatically make you available after job completion.`
        }));
        return;
      }
    }

    await db
      .update(usersTable)
      .set({ isAvailable, updatedAt: new Date() })
      .where(eq(usersTable.id, req.user!.userId));
    const user = await db.query.usersTable.findFirst({ where: eq(usersTable.id, req.user!.userId) });
    emitToUser(req.user!.userId, "provider:availability", { isAvailable, reason: "provider_toggle" });
    res.json({ user: toSafeUser(user) });
  } catch (e) {
    res.status(500).json({ error: "Failed to update availability" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const provider = await db.query.usersTable.findFirst({
      where: and(eq(usersTable.id, req.params.id), eq(usersTable.role, "provider")),
    });
    if (!provider) {
      res.status(404).json({ error: "Provider not found" });
      return;
    }
    res.json({ provider: toPublicProvider(provider) });
  } catch (e) {
    res.status(500).json({ error: "Failed to load provider" });
  }
});

router.get("/:id/reviews", async (req, res) => {
  try {
    const reviews = await db
      .select({
        id: reviewsTable.id,
        rating: reviewsTable.rating,
        review: reviewsTable.review,
        customerName: reviewsTable.reviewerName,
        service: bookingsTable.service,
        createdAt: reviewsTable.createdAt,
      })
      .from(reviewsTable)
      .innerJoin(bookingsTable, eq(bookingsTable.id, reviewsTable.bookingId))
      .where(and(eq(reviewsTable.reviewedId, req.params.id), eq(reviewsTable.isDisputed, false)))
      .orderBy(desc(reviewsTable.createdAt))
      .limit(30);
    res.json({ reviews });
  } catch (e) {
    res.status(500).json({ error: "Failed to load reviews" });
  }
});

export default router;

export const ratingsRouter = Router();

ratingsRouter.post("/", requireAuth, async (req: AuthRequest, res) => {
  try {
    const updated = await submitBookingReview({
      bookingId: String(req.body?.bookingId || ""),
      customerId: req.user!.userId,
      rating: req.body?.rating,
      review: req.body?.review,
    });
    res.json({ success: true, booking: updated });
  } catch (e) {
    if (e instanceof ReviewSubmissionError) {
      res.status(e.status).json({ error: e.message });
      return;
    }
    logger.error({ err: e }, "legacy rating submission error");
    res.status(500).json({ error: "Failed to submit rating" });
  }
});

ratingsRouter.get("/provider/:providerId", async (req, res) => {
  try {
    const reviews = await db
      .select({
        id: bookingsTable.id,
        rating: bookingsTable.rating,
        review: bookingsTable.review,
        customerName: bookingsTable.customerName,
        service: bookingsTable.service,
        createdAt: bookingsTable.updatedAt,
      })
      .from(bookingsTable)
      .where(
        and(
          eq(bookingsTable.providerId, req.params.providerId),
          eq(bookingsTable.status, "completed"),
          isNotNull(bookingsTable.rating)
        )
      )
      .orderBy(desc(bookingsTable.updatedAt))
      .limit(50);

    const provider = await db.query.usersTable.findFirst({
      where: eq(usersTable.id, req.params.providerId),
      columns: { rating: true, ratingCount: true },
    });

    res.json({
      reviews,
      averageRating: provider?.rating ?? 0,
      reviewCount: provider?.ratingCount ?? 0,
    });
  } catch (e) {
    res.status(500).json({ error: "Failed to load ratings" });
  }
});

