import { Router } from "express";
import { logger } from "../lib/logger";
import { db } from "@workspace/db";
import { usersTable, bookingsTable, serviceCategoriesTable, reviewsTable, notificationsTable, negotiationsTable } from "@workspace/db/schema";
import { eq, and, or, arrayContains, isNotNull, isNull, asc, desc, gt, lt, ne, sql, inArray, gte, getTableColumns } from "drizzle-orm";
import { requireAuth, AuthRequest } from "../middlewares/auth";
import { toPublicProvider, safeUserAllowlist } from "../lib/admin";
import { getProviderActiveWorkBlock, activeWorkHttpPayload } from "../lib/businessRules";
import { ReviewSubmissionError, submitBookingReview } from "../domain/reviews";
import { emitToUser } from "../lib/eventBus";
import { getPlatformSettings } from "../lib/admin";
import { providerWithinRadius, validateTravelRadius } from "../lib/providerAvailability";

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
    const maximumLocationAccuracy = Math.max(25, Math.min(1_000, Number(process.env.PROVIDER_LOCATION_MAX_ACCURACY_METERS || 250)));
    const maximumLocationAgeMs = Math.max(60_000, Number(process.env.PROVIDER_LOCATION_MAX_AGE_MS || 30 * 60_000));
    const ranked = rows
      .map((p) => {
        const locationAccuracy = Number(p.locationAccuracy);
        const locationUpdatedAt = p.locationUpdatedAt ? new Date(p.locationUpdatedAt).getTime() : null;
        if (Number.isFinite(locationAccuracy) && locationAccuracy > maximumLocationAccuracy) return null;
        if (locationUpdatedAt && Date.now() - locationUpdatedAt > maximumLocationAgeMs) return null;
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

type ProviderListSort = "default" | "top" | "jobs" | "nearby";

type ProviderListCursor = {
  v: 1;
  sort: ProviderListSort;
  id: string;
  updatedAt: string;
  rating?: number;
  ratingCount?: number;
  totalJobs?: number;
  distanceKm?: number;
};

type ProviderListRow = typeof usersTable.$inferSelect & {
  discoveryDistanceKm: number;
};

const PROVIDER_DISTANCE_SENTINEL_KM = 1_000_000_000;

function encodeProviderListCursor(provider: ProviderListRow, sort: ProviderListSort): string {
  const payload: ProviderListCursor = {
    v: 1,
    sort,
    id: provider.id,
    updatedAt: (provider.updatedAt ?? new Date(0)).toISOString(),
    ...(sort === "top"
      ? {
          rating: Number(provider.rating || 0),
          ratingCount: Number(provider.ratingCount || 0),
        }
      : {}),
    ...(sort === "jobs"
      ? {
          totalJobs: Number(provider.totalJobs || 0),
        }
      : {}),
    ...(sort === "nearby"
      ? {
          distanceKm: Number(provider.discoveryDistanceKm),
        }
      : {}),
  };

  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

function decodeProviderListCursor(value: string): ProviderListCursor | null {
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Partial<ProviderListCursor>;
    if (
      parsed.v !== 1 ||
      (
        parsed.sort !== "default" &&
        parsed.sort !== "top" &&
        parsed.sort !== "jobs" &&
        parsed.sort !== "nearby"
      ) ||
      typeof parsed.id !== "string" ||
      !parsed.id ||
      typeof parsed.updatedAt !== "string" ||
      !parsed.updatedAt ||
      Number.isNaN(new Date(parsed.updatedAt).getTime())
    ) {
      return null;
    }

    if (
      parsed.sort === "top" &&
      (
        typeof parsed.rating !== "number" ||
        !Number.isFinite(parsed.rating) ||
        typeof parsed.ratingCount !== "number" ||
        !Number.isFinite(parsed.ratingCount)
      )
    ) {
      return null;
    }

    if (
      parsed.sort === "jobs" &&
      (
        typeof parsed.totalJobs !== "number" ||
        !Number.isFinite(parsed.totalJobs)
      )
    ) {
      return null;
    }

    if (
      parsed.sort === "nearby" &&
      (
        typeof parsed.distanceKm !== "number" ||
        !Number.isFinite(parsed.distanceKm) ||
        parsed.distanceKm < 0
      )
    ) {
      return null;
    }

    return parsed as ProviderListCursor;
  } catch {
    return null;
  }
}

router.get("/", async (req, res) => {
  try {
    const serviceId = req.query.serviceId ? String(req.query.serviceId) : undefined;
    const sort: ProviderListSort =
      req.query.sort === "top"
        ? "top"
        : req.query.sort === "jobs"
          ? "jobs"
          : req.query.sort === "nearby"
            ? "nearby"
            : "default";

    const rawLimit = req.query.limit;
    const rawCursor = typeof req.query.cursor === "string" ? req.query.cursor.trim() : "";
    const city = typeof req.query.city === "string" ? req.query.city.trim() : "";
    const search = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const availableValue = typeof req.query.available === "string"
      ? req.query.available.trim().toLowerCase()
      : "";
    const onlyAvailable = availableValue === "1" || availableValue === "true";

    const rawLatitude = req.query.latitude;
    const rawLongitude = req.query.longitude;
    const latitude = rawLatitude === undefined ? null : Number(rawLatitude);
    const longitude = rawLongitude === undefined ? null : Number(rawLongitude);

    let limit: number | null = null;
    if (rawLimit !== undefined) {
      const parsedLimit = Number(rawLimit);
      if (!Number.isInteger(parsedLimit) || parsedLimit < 1) {
        res.status(400).json({ error: "limit must be a positive integer" });
        return;
      }
      limit = Math.min(50, parsedLimit);
    }

    if (city.length > 80) {
      res.status(400).json({ error: "city filter is too long" });
      return;
    }

    if (search.length > 100) {
      res.status(400).json({ error: "provider search is too long" });
      return;
    }

    if (
      rawLatitude !== undefined &&
      (
        latitude === null ||
        !Number.isFinite(latitude) ||
        latitude < -90 ||
        latitude > 90
      )
    ) {
      res.status(400).json({ error: "latitude must be between -90 and 90" });
      return;
    }

    if (
      rawLongitude !== undefined &&
      (
        longitude === null ||
        !Number.isFinite(longitude) ||
        longitude < -180 ||
        longitude > 180
      )
    ) {
      res.status(400).json({ error: "longitude must be between -180 and 180" });
      return;
    }

    if (
      sort === "nearby" &&
      (
        latitude === null ||
        longitude === null ||
        !Number.isFinite(latitude) ||
        !Number.isFinite(longitude)
      )
    ) {
      res.status(400).json({ error: "nearby sort requires latitude and longitude" });
      return;
    }

    if ((sort === "jobs" || sort === "nearby" || onlyAvailable || city || search) && limit === null) {
      res.status(400).json({ error: "provider discovery filters require limit" });
      return;
    }

    if (rawCursor && limit === null) {
      res.status(400).json({ error: "cursor requires limit" });
      return;
    }

    const cursor = rawCursor ? decodeProviderListCursor(rawCursor) : null;
    if (rawCursor && (!cursor || cursor.sort !== sort)) {
      res.status(400).json({ error: "invalid provider cursor" });
      return;
    }

    const cityPattern = city ? `%${city.toLowerCase()}%` : "";
    const searchPattern = search ? `%${search.toLowerCase()}%` : "";

    const providerFilter = and(
      eq(usersTable.role, "provider"),
      eq(usersTable.isDeactivated, false),
      eq(usersTable.isBlocked, false),
      eq(usersTable.verificationStatus, "approved"),
      serviceId
        ? sql`lower(${serviceId}) = ANY(SELECT lower(unnest(${usersTable.services})))`
        : undefined,
      onlyAvailable ? eq(usersTable.isAvailable, true) : undefined,
      city
        ? sql`lower(COALESCE(${usersTable.location}, '')) LIKE ${cityPattern}`
        : undefined,
      search
        ? or(
            sql`lower(COALESCE(${usersTable.location}, '')) LIKE ${searchPattern}`,
            sql`lower(${usersTable.name}) LIKE ${searchPattern}`
          )
        : undefined
    );

    const providerRatingOrder = sql<number>`COALESCE(${usersTable.rating}, 0)`;
    const providerRatingCountOrder = sql<number>`COALESCE(${usersTable.ratingCount}, 0)`;
    const providerTotalJobsOrder = sql<number>`COALESCE(${usersTable.totalJobs}, 0)`;
    const providerUpdatedAtOrder = sql<Date>`COALESCE(${usersTable.updatedAt}, ${new Date(0)})`;

    const providerLatitudeNumber = sql<number | null>`CASE
      WHEN ${usersTable.latitude} ~ '^[+-]?([0-9]+([.][0-9]*)?|[.][0-9]+)$'
        THEN CASE
          WHEN (${usersTable.latitude})::double precision BETWEEN -90 AND 90
            THEN (${usersTable.latitude})::double precision
          ELSE NULL
        END
      ELSE NULL
    END`;

    const providerLongitudeNumber = sql<number | null>`CASE
      WHEN ${usersTable.longitude} ~ '^[+-]?([0-9]+([.][0-9]*)?|[.][0-9]+)$'
        THEN CASE
          WHEN (${usersTable.longitude})::double precision BETWEEN -180 AND 180
            THEN (${usersTable.longitude})::double precision
          ELSE NULL
        END
      ELSE NULL
    END`;

    const providerDistanceOrder = sort === "nearby"
      ? sql<number>`CASE
          WHEN ${providerLatitudeNumber} IS NULL OR ${providerLongitudeNumber} IS NULL
            THEN ${PROVIDER_DISTANCE_SENTINEL_KM}
          ELSE 6371.0 * acos(
            LEAST(
              1.0,
              GREATEST(
                -1.0,
                sin(radians(${latitude ?? 0})) * sin(radians(${providerLatitudeNumber})) +
                cos(radians(${latitude ?? 0})) * cos(radians(${providerLatitudeNumber})) *
                cos(radians(${providerLongitudeNumber}) - radians(${longitude ?? 0}))
              )
            )
          )
        END`
      : sql<number>`${PROVIDER_DISTANCE_SENTINEL_KM}`;

    const cursorFilter = cursor
      ? sort === "top"
        ? sql`(
            ${providerRatingOrder},
            ${providerRatingCountOrder},
            ${providerUpdatedAtOrder},
            ${usersTable.id}
          ) < (
            ${cursor.rating ?? 0},
            ${cursor.ratingCount ?? 0},
            ${new Date(cursor.updatedAt)},
            ${cursor.id}
          )`
        : sort === "jobs"
          ? sql`(
              ${providerTotalJobsOrder},
              ${providerUpdatedAtOrder},
              ${usersTable.id}
            ) < (
              ${cursor.totalJobs ?? 0},
              ${new Date(cursor.updatedAt)},
              ${cursor.id}
            )`
          : sort === "nearby"
            ? sql`(
                ${providerDistanceOrder},
                ${usersTable.id}
              ) > (
                ${cursor.distanceKm ?? PROVIDER_DISTANCE_SENTINEL_KM},
                ${cursor.id}
              )`
            : sql`(
                ${providerUpdatedAtOrder},
                ${usersTable.id}
              ) < (
                ${new Date(cursor.updatedAt)},
                ${cursor.id}
              )`
      : undefined;

    const pageFilter = cursorFilter ? and(providerFilter, cursorFilter) : providerFilter;
    const providerColumns = getTableColumns(usersTable);
    const providerQuery = db
      .select({
        ...providerColumns,
        discoveryDistanceKm: providerDistanceOrder,
      })
      .from(usersTable)
      .where(pageFilter);

    const fetchLimit = limit === null ? null : limit + 1;

    const providers = sort === "top"
      ? fetchLimit === null
        ? await providerQuery.orderBy(
            desc(providerRatingOrder),
            desc(providerRatingCountOrder),
            desc(providerUpdatedAtOrder),
            desc(usersTable.id)
          )
        : await providerQuery
            .orderBy(
              desc(providerRatingOrder),
              desc(providerRatingCountOrder),
              desc(providerUpdatedAtOrder),
              desc(usersTable.id)
            )
            .limit(fetchLimit)
      : sort === "jobs"
        ? await providerQuery
            .orderBy(
              desc(providerTotalJobsOrder),
              desc(providerUpdatedAtOrder),
              desc(usersTable.id)
            )
            .limit(fetchLimit ?? 51)
        : sort === "nearby"
          ? await providerQuery
              .orderBy(
                asc(providerDistanceOrder),
                asc(usersTable.id)
              )
              .limit(fetchLimit ?? 51)
          : fetchLimit === null
            ? await providerQuery
            : await providerQuery
                .orderBy(
                  desc(providerUpdatedAtOrder),
                  desc(usersTable.id)
                )
                .limit(fetchLimit);

    const serializeProvider = (provider: ProviderListRow) => {
      const publicProvider = toPublicProvider(provider)!;
      const discoveredDistance = Number(provider.discoveryDistanceKm);

      return sort === "nearby" &&
        Number.isFinite(discoveredDistance) &&
        discoveredDistance < PROVIDER_DISTANCE_SENTINEL_KM
        ? {
            ...publicProvider,
            distanceKm: discoveredDistance,
          }
        : publicProvider;
    };

    if (limit === null) {
      res.json({ providers: providers.map((provider) => toPublicProvider(provider)) });
      return;
    }

    const hasMore = providers.length > limit;
    const pageProviders = hasMore ? providers.slice(0, limit) : providers;
    const lastProvider = pageProviders.at(-1);
    const nextCursor = hasMore && lastProvider
      ? encodeProviderListCursor(lastProvider, sort)
      : null;

    res.json({
      providers: pageProviders.map((provider) => serializeProvider(provider)),
      hasMore,
      nextCursor,
    });
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

router.patch("/location", requireAuth, async (req: AuthRequest, res) => {
  try {
    const latitude = Number(req.body?.latitude);
    const longitude = Number(req.body?.longitude);
    const accuracy = req.body?.accuracy == null ? null : Number(req.body.accuracy);

    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 ||
        !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      res.status(400).json({ error: "Valid latitude and longitude are required" });
      return;
    }
    if (accuracy !== null && (!Number.isFinite(accuracy) || accuracy < 0 || accuracy > 100_000)) {
      res.status(400).json({ error: "Invalid location accuracy" });
      return;
    }
    const maximumAcceptedAccuracy = Math.max(25, Math.min(1_000, Number(process.env.PROVIDER_LOCATION_MAX_ACCURACY_METERS || 250)));
    if (accuracy !== null && accuracy > maximumAcceptedAccuracy) {
      res.status(422).json({
        error: `Location accuracy is too low (${Math.round(accuracy)} m). Move near a window or outdoors and try again.`,
        code: "LOCATION_ACCURACY_TOO_LOW",
        maximumAccuracyMeters: maximumAcceptedAccuracy,
      });
      return;
    }

    const provider = await db.query.usersTable.findFirst({ where: eq(usersTable.id, req.user!.userId) });
    if (!provider) { res.status(404).json({ error: "User not found" }); return; }
    if (provider.role !== "provider") { res.status(403).json({ error: "Provider account required" }); return; }

    const capturedAt = new Date();
    const [updated] = await db.update(usersTable).set({
      latitude: String(latitude),
      longitude: String(longitude),
      locationAccuracy: accuracy,
      locationUpdatedAt: capturedAt,
      updatedAt: capturedAt,
    }).where(eq(usersTable.id, provider.id)).returning();

    emitToUser(provider.id, "provider:location", {
      latitude,
      longitude,
      accuracy,
      updatedAt: updated.updatedAt,
    });
    res.json({ success: true, user: safeUserAllowlist(updated) });
  } catch (error) {
    logger.error({ err: error, userId: req.user?.userId }, "provider location update error");
    res.status(500).json({ error: "Failed to update provider location" });
  }
});

router.get("/service-radius", requireAuth, async (req: AuthRequest, res) => {
  try {
    const provider = await db.query.usersTable.findFirst({ where: eq(usersTable.id, req.user!.userId) });
    if (!provider) { res.status(404).json({ error: "User not found" }); return; }
    if (provider.role !== "provider") { res.status(403).json({ error: "Provider account required" }); return; }
    res.json({ maxTravelDistanceKm: validateTravelRadius(provider.maxTravelDistanceKm) || 15 });
  } catch (error) {
    logger.error({ err: error, userId: req.user?.userId }, "provider service radius load error");
    res.status(500).json({ error: "Failed to load service radius" });
  }
});

router.patch("/service-radius", requireAuth, async (req: AuthRequest, res) => {
  try {
    const radius = validateTravelRadius(req.body?.maxTravelDistanceKm);
    if (radius === null) {
      res.status(400).json({ error: "Service radius must be between 1 and 100 km" });
      return;
    }
    const provider = await db.query.usersTable.findFirst({ where: eq(usersTable.id, req.user!.userId) });
    if (!provider) { res.status(404).json({ error: "User not found" }); return; }
    if (provider.role !== "provider") { res.status(403).json({ error: "Provider account required" }); return; }

    const [updated] = await db.update(usersTable).set({
      maxTravelDistanceKm: radius,
      updatedAt: new Date(),
    }).where(eq(usersTable.id, provider.id)).returning();
    emitToUser(provider.id, "provider:availability", { isAvailable: updated.isAvailable, reason: "service_radius_updated" });
    res.json({ maxTravelDistanceKm: radius, user: safeUserAllowlist(updated) });
  } catch (error) {
    logger.error({ err: error, userId: req.user?.userId }, "provider service radius update error");
    res.status(500).json({ error: "Failed to update service radius" });
  }
});

router.get("/availability", requireAuth, async (req: AuthRequest, res) => {
  try {
    const user = await db.query.usersTable.findFirst({ where: eq(usersTable.id, req.user!.userId) });
    if (!user) { res.status(404).json({ error: "User not found" }); return; }
    res.json({ user: safeUserAllowlist(user) });
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
    if (isAvailable && (me.documentSuspendedAt || me.documentComplianceStatus === "suspended")) {
      res.status(409).json({
        error: me.documentComplianceReason || "Your provider account is temporarily paused until updated identity documents are approved.",
        code: "DOCUMENT_RENEWAL_REQUIRED",
      });
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
    res.json({ user: safeUserAllowlist(user) });
  } catch (e) {
    res.status(500).json({ error: "Failed to update availability" });
  }
});

type ProviderSearchSort = "recommended" | "rating" | "jobs" | "nearby";

type ProviderSearchCursor = {
  v: 1;
  sort: ProviderSearchSort;
  id: string;
  updatedAt?: string;
  recommendedScore?: number;
  rating?: number;
  ratingCount?: number;
  totalJobs?: number;
  distanceKm?: number;
};

type ProviderSearchRow = typeof usersTable.$inferSelect & {
  discoveryDistanceKm: number;
  discoveryRecommendedScore: number;
};

const SEARCH_DISTANCE_SENTINEL_KM = 1_000_000_000;

function encodeProviderSearchCursor(
  provider: ProviderSearchRow,
  sort: ProviderSearchSort,
): string {
  const payload: ProviderSearchCursor = {
    v: 1,
    sort,
    id: provider.id,
    ...(sort === "recommended"
      ? {
          recommendedScore: Number(provider.discoveryRecommendedScore),
          updatedAt: (provider.updatedAt ?? new Date(0)).toISOString(),
        }
      : {}),
    ...(sort === "rating"
      ? {
          rating: Number(provider.rating || 0),
          ratingCount: Number(provider.ratingCount || 0),
          updatedAt: (provider.updatedAt ?? new Date(0)).toISOString(),
        }
      : {}),
    ...(sort === "jobs"
      ? {
          totalJobs: Number(provider.totalJobs || 0),
          updatedAt: (provider.updatedAt ?? new Date(0)).toISOString(),
        }
      : {}),
    ...(sort === "nearby"
      ? {
          distanceKm: Number(provider.discoveryDistanceKm),
        }
      : {}),
  };

  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

function decodeProviderSearchCursor(value: string): ProviderSearchCursor | null {
  try {
    const parsed = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    ) as Partial<ProviderSearchCursor>;

    if (
      parsed.v !== 1 ||
      (
        parsed.sort !== "recommended" &&
        parsed.sort !== "rating" &&
        parsed.sort !== "jobs" &&
        parsed.sort !== "nearby"
      ) ||
      typeof parsed.id !== "string" ||
      !parsed.id
    ) {
      return null;
    }

    if (
      parsed.sort === "recommended" &&
      (
        typeof parsed.recommendedScore !== "number" ||
        !Number.isFinite(parsed.recommendedScore) ||
        typeof parsed.updatedAt !== "string" ||
        !Number.isFinite(new Date(parsed.updatedAt).getTime())
      )
    ) {
      return null;
    }

    if (
      parsed.sort === "rating" &&
      (
        typeof parsed.rating !== "number" ||
        !Number.isFinite(parsed.rating) ||
        typeof parsed.ratingCount !== "number" ||
        !Number.isFinite(parsed.ratingCount) ||
        typeof parsed.updatedAt !== "string" ||
        !Number.isFinite(new Date(parsed.updatedAt).getTime())
      )
    ) {
      return null;
    }

    if (
      parsed.sort === "jobs" &&
      (
        typeof parsed.totalJobs !== "number" ||
        !Number.isFinite(parsed.totalJobs) ||
        typeof parsed.updatedAt !== "string" ||
        !Number.isFinite(new Date(parsed.updatedAt).getTime())
      )
    ) {
      return null;
    }

    if (
      parsed.sort === "nearby" &&
      (
        typeof parsed.distanceKm !== "number" ||
        !Number.isFinite(parsed.distanceKm) ||
        parsed.distanceKm < 0
      )
    ) {
      return null;
    }

    return parsed as ProviderSearchCursor;
  } catch {
    return null;
  }
}

router.get("/search", async (req, res) => {
  try {
    const sort: ProviderSearchSort =
      req.query.sort === "rating"
        ? "rating"
        : req.query.sort === "jobs"
          ? "jobs"
          : req.query.sort === "nearby"
            ? "nearby"
            : "recommended";

    const rawLimit = req.query.limit;
    const parsedLimit = rawLimit === undefined ? 25 : Number(rawLimit);
    if (!Number.isInteger(parsedLimit) || parsedLimit < 1) {
      res.status(400).json({ error: "limit must be a positive integer" });
      return;
    }
    const limit = Math.min(50, parsedLimit);

    const serviceId =
      typeof req.query.serviceId === "string" ? req.query.serviceId.trim() : "";
    const city = typeof req.query.city === "string" ? req.query.city.trim() : "";
    const search = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const rawCursor =
      typeof req.query.cursor === "string" ? req.query.cursor.trim() : "";

    if (serviceId.length > 80) {
      res.status(400).json({ error: "service filter is too long" });
      return;
    }
    if (city.length > 80) {
      res.status(400).json({ error: "city filter is too long" });
      return;
    }
    if (search.length > 100) {
      res.status(400).json({ error: "provider search is too long" });
      return;
    }

    const rawMatchServices =
      typeof req.query.matchServices === "string"
        ? req.query.matchServices
            .split(",")
            .map((value) => value.trim().toLowerCase())
            .filter(Boolean)
        : [];

    if (
      rawMatchServices.length > 30 ||
      rawMatchServices.some((value) => value.length > 60)
    ) {
      res.status(400).json({ error: "matched service filters are invalid" });
      return;
    }

    const matchServices = Array.from(new Set(rawMatchServices));

    const hasLatitude = req.query.latitude !== undefined;
    const hasLongitude = req.query.longitude !== undefined;
    if (hasLatitude !== hasLongitude) {
      res.status(400).json({ error: "latitude and longitude must be provided together" });
      return;
    }

    const latitude = hasLatitude ? Number(req.query.latitude) : null;
    const longitude = hasLongitude ? Number(req.query.longitude) : null;
    const hasOrigin =
      latitude !== null &&
      longitude !== null &&
      Number.isFinite(latitude) &&
      Number.isFinite(longitude) &&
      latitude >= -90 &&
      latitude <= 90 &&
      longitude >= -180 &&
      longitude <= 180;

    if ((hasLatitude || hasLongitude) && !hasOrigin) {
      res.status(400).json({ error: "valid latitude and longitude are required" });
      return;
    }

    if (sort === "nearby" && !hasOrigin) {
      res.status(400).json({ error: "nearby sort requires latitude and longitude" });
      return;
    }

    const cursor = rawCursor ? decodeProviderSearchCursor(rawCursor) : null;
    if (rawCursor && (!cursor || cursor.sort !== sort)) {
      res.status(400).json({ error: "invalid provider search cursor" });
      return;
    }

    const cityPattern = city ? `%${city.toLowerCase()}%` : "";
    const searchPattern = search ? `%${search.toLowerCase()}%` : "";

    const matchedServiceFilter = matchServices.length
      ? or(
          ...matchServices.map(
            (matchedService) =>
              sql`lower(${matchedService}) = ANY(SELECT lower(unnest(${usersTable.services})))`,
          ),
        )
      : undefined;

    const searchFilter =
      search || matchServices.length
        ? or(
            search
              ? sql`lower(COALESCE(${usersTable.name}, '')) LIKE ${searchPattern}`
              : undefined,
            search
              ? sql`lower(COALESCE(${usersTable.location}, '')) LIKE ${searchPattern}`
              : undefined,
            matchedServiceFilter,
          )
        : undefined;

    const providerFilter = and(
      eq(usersTable.role, "provider"),
      eq(usersTable.accountStatus, "active"),
      eq(usersTable.isDeactivated, false),
      eq(usersTable.isBlocked, false),
      eq(usersTable.verificationStatus, "approved"),
      serviceId
        ? sql`lower(${serviceId}) = ANY(SELECT lower(unnest(${usersTable.services})))`
        : undefined,
      city
        ? sql`lower(COALESCE(${usersTable.location}, '')) LIKE ${cityPattern}`
        : undefined,
      searchFilter,
    );

    const providerRatingOrder = sql<number>`COALESCE(${usersTable.rating}, 0)`;
    const providerRatingCountOrder = sql<number>`COALESCE(${usersTable.ratingCount}, 0)`;
    const providerTotalJobsOrder = sql<number>`COALESCE(${usersTable.totalJobs}, 0)`;
    const providerUpdatedAtOrder =
      sql<Date>`COALESCE(${usersTable.updatedAt}, ${new Date(0)})`;

    const providerLatitudeNumber = sql<number | null>`CASE
      WHEN ${usersTable.latitude} ~ '^[+-]?([0-9]+([.][0-9]*)?|[.][0-9]+)$'
        THEN CASE
          WHEN CAST(${usersTable.latitude} AS double precision) BETWEEN -90 AND 90
            THEN CAST(${usersTable.latitude} AS double precision)
          ELSE NULL
        END
      ELSE NULL
    END`;

    const providerLongitudeNumber = sql<number | null>`CASE
      WHEN ${usersTable.longitude} ~ '^[+-]?([0-9]+([.][0-9]*)?|[.][0-9]+)$'
        THEN CASE
          WHEN CAST(${usersTable.longitude} AS double precision) BETWEEN -180 AND 180
            THEN CAST(${usersTable.longitude} AS double precision)
          ELSE NULL
        END
      ELSE NULL
    END`;

    const providerDistanceOrder = hasOrigin
      ? sql<number>`CASE
          WHEN ${providerLatitudeNumber} IS NULL OR ${providerLongitudeNumber} IS NULL
            THEN ${SEARCH_DISTANCE_SENTINEL_KM}
          ELSE 6371.0 * acos(
            LEAST(
              1.0,
              GREATEST(
                -1.0,
                sin(radians(${latitude!})) * sin(radians(${providerLatitudeNumber})) +
                cos(radians(${latitude!})) * cos(radians(${providerLatitudeNumber})) *
                cos(radians(${providerLongitudeNumber}) - radians(${longitude!}))
              )
            )
          )
        END`
      : sql<number>`${SEARCH_DISTANCE_SENTINEL_KM}`;

    const normalizedRatingOrder = sql<number>`CASE
      WHEN ${providerRatingOrder} > 5
        THEN ${providerRatingOrder} / 10.0
      ELSE ${providerRatingOrder}
    END`;

    const premiumPriorityBoost =
      sort === "recommended"
        ? (await getPlatformSettings()).premiumPriorityBoost
        : false;

    const premiumScore = premiumPriorityBoost
      ? sql<number>`CASE WHEN ${usersTable.isPremium} = true THEN 4 ELSE 0 END`
      : sql<number>`0`;

    const providerRecommendedScore = sql<number>`(
      CASE WHEN ${usersTable.isAvailable} = true THEN 35 ELSE 0 END
      + 25
      + (${normalizedRatingOrder} * 6.0)
      + (LEAST(${providerTotalJobsOrder}, 200) * 0.08)
      + GREATEST(0.0, 20.0 - ${providerDistanceOrder})
      + ${premiumScore}
    )`;

    const cursorFilter = cursor
      ? sort === "recommended"
        ? sql`(
            ${providerRecommendedScore},
            ${providerUpdatedAtOrder},
            ${usersTable.id}
          ) < (
            ${cursor.recommendedScore ?? 0},
            ${new Date(cursor.updatedAt!)},
            ${cursor.id}
          )`
        : sort === "rating"
          ? sql`(
              ${providerRatingOrder},
              ${providerRatingCountOrder},
              ${providerUpdatedAtOrder},
              ${usersTable.id}
            ) < (
              ${cursor.rating ?? 0},
              ${cursor.ratingCount ?? 0},
              ${new Date(cursor.updatedAt!)},
              ${cursor.id}
            )`
          : sort === "jobs"
            ? sql`(
                ${providerTotalJobsOrder},
                ${providerUpdatedAtOrder},
                ${usersTable.id}
              ) < (
                ${cursor.totalJobs ?? 0},
                ${new Date(cursor.updatedAt!)},
                ${cursor.id}
              )`
            : sql`(
                ${providerDistanceOrder},
                ${usersTable.id}
              ) > (
                ${cursor.distanceKm ?? SEARCH_DISTANCE_SENTINEL_KM},
                ${cursor.id}
              )`
      : undefined;

    const pageFilter = cursorFilter
      ? and(providerFilter, cursorFilter)
      : providerFilter;

    const providerColumns = getTableColumns(usersTable);
    const providerQuery = db
      .select({
        ...providerColumns,
        discoveryDistanceKm: providerDistanceOrder,
        discoveryRecommendedScore: providerRecommendedScore,
      })
      .from(usersTable)
      .where(pageFilter);

    const fetchLimit = limit + 1;

    const providers =
      sort === "recommended"
        ? await providerQuery
            .orderBy(
              desc(providerRecommendedScore),
              desc(providerUpdatedAtOrder),
              desc(usersTable.id),
            )
            .limit(fetchLimit)
        : sort === "rating"
          ? await providerQuery
              .orderBy(
                desc(providerRatingOrder),
                desc(providerRatingCountOrder),
                desc(providerUpdatedAtOrder),
                desc(usersTable.id),
              )
              .limit(fetchLimit)
          : sort === "jobs"
            ? await providerQuery
                .orderBy(
                  desc(providerTotalJobsOrder),
                  desc(providerUpdatedAtOrder),
                  desc(usersTable.id),
                )
                .limit(fetchLimit)
            : await providerQuery
                .orderBy(
                  asc(providerDistanceOrder),
                  asc(usersTable.id),
                )
                .limit(fetchLimit);

    const hasMore = providers.length > limit;
    const pageProviders = hasMore ? providers.slice(0, limit) : providers;
    const lastProvider = pageProviders.at(-1);
    const nextCursor =
      hasMore && lastProvider
        ? encodeProviderSearchCursor(lastProvider, sort)
        : null;

    res.json({
      providers: pageProviders.map((provider) => toPublicProvider(provider)),
      hasMore,
      nextCursor,
      sort,
    });
  } catch (error) {
    logger.error({ err: error }, "provider search discovery error");
    res.status(500).json({ error: "Failed to search providers" });
  }
});
router.get("/:id", async (req, res) => {
  try {
    const provider = await db.query.usersTable.findFirst({
      where: and(
        eq(usersTable.id, req.params.id),
        eq(usersTable.role, "provider"),
        eq(usersTable.isDeactivated, false),
        eq(usersTable.isBlocked, false),
        eq(usersTable.verificationStatus, "approved"),
      ),
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

