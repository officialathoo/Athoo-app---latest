import crypto from "crypto";
import { logger } from "../lib/logger";
import { Router, type Response } from "express";
import { db } from "@workspace/db";
import {
  broadcastRequestsTable,
  broadcastResponsesTable,
  bookingsTable,
  serviceCategoriesTable,
  usersTable,
} from "@workspace/db/schema";
import { and, eq, ne, desc, sql, or, inArray } from "drizzle-orm";
import { requireAuth, type AuthRequest } from "../middlewares/auth";
import { getPlatformSettings } from "../lib/admin";
import { emitToUser, emitToRole, type EventName } from "../lib/eventBus";
import { notifyUser } from "../lib/notifications";
import { enqueueJob, registerJobHandler } from "../lib/queue";
import { activeWorkHttpPayload, getBusyProviderIds, getCustomerActiveWorkBlock, getProviderActiveWorkBlock } from "../lib/businessRules";

const router = Router();

function generateId(): string {
  return crypto.randomUUID();
}

function generatePublicId(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const rand = crypto.randomInt(10000, 100000);
  return `ATH-${y}${m}${d}-${rand}`;
}

function toNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return Math.round(v);
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? Math.round(n) : null;
  }
  return null;
}

// Coordinate parser that PRESERVES decimal precision. Never use toNumber() for
// lat/lng — rounding a coordinate to the nearest integer degree shifts it by up
// to ~55 km, which silently breaks broadcast radius matching for nearby users.
function toCoord(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function broadcastExpiry(ttlMinutes: number): Date {
  return new Date(Date.now() + ttlMinutes * 60 * 1000);
}

function isExpiredBroadcast(r: { status: string; expiresAt: Date }): boolean {
  if (r.status !== "open") return false;
  return new Date(r.expiresAt).getTime() <= Date.now();
}

// Calculate distance in km between two lat/lng pairs (Haversine)
function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

type ProviderRecord = typeof usersTable.$inferSelect;
type BroadcastRecord = typeof broadcastRequestsTable.$inferSelect;

type ProviderBroadcastMatch = {
  eligible: boolean;
  reason?: string;
  distanceKm?: number;
  effectiveRadiusKm?: number;
};

const BROADCAST_EXPANSION_JOB = "broadcast_expand_notifications";

function broadcastDeliveryConcurrency(): number {
  const configured = Number(process.env.BROADCAST_DELIVERY_CONCURRENCY || 10);
  if (!Number.isFinite(configured)) return 10;
  return Math.max(1, Math.min(50, Math.floor(configured)));
}

async function forEachWithConcurrency<T>(
  items: readonly T[],
  limit: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  if (items.length === 0) return;
  let nextIndex = 0;
  const workerCount = Math.min(Math.max(1, limit), items.length);
  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (true) {
        const index = nextIndex;
        nextIndex += 1;
        if (index >= items.length) return;
        await worker(items[index]!);
      }
    }),
  );
}

function normalizeServiceKey(value: unknown): string {
  return String(value || "")
    .normalize("NFKD")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function providerMatchesService(
  providerServices: string[] | null,
  requestedService: unknown,
  requestedServiceLabel?: unknown,
): boolean {
  const requestedKeys = new Set(
    [requestedService, requestedServiceLabel]
      .map(normalizeServiceKey)
      .filter(Boolean),
  );
  if (requestedKeys.size === 0) return false;

  const services = new Set((providerServices || []).map(normalizeServiceKey).filter(Boolean));
  if (services.size === 0) return false;
  if (requestedKeys.has("general") || services.has("general")) return true;

  // Provider profiles normally store canonical category slugs. The label key
  // keeps older profiles compatible when they stored the category display name,
  // while exact normalized matching prevents unrelated partial-name matches.
  return [...requestedKeys].some((key) => services.has(key));
}

function providerTravelRadiusKm(provider: ProviderRecord): number {
  const parsed = Number(provider.maxTravelDistanceKm || 15);
  return Math.max(1, Math.min(100, Number.isFinite(parsed) ? parsed : 15));
}

function matchProviderToBroadcast(
  provider: ProviderRecord,
  request: Pick<BroadcastRecord, "service" | "serviceLabel" | "latitude" | "longitude">,
  platformRadiusKm: number,
  busyProviderIds: Set<string>,
): ProviderBroadcastMatch {
  if (provider.isBlocked) return { eligible: false, reason: "blocked" };
  if (provider.isDeactivated) return { eligible: false, reason: "deactivated" };
  if (!provider.isAvailable) return { eligible: false, reason: "unavailable" };
  if (!provider.isVerified || provider.verificationStatus !== "approved") {
    return { eligible: false, reason: "not_approved" };
  }
  if (busyProviderIds.has(provider.id)) return { eligible: false, reason: "busy" };
  if (!providerMatchesService(provider.services, request.service, request.serviceLabel)) {
    return { eligible: false, reason: "service_mismatch" };
  }

  const providerLat = toCoord(provider.latitude);
  const providerLng = toCoord(provider.longitude);
  const requestLat = toCoord(request.latitude);
  const requestLng = toCoord(request.longitude);
  if (providerLat === null || providerLng === null) return { eligible: false, reason: "provider_location_required" };
  if (requestLat === null || requestLng === null) return { eligible: false, reason: "request_location_missing" };

  const distance = distanceKm(providerLat, providerLng, requestLat, requestLng);
  const effectiveRadius = Math.min(Math.max(1, platformRadiusKm), providerTravelRadiusKm(provider));
  if (distance > effectiveRadius) {
    return {
      eligible: false,
      reason: "outside_service_area",
      distanceKm: Math.round(distance * 10) / 10,
      effectiveRadiusKm: effectiveRadius,
    };
  }
  return {
    eligible: true,
    distanceKm: Math.round(distance * 10) / 10,
    effectiveRadiusKm: effectiveRadius,
  };
}

async function deliverExpandedBroadcast(requestId: string): Promise<void> {
  const request = await db.query.broadcastRequestsTable.findFirst({
    where: eq(broadcastRequestsTable.id, requestId),
  });
  if (!request || request.status !== "open" || isExpiredBroadcast(request)) return;

  const [settings, providers] = await Promise.all([
    getPlatformSettings(),
    db.select().from(usersTable).where(eq(usersTable.role, "provider")),
  ]);
  if (settings.broadcastExpansionRadiusKm <= settings.broadcastInitialRadiusKm) return;

  const busyProviderIds = await getBusyProviderIds(providers.map((provider) => provider.id));
  const expandedOnly = providers.filter((provider) => {
    const initial = matchProviderToBroadcast(provider, request, settings.broadcastInitialRadiusKm, busyProviderIds);
    const expanded = matchProviderToBroadcast(provider, request, settings.broadcastExpansionRadiusKm, busyProviderIds);
    return !initial.eligible && initial.reason === "outside_service_area" && expanded.eligible;
  });

  let inAppCreated = 0;
  let pushAccepted = 0;
  let fallbackSignaled = 0;
  await forEachWithConcurrency(expandedOnly, broadcastDeliveryConcurrency(), async (provider) => {
    emitToUser(provider.id, "broadcast:new" as EventName, { request, expanded: true });
    const result = await notifyUser({
      userId: provider.id,
      title: "New Job Request Nearby",
      body: `${request.customerName} needs ${request.serviceLabel}`,
      type: "broadcast",
      link: `/broadcasts/${request.id}`,
      data: { broadcastRequestId: request.id, role: "provider", type: "broadcast", expanded: true },
    });
    if (result.created) inAppCreated += 1;
    if (result.pushSent) pushAccepted += 1;
    if (result.fallbackSignaled) fallbackSignaled += 1;
  });

  logger.info({
    broadcastRequestId: request.id,
    expandedRecipientCount: expandedOnly.length,
    inAppCreated,
    pushAccepted,
    fallbackSignaled,
  }, "expanded broadcast notification delivery completed");
}

registerJobHandler<{ requestId: string }>(BROADCAST_EXPANSION_JOB, async (payload) => {
  const requestId = String(payload?.requestId || "").trim();
  if (!requestId) return;
  await deliverExpandedBroadcast(requestId);
});

// ─── Customer: Create broadcast request ──────────────────────────────────────
router.post("/", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    if (req.user!.role !== "customer") {
      res.status(403).json({ error: "Only customers can create broadcast requests" });
      return;
    }

    const {
      service,
      serviceLabel,
      serviceIcon,
      description,
      videoUrl,
      address,
      latitude,
      longitude,
      scheduledDate,
      scheduledTime,
      customerOffer,
      travellingCharge,
      clientRequestId,
    } = req.body;

    if (!service || !serviceLabel || !address || !scheduledDate || !scheduledTime || !clientRequestId) {
      res.status(400).json({
        error: "service, serviceLabel, address, scheduledDate, scheduledTime, and clientRequestId are required",
      });
      return;
    }

    // Idempotency check MUST run before the active-work-block check below.
    // Otherwise a genuine retry of a still-open broadcast (e.g. the client's
    // first response was dropped by a flaky network) would be rejected with
    // "you already have an active broadcast" instead of returning the
    // existing request — turning a safe retry into a false failure.
    const existingRequest = await db.query.broadcastRequestsTable.findFirst({
      where: and(
        eq(broadcastRequestsTable.customerId, userId),
        eq(broadcastRequestsTable.clientRequestId, String(clientRequestId))
      ),
    });
    if (existingRequest) {
      res.json({ request: existingRequest, duplicate: true });
      return;
    }

    const [customer, settings] = await Promise.all([
      db.query.usersTable.findFirst({ where: eq(usersTable.id, userId) }),
      getPlatformSettings(),
    ]);

    const activeBlock = await getCustomerActiveWorkBlock(userId);
    if (activeBlock.blocked) {
      res.status(409).json(activeWorkHttpPayload(activeBlock));
      return;
    }

    if (!customer) {
      res.status(400).json({ error: "Customer not found" });
      return;
    }

    const rawService = String(service).trim();
    const category = await db.query.serviceCategoriesTable.findFirst({
      where: or(
        eq(serviceCategoriesTable.id, rawService),
        eq(serviceCategoriesTable.slug, rawService),
      ),
    });
    if (category && category.isActive === false) {
      res.status(400).json({ error: "This service category is currently unavailable" });
      return;
    }

    const parsedLat = toCoord(latitude);
    const parsedLng = toCoord(longitude);
    const parsedOffer = toNumber(customerOffer);
    const parsedTravellingCharge = Math.max(0, toNumber(travellingCharge) ?? 0);

    // Require customer GPS coordinates server-side — frontend location gate is not sufficient
    if (parsedLat === null || parsedLng === null) {
      res.status(400).json({ error: "Your location is required to create a broadcast request. Please enable location access in your app settings." });
      return;
    }

    const request = {
      id: generateId(),
      customerId: userId,
      clientRequestId: String(clientRequestId),
      customerName: customer.name,
      service: category?.slug || rawService,
      serviceLabel: category?.name || String(serviceLabel).trim(),
      serviceIcon: category?.icon || serviceIcon || "tool",
      description: description || null,
      videoUrl: videoUrl || null,
      address: String(address).trim(),
      latitude: parsedLat,
      longitude: parsedLng,
      scheduledDate: String(scheduledDate),
      scheduledTime: String(scheduledTime),
      customerOffer: parsedOffer,
      travellingCharge: parsedTravellingCharge,
      status: "open",
      acceptedResponseId: null,
      bookingId: null,
      expiresAt: broadcastExpiry(settings.broadcastTTLMinutes),
    };

    await db.insert(broadcastRequestsTable).values(request);

    const deliverySummary = {
      candidateCount: 0,
      matchedCount: 0,
      inAppCreated: 0,
      onlineRecipients: 0,
      pushTokenCount: 0,
      pushAccepted: 0,
      pushFailed: 0,
      fallbackSignaled: 0,
      skippedByReason: {} as Record<string, number>,
      expansionQueued: false,
    };

    if (settings.broadcastExpansionRadiusKm > settings.broadcastInitialRadiusKm) {
      try {
        await enqueueJob(BROADCAST_EXPANSION_JOB, { requestId: request.id }, {
          attempts: 3,
          delayMs: settings.broadcastExpandAfterMinutes * 60 * 1000,
          dedupeKey: `broadcast-expand:${request.id}`,
        });
        deliverySummary.expansionQueued = true;
      } catch (queueError) {
        req.log?.warn?.({ err: queueError, broadcastRequestId: request.id }, "broadcast expansion delivery could not be queued");
      }
    }

    // Provider matching and notification delivery are best-effort. Once the
    // broadcast row is committed, downstream push/socket failures must never
    // turn a successful creation into an HTTP 500 or encourage duplicate retries.
    try {
      // Fetch all provider candidates so the delivery summary explains every
      // exclusion rather than silently returning "sent" with zero recipients.
      const candidateProviders = await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.role, "provider"));
      deliverySummary.candidateCount = candidateProviders.length;

      const busyProviderIds = await getBusyProviderIds(candidateProviders.map((provider) => provider.id));
      const matchedProviders: typeof candidateProviders = [];
      const skipped: { id: string; reason: string; distanceKm?: number; effectiveRadiusKm?: number }[] = [];

      for (const provider of candidateProviders) {
        const match = matchProviderToBroadcast(
          provider,
          request,
          settings.broadcastInitialRadiusKm,
          busyProviderIds,
        );
        if (!match.eligible) {
          const reason = match.reason || "not_eligible";
          deliverySummary.skippedByReason[reason] = (deliverySummary.skippedByReason[reason] || 0) + 1;
          skipped.push({
            id: provider.id,
            reason,
            ...(match.distanceKm !== undefined ? { distanceKm: match.distanceKm } : {}),
            ...(match.effectiveRadiusKm !== undefined ? { effectiveRadiusKm: match.effectiveRadiusKm } : {}),
          });
          continue;
        }
        matchedProviders.push(provider);
      }
      deliverySummary.matchedCount = matchedProviders.length;

      const priceText = parsedOffer ? `Rs. ${parsedOffer}` : "open price";

      let socketEmitCount = 0;
      let pushTokenCount = 0;
      let dbNotificationCount = 0;
      let pushSuccessCount = 0;
      let pushFailureCount = 0;
      let fallbackSignaledCount = 0;

      // Every eligible, currently available provider gets a durable in-app
      // notification plus a push attempt. Network/offline state never excludes a
      // provider; the explicit "Available for jobs" preference does.
      await forEachWithConcurrency(
        matchedProviders,
        broadcastDeliveryConcurrency(),
        async (provider) => {
          const sent = emitToUser(provider.id, "broadcast:new" as EventName, { request });
          if (sent > 0) socketEmitCount += 1;
          if (provider.expoPushToken) pushTokenCount += 1;

          try {
            const result = await notifyUser({
              userId: provider.id,
              title: "New Job Request",
              body: `${customer.name} needs ${request.serviceLabel} — ${priceText}`,
              type: "broadcast",
              link: `/broadcasts/${request.id}`,
              data: { broadcastRequestId: request.id, role: "provider", type: "broadcast" },
            });

            if (result.created) dbNotificationCount += 1;
            if (result.onlineConnections > 0) deliverySummary.onlineRecipients += 1;
            if (result.fallbackSignaled) fallbackSignaledCount += 1;
            if (result.hasToken) {
              if (result.pushSent) pushSuccessCount += 1;
              else pushFailureCount += 1;
            }
          } catch (notifyError) {
            pushFailureCount += 1;
            req.log?.warn?.({ err: notifyError, providerId: provider.id, broadcastRequestId: request.id }, "broadcast provider notification failed");
          }
        },
      );

      deliverySummary.inAppCreated = dbNotificationCount;
      deliverySummary.pushTokenCount = pushTokenCount;
      deliverySummary.pushAccepted = pushSuccessCount;
      deliverySummary.pushFailed = pushFailureCount;
      deliverySummary.fallbackSignaled = fallbackSignaledCount;

      req.log?.info?.(
        {
          broadcastRequestId: request.id,
          totalCandidateProviders: candidateProviders.length,
          matchedProviderIds: matchedProviders.map((p) => p.id),
          matchedCount: matchedProviders.length,
          skipped,
          skippedCount: skipped.length,
          pushTokenCount,
          pushSendStatus: { success: pushSuccessCount, failure: pushFailureCount },
          socketEmitCount,
          dbNotificationCount,
          fallbackSignaledCount,
          expansionQueued: deliverySummary.expansionQueued,
        },
        "broadcast created — provider notification delivery summary"
      );

      if (matchedProviders.length === 0) {
        req.log?.warn?.(
          { broadcastRequestId: request.id, totalCandidateProviders: candidateProviders.length },
          "broadcast created but no providers matched"
        );
      }

      emitToRole("admin", "admin:event" as EventName, { type: "broadcast:new", request });

    } catch (deliveryError) {
      logger.warn(
        { err: deliveryError, broadcastRequestId: request.id },
        "broadcast created but provider matching/notification delivery was incomplete",
      );
    }

    res.json({ request, delivery: deliverySummary });
  } catch (e: any) {
    logger.error({ err: e }, "broadcast create error");
    // Drizzle wraps the underlying pg error in DrizzleQueryError, which
    // exposes the Postgres error code as `.cause.code`, not `.code` — a
    // plain `e?.code` check never matches, so unique-violation races fell
    // through to the generic 500 branch below and leaked raw SQL/params.
    const code = String(e?.code || e?.cause?.code || "");
    if (code === "23505") {
      const userId = req.user?.userId;
      const requestId = String(req.body?.clientRequestId || "");
      if (userId && requestId) {
        const existing = await db.query.broadcastRequestsTable.findFirst({
          where: and(
            eq(broadcastRequestsTable.customerId, userId),
            eq(broadcastRequestsTable.clientRequestId, requestId),
          ),
        });
        if (existing) {
          res.json({ request: existing, duplicate: true });
          return;
        }
      }
    }
    if (code === "42703" || code === "42P01") {
      res.status(503).json({ error: "Broadcast database migration is not applied. Run pnpm db:migrate and redeploy the API." });
      return;
    }
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "Failed to create broadcast request" : String(e?.message || "Failed to create broadcast request") });
  }
});

// ─── Customer: List my broadcast requests ────────────────────────────────────
// ─── Provider: List open broadcasts in their service area ────────────────────
router.get("/", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const role = req.user!.role;

    if (role === "customer") {
      const rows = await db
        .select()
        .from(broadcastRequestsTable)
        .where(eq(broadcastRequestsTable.customerId, userId))
        .orderBy(desc(broadcastRequestsTable.createdAt));

      // Attach responses for each (single batched query, then group in memory)
      if (rows.length === 0) {
        res.json({ requests: [] });
        return;
      }
      const ids = rows.map((r) => r.id);
      const allResponses = await db
        .select()
        .from(broadcastResponsesTable)
        .where(inArray(broadcastResponsesTable.requestId, ids));
      const byRequestId = new Map<string, typeof allResponses>();
      for (const resp of allResponses) {
        const list = byRequestId.get(resp.requestId) ?? [];
        list.push(resp);
        byRequestId.set(resp.requestId, list);
      }
      const withResponses = rows.map((r) => ({ ...r, responses: byRequestId.get(r.id) ?? [] }));

      res.json({ requests: withResponses });
      return;
    }

    if (role === "provider") {
      const provider = await db.query.usersTable.findFirst({
        where: eq(usersTable.id, userId),
      });
      if (!provider) {
        res.status(404).json({ error: "Provider not found" });
        return;
      }

      const providerLat = toCoord(provider.latitude);
      const providerLng = toCoord(provider.longitude);
      const accountReason = provider.isBlocked
        ? "blocked"
        : provider.isDeactivated
          ? "deactivated"
          : !provider.isAvailable
            ? "unavailable"
          : (!provider.isVerified || provider.verificationStatus !== "approved")
            ? "not_approved"
            : !(provider.services || []).map(normalizeServiceKey).filter(Boolean).length
              ? "service_categories_required"
              : (providerLat === null || providerLng === null)
                ? "location_required"
                : null;
      if (accountReason) {
        res.json({ requests: [], eligibility: { eligible: false, reason: accountReason }, limit: 100, hasMore: false });
        return;
      }

      const busyProviderIds = await getBusyProviderIds([userId]);
      if (busyProviderIds.has(userId)) {
        res.json({ requests: [], eligibility: { eligible: false, reason: "busy" }, limit: 100, hasMore: false });
        return;
      }

      // Get all open broadcasts, then apply the same service, account, location
      // and radius policy used by initial push delivery. Keeping list and push
      // eligibility identical prevents jobs from appearing only after a manual
      // refresh or being pushed to providers who cannot open them.
      const rows = await db
        .select()
        .from(broadcastRequestsTable)
        .where(eq(broadcastRequestsTable.status, "open"))
        .orderBy(desc(broadcastRequestsTable.createdAt));

      const settings = await getPlatformSettings();
      const expandAfterMs = settings.broadcastExpandAfterMinutes * 60 * 1000;
      const now = Date.now();
      const filtered = rows.filter((request) => {
        if (new Date(request.expiresAt).getTime() <= now) return false;
        const createdMs = request.createdAt ? new Date(request.createdAt).getTime() : now;
        const platformRadius = now - createdMs >= expandAfterMs
          ? settings.broadcastExpansionRadiusKm
          : settings.broadcastInitialRadiusKm;
        return matchProviderToBroadcast(provider, request, platformRadius, busyProviderIds).eligible;
      });

      // Attach provider's own response and customer ratings using batched queries.
      // The previous per-broadcast query pattern caused N+1 DB pressure when many
      // broadcasts were open. This keeps provider home/broadcast screens fast under load.
      const filteredLimited = filtered.slice(0, 100);
      const requestIds = filteredLimited.map((r) => r.id);
      const customerIds = Array.from(new Set(filteredLimited.map((r) => r.customerId).filter(Boolean)));

      const [responses, customers] = requestIds.length
        ? await Promise.all([
            db
              .select()
              .from(broadcastResponsesTable)
              .where(inArray(broadcastResponsesTable.requestId, requestIds)),
            customerIds.length
              ? db
                  .select({ id: usersTable.id, rating: usersTable.rating })
                  .from(usersTable)
                  .where(inArray(usersTable.id, customerIds))
              : Promise.resolve([]),
          ])
        : [[], []];

      const responsesByRequest = new Map<string, typeof responses>();
      const myResponseByRequest = new Map<string, (typeof responses)[number]>();
      for (const resp of responses) {
        const list = responsesByRequest.get(resp.requestId) ?? [];
        list.push(resp);
        responsesByRequest.set(resp.requestId, list);
        if (resp.providerId === userId) myResponseByRequest.set(resp.requestId, resp);
      }
      const customerRatingById = new Map(customers.map((c) => [c.id, c.rating || 0]));

      const enriched = filteredLimited.map((r) => {
        const distKm =
          providerLat !== null && providerLng !== null && r.latitude != null && r.longitude != null
            ? Math.round(distanceKm(providerLat, providerLng, r.latitude, r.longitude) * 10) / 10
            : null;

        return {
          ...r,
          myResponse: myResponseByRequest.get(r.id) || null,
          customerRating: customerRatingById.get(r.customerId) || 0,
          responseCount: responsesByRequest.get(r.id)?.length || 0,
          distanceKm: distKm,
        };
      });

      res.json({
        requests: enriched,
        eligibility: { eligible: true, maxTravelDistanceKm: providerTravelRadiusKm(provider) },
        limit: 100,
        hasMore: filtered.length > filteredLimited.length,
      });
      return;
    }

    if (role === "admin") {
      const rows = await db
        .select()
        .from(broadcastRequestsTable)
        .orderBy(desc(broadcastRequestsTable.createdAt));

      const limitedRows = rows.slice(0, 200);
      const requestIds = limitedRows.map((r) => r.id);
      const customerIds = Array.from(new Set(limitedRows.map((r) => r.customerId).filter(Boolean)));
      const [responses, customers] = requestIds.length
        ? await Promise.all([
            db.select().from(broadcastResponsesTable).where(inArray(broadcastResponsesTable.requestId, requestIds)),
            customerIds.length
              ? db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).where(inArray(usersTable.id, customerIds))
              : Promise.resolve([]),
          ])
        : [[], []];
      const responsesByRequest = new Map<string, typeof responses>();
      for (const resp of responses) {
        const list = responsesByRequest.get(resp.requestId) ?? [];
        list.push(resp);
        responsesByRequest.set(resp.requestId, list);
      }
      const customerNameById = new Map(customers.map((c) => [c.id, c.name]));
      const withDetails = limitedRows.map((r) => ({
        ...r,
        responses: responsesByRequest.get(r.id) ?? [],
        customerName: customerNameById.get(r.customerId) ?? null,
      }));

      res.json({ requests: withDetails, limit: 200, hasMore: rows.length > limitedRows.length });
      return;
    }

    res.status(403).json({ error: "Unauthorized" });
  } catch (e) {
    logger.error({ err: e }, "broadcast list error");
    res.status(500).json({ error: "Failed to load broadcast requests" });
  }
});

// ─── Get single broadcast request (with responses) ───────────────────────────
router.get("/:id", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const role = req.user!.role;

    const request = await db.query.broadcastRequestsTable.findFirst({
      where: eq(broadcastRequestsTable.id, String(req.params.id)),
    });

    if (!request) {
      res.status(404).json({ error: "Broadcast request not found" });
      return;
    }

    if (role === "customer" && request.customerId !== userId) {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    // A provider may revisit a request they already responded to. Otherwise,
    // enforce the exact same account/service/location/radius rules as listing
    // and push delivery before exposing the customer's address and job detail.
    if (role === "provider") {
      const ownResponse = await db.query.broadcastResponsesTable.findFirst({
        where: and(
          eq(broadcastResponsesTable.requestId, request.id),
          eq(broadcastResponsesTable.providerId, userId),
        ),
      });
      if (!ownResponse) {
        const provider = await db.query.usersTable.findFirst({ where: eq(usersTable.id, userId) });
        if (!provider || request.status !== "open" || isExpiredBroadcast(request)) {
          res.status(403).json({ error: "This job request is not available", code: "BROADCAST_NOT_AVAILABLE" });
          return;
        }
        const settings = await getPlatformSettings();
        const ageMs = Date.now() - (request.createdAt ? new Date(request.createdAt).getTime() : Date.now());
        const radius = ageMs >= settings.broadcastExpandAfterMinutes * 60 * 1000
          ? settings.broadcastExpansionRadiusKm
          : settings.broadcastInitialRadiusKm;
        const busyProviderIds = await getBusyProviderIds([userId]);
        const match = matchProviderToBroadcast(provider, request, radius, busyProviderIds);
        if (!match.eligible) {
          res.status(403).json({
            error: "This job request is outside your current eligibility or service area",
            code: "BROADCAST_NOT_ELIGIBLE",
            reason: match.reason,
          });
          return;
        }
      }
    }

    const responses = await db
      .select()
      .from(broadcastResponsesTable)
      .where(eq(broadcastResponsesTable.requestId, request.id))
      .orderBy(broadcastResponsesTable.createdAt);

    const enrichedResponses = await Promise.all(
      responses.map(async (resp) => {
        const provider = await db.query.usersTable.findFirst({
          where: eq(usersTable.id, resp.providerId),
        });
        return {
          ...resp,
          providerRating: provider?.rating || 0,
          providerTotalJobs: provider?.totalJobs || 0,
          providerIsVerified: provider?.isVerified || false,
          providerProfileImage: provider?.profileImage || null,
          providerProfileColor: provider?.profileColor || "#1A6EE0",
        };
      })
    );

    res.json({ request: { ...request, responses: enrichedResponses } });
  } catch (e) {
    logger.error({ err: e }, "broadcast get error");
    res.status(500).json({ error: "Failed to load broadcast request" });
  }
});

// ─── Provider: Respond to a broadcast (accept price or counter) ──────────────
router.post("/:id/respond", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    if (req.user!.role !== "provider") {
      res.status(403).json({ error: "Only providers can respond to broadcasts" });
      return;
    }

    const request = await db.query.broadcastRequestsTable.findFirst({
      where: eq(broadcastRequestsTable.id, String(req.params.id)),
    });

    if (!request) {
      res.status(404).json({ error: "Broadcast request not found" });
      return;
    }

    if (request.status !== "open") {
      res.status(400).json({ error: "This broadcast request is no longer open" });
      return;
    }

    if (isExpiredBroadcast(request as any)) {
      res.status(400).json({ error: "This broadcast request has expired" });
      return;
    }

    if (request.customerId === userId) {
      res.status(400).json({ error: "You cannot respond to your own request" });
      return;
    }

    const provider = await db.query.usersTable.findFirst({ where: eq(usersTable.id, userId) });
    if (!provider || provider.isBlocked || provider.isDeactivated) {
      res.status(400).json({ error: provider?.blockedReason || "Your account cannot respond right now" });
      return;
    }
    if (provider.verificationStatus !== "approved") {
      res.status(403).json({ error: "Only verified providers can respond to broadcast requests." });
      return;
    }

    const providerBlock = await getProviderActiveWorkBlock(userId);
    if (providerBlock.blocked) {
      res.status(409).json(activeWorkHttpPayload(providerBlock));
      return;
    }

    const settings = await getPlatformSettings();
    const ageMs = Date.now() - (request.createdAt ? new Date(request.createdAt).getTime() : Date.now());
    const radius = ageMs >= settings.broadcastExpandAfterMinutes * 60 * 1000
      ? settings.broadcastExpansionRadiusKm
      : settings.broadcastInitialRadiusKm;
    const match = matchProviderToBroadcast(provider, request, radius, new Set());
    if (!match.eligible) {
      res.status(403).json({
        error: "This job request is outside your current service category or service area",
        code: "BROADCAST_NOT_ELIGIBLE",
        reason: match.reason,
      });
      return;
    }

    // Check for existing response
    const existing = await db.query.broadcastResponsesTable.findFirst({
      where: and(
        eq(broadcastResponsesTable.requestId, request.id),
        eq(broadcastResponsesTable.providerId, userId)
      ),
    });

    if (existing) {
      res.status(409).json({ error: "You have already responded to this request", response: existing });
      return;
    }

    const { providerOffer, message } = req.body;
    const parsedOffer = toNumber(providerOffer);

    const response = {
      id: generateId(),
      requestId: request.id,
      providerId: userId,
      providerName: provider.name,
      providerOffer: parsedOffer,
      message: message || null,
      status: "pending",
    };

    await db.insert(broadcastResponsesTable).values(response);

    const finalPrice = parsedOffer ?? request.customerOffer;
    const priceText = finalPrice ? `Rs. ${finalPrice}` : "open price";

    emitToUser(request.customerId, "broadcast:response" as EventName, {
      requestId: request.id,
      response: {
        ...response,
        providerRating: provider.rating || 0,
        providerTotalJobs: provider.totalJobs || 0,
        providerIsVerified: provider.isVerified || false,
      },
    });

    notifyUser({
      userId: request.customerId,
      title: "Provider responded!",
      body: `${provider.name} responded to your ${request.serviceLabel} request — ${priceText}`,
      type: "broadcast",
      link: `/broadcasts/${request.id}`,
      data: { broadcastRequestId: request.id, role: "customer", type: "broadcast" },
    }).catch(() => undefined);

    res.json({ response });
  } catch (e) {
    logger.error({ err: e }, "broadcast respond error");
    res.status(500).json({ error: "Failed to respond to broadcast request" });
  }
});

// ─── Customer: Select a provider response → creates a booking ────────────────
router.post("/:id/select/:responseId", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    if (req.user!.role !== "customer") {
      res.status(403).json({ error: "Only customers can select a provider" });
      return;
    }

    const request = await db.query.broadcastRequestsTable.findFirst({
      where: eq(broadcastRequestsTable.id, String(req.params.id)),
    });

    if (!request) {
      res.status(404).json({ error: "Broadcast request not found" });
      return;
    }

    if (request.customerId !== userId) {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    if (request.status !== "open") {
      res.status(400).json({ error: "This broadcast request is no longer open" });
      return;
    }

    const chosenResponse = await db.query.broadcastResponsesTable.findFirst({
      where: and(
        eq(broadcastResponsesTable.id, String(req.params.responseId)),
        eq(broadcastResponsesTable.requestId, request.id)
      ),
    });

    if (!chosenResponse) {
      res.status(404).json({ error: "Provider response not found" });
      return;
    }

    if (chosenResponse.status !== "pending") {
      res.status(400).json({ error: "This provider response is no longer available" });
      return;
    }

    const provider = await db.query.usersTable.findFirst({
      where: eq(usersTable.id, chosenResponse.providerId),
    });

    if (!provider || provider.isBlocked || provider.isDeactivated || !provider.isAvailable) {
      res.status(400).json({ error: "This provider is not available right now" });
      return;
    }
    if (provider.verificationStatus !== "approved") {
      res.status(400).json({ error: "This provider has not completed verification and cannot be booked." });
      return;
    }

    const customerBlock = await getCustomerActiveWorkBlock(userId);
    if (customerBlock.blocked && customerBlock.entityId !== request.id) {
      res.status(409).json(activeWorkHttpPayload(customerBlock));
      return;
    }

    const providerBlock = await getProviderActiveWorkBlock(provider.id);
    if (providerBlock.blocked) {
      res.status(409).json(activeWorkHttpPayload(providerBlock));
      return;
    }

    const customer = await db.query.usersTable.findFirst({ where: eq(usersTable.id, userId) });
    if (!customer) {
      res.status(400).json({ error: "Customer not found" });
      return;
    }

    const agreedPrice = chosenResponse.providerOffer ?? request.customerOffer;

    // Create the booking
    const booking = {
      id: generateId(),
      publicId: generatePublicId(),
      customerId: userId,
      customerName: customer.name,
      customerPhone: customer.phone,
      providerId: provider.id,
      providerName: provider.name,
      providerPhone: provider.phone,
      service: request.serviceLabel,
      serviceIcon: request.serviceIcon || "tool",
      description: request.description || null,
      attachment: null,
      videoUrl: request.videoUrl || null,
      address: request.address,
      scheduledDate: request.scheduledDate,
      scheduledTime: request.scheduledTime,
      status: "pending",
      price: agreedPrice,
      commissionAmount: 0,
      providerAmount: agreedPrice,
      commissionRate: 0,
      visitCharge: request.travellingCharge ?? 0,
      // Snapshot the rate accepted for this booking; provider profile edits must not change it.
      ratePerHour: agreedPrice,
      pickedLat: request.latitude,
      pickedLng: request.longitude,
      customerLat: request.latitude,
      customerLng: request.longitude,
      providerLat: null,
      providerLng: null,
      providerAccuracy: null,
      providerUpdatedAt: null,
      providerArrivedAt: null,
    };

    // ── Atomic transaction: insert booking + close broadcast + mark responses ──
    // All four writes succeed together or all roll back. Without a transaction,
    // two concurrent "select" calls from the same customer (double-tap) could
    // both read status="open", both insert a booking, and both mark the broadcast
    // as accepted — creating duplicate bookings. The DB-level unique partial index
    // on bookings(provider_id) WHERE status IN ('pending','accepted','in_progress')
    // is the final safety net, but committing the status flip atomically prevents
    // the dirty-read window that would trigger it.
    await db.transaction(async (tx) => {
      // Re-read request status inside transaction to catch concurrent selections.
      const freshRequest = await tx.query.broadcastRequestsTable.findFirst({
        where: eq(broadcastRequestsTable.id, request.id),
      });
      if (!freshRequest || freshRequest.status !== "open") {
        throw new Error("ALREADY_ACCEPTED");
      }
      // Re-read response status inside transaction.
      const freshResponse = await tx.query.broadcastResponsesTable.findFirst({
        where: eq(broadcastResponsesTable.id, chosenResponse.id),
      });
      if (!freshResponse || freshResponse.status !== "pending") {
        throw new Error("RESPONSE_UNAVAILABLE");
      }

      await tx.insert(bookingsTable).values(booking);

      await tx
        .update(broadcastRequestsTable)
        .set({
          status: "accepted",
          acceptedResponseId: chosenResponse.id,
          bookingId: booking.id,
          updatedAt: new Date(),
        })
        .where(eq(broadcastRequestsTable.id, request.id));

      await tx
        .update(broadcastResponsesTable)
        .set({ status: "accepted_by_customer", updatedAt: new Date() })
        .where(eq(broadcastResponsesTable.id, chosenResponse.id));

      await tx
        .update(broadcastResponsesTable)
        .set({ status: "rejected_by_customer", updatedAt: new Date() })
        .where(
          and(
            eq(broadcastResponsesTable.requestId, request.id),
            ne(broadcastResponsesTable.id, chosenResponse.id),
            eq(broadcastResponsesTable.status, "pending")
          )
        );
    });

    // Notify chosen provider — send both booking:new (for BookingContext) AND
    // broadcast:selected (so BroadcastContext can play a ringtone + popup).
    emitToUser(provider.id, "booking:new" as EventName, { booking });
    emitToUser(provider.id, "broadcast:selected" as EventName, {
      booking,
      requestId: request.id,
      serviceLabel: request.serviceLabel,
      customerName: customer.name,
    });
    notifyUser({
      userId: provider.id,
      title: "🎉 You got the job!",
      body: `${customer.name} selected you for ${request.serviceLabel}`,
      type: "booking",
      link: `/jobs/${booking.id}`,
      data: { bookingId: booking.id },
    }).catch(() => undefined);

    // Notify all providers whose responses were just rejected
    const rejectedResponses = await db
      .select({ providerId: broadcastResponsesTable.providerId })
      .from(broadcastResponsesTable)
      .where(
        and(
          eq(broadcastResponsesTable.requestId, request.id),
          eq(broadcastResponsesTable.status, "rejected_by_customer")
        )
      );

    for (const r of rejectedResponses) {
      if (r.providerId === provider.id) continue; // skip chosen provider
      emitToUser(r.providerId, "broadcast:rejected" as EventName, {
        requestId: request.id,
        serviceLabel: request.serviceLabel,
        customerName: customer.name,
      });
      notifyUser({
        userId: r.providerId,
        title: "Request filled",
        body: `${customer.name}'s ${request.serviceLabel} request was filled by another provider`,
        type: "broadcast",
        link: `/broadcast`,
        data: { broadcastRequestId: request.id, role: "provider", type: "broadcast" },
      }).catch(() => undefined);
    }

    // Notify customer
    emitToUser(userId, "booking:updated" as EventName, { booking });

    emitToRole("admin", "admin:event" as EventName, { type: "booking:new", booking });

    res.json({ booking, request: { ...request, status: "accepted", bookingId: booking.id } });
  } catch (e: any) {
    if (e?.message === "ALREADY_ACCEPTED") {
      res.status(409).json({ error: "This broadcast request was already filled by another selection. Please refresh." });
      return;
    }
    if (e?.message === "RESPONSE_UNAVAILABLE") {
      res.status(409).json({ error: "This provider's offer is no longer available. Please choose another." });
      return;
    }
    logger.error({ err: e }, "broadcast select error");
    res.status(500).json({ error: "Failed to select provider and create booking" });
  }
});

// ─── Customer: Cancel broadcast request ──────────────────────────────────────
router.post("/:id/cancel", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const request = await db.query.broadcastRequestsTable.findFirst({
      where: eq(broadcastRequestsTable.id, String(req.params.id)),
    });

    if (!request) {
      res.status(404).json({ error: "Broadcast request not found" });
      return;
    }

    if (request.customerId !== userId && req.user!.role !== "admin") {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    if (request.status !== "open") {
      res.status(400).json({ error: "Only open requests can be cancelled" });
      return;
    }

    await db
      .update(broadcastRequestsTable)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(eq(broadcastRequestsTable.id, request.id));

    res.json({ success: true });
  } catch (e) {
    logger.error({ err: e }, "broadcast cancel error");
    res.status(500).json({ error: "Failed to cancel broadcast request" });
  }
});

// ─── Provider: Withdraw their response ───────────────────────────────────────
router.post("/:id/respond/withdraw", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    if (req.user!.role !== "provider") {
      res.status(403).json({ error: "Only providers can withdraw responses" });
      return;
    }

    const existing = await db.query.broadcastResponsesTable.findFirst({
      where: and(
        eq(broadcastResponsesTable.requestId, String(req.params.id)),
        eq(broadcastResponsesTable.providerId, userId)
      ),
    });

    if (!existing) {
      res.status(404).json({ error: "Response not found" });
      return;
    }

    if (existing.status !== "pending") {
      res.status(400).json({ error: "Can only withdraw pending responses" });
      return;
    }

    await db
      .update(broadcastResponsesTable)
      .set({ status: "withdrawn", updatedAt: new Date() })
      .where(eq(broadcastResponsesTable.id, existing.id));

    res.json({ success: true });
  } catch (e) {
    logger.error({ err: e }, "broadcast withdraw error");
    res.status(500).json({ error: "Failed to withdraw response" });
  }
});

export default router;
