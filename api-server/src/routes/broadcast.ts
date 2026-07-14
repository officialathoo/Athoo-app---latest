import crypto from "crypto";
import { logger } from "../lib/logger";
import { Router, type Response } from "express";
import { db } from "@workspace/db";
import {
  broadcastRequestsTable,
  broadcastResponsesTable,
  bookingsTable,
  usersTable,
} from "@workspace/db/schema";
import { and, eq, ne, desc, sql, or, inArray } from "drizzle-orm";
import { requireAuth, type AuthRequest } from "../middlewares/auth";
import { getPlatformSettings } from "../lib/admin";
import { emitToUser, emitToRole, type EventName } from "../lib/eventBus";
import { notifyUser } from "../lib/notifications";
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
  const rand = Math.floor(10000 + Math.random() * 90000);
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
      service: String(service).trim(),
      serviceLabel: String(serviceLabel).trim(),
      serviceIcon: serviceIcon || "tool",
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

    // Provider matching and notification delivery are best-effort. Once the
    // broadcast row is committed, downstream push/socket failures must never
    // turn a successful creation into an HTTP 500 or encourage duplicate retries.
    try {
      // Fetch ALL providers as candidates. The matching criteria (approved +
      // not-blocked + service-match + within-radius) are still enforced below —
      // we only widen the initial fetch so every rejection can be logged with a
      // precise reason for diagnostics.
      const candidateProviders = await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.role, "provider"));

      const serviceKey = String(service).toLowerCase();
      const MAX_RADIUS_KM = settings.broadcastInitialRadiusKm;

      // Returns true when the provider's service list matches the broadcast service.
      function providerMatchesService(providerServices: string[] | null): boolean {
        const svcs = providerServices || [];
        if (svcs.length === 0) return true; // unspecialised provider sees everything
        return svcs.some((s) => {
          const ps = (s || "").toLowerCase();
          return ps === serviceKey || ps.includes(serviceKey) || serviceKey.includes(ps);
        });
      }

      const busyProviderIds = await getBusyProviderIds(candidateProviders.map((p) => p.id));

      const matchedProviders: typeof candidateProviders = [];
      const skipped: { id: string; reason: string }[] = [];

      for (const p of candidateProviders) {
        if (p.isBlocked) {
          skipped.push({ id: p.id, reason: "blocked" });
          continue;
        }
        if (p.isDeactivated) {
          skipped.push({ id: p.id, reason: "deactivated" });
          continue;
        }
        if (p.verificationStatus !== "approved") {
          skipped.push({ id: p.id, reason: "not approved" });
          continue;
        }
        if (busyProviderIds.has(p.id)) {
          skipped.push({ id: p.id, reason: "provider busy on active job or negotiation" });
          continue;
        }
        if (!providerMatchesService(p.services)) {
          skipped.push({ id: p.id, reason: "service mismatch" });
          continue;
        }

        const pLat = parseFloat(p.latitude || "");
        const pLng = parseFloat(p.longitude || "");
        if (isNaN(pLat) || isNaN(pLng)) {
          skipped.push({ id: p.id, reason: "no location" });
          continue;
        }
        const dist = distanceKm(parsedLat, parsedLng, pLat, pLng);
        if (dist > MAX_RADIUS_KM) {
          skipped.push({
            id: p.id,
            reason: `out of radius (${Math.round(dist * 10) / 10} km > ${MAX_RADIUS_KM} km)`,
          });
          continue;
        }
        matchedProviders.push(p);
      }

      const priceText = parsedOffer ? `Rs. ${parsedOffer}` : "open price";

      let socketEmitCount = 0;
      let pushTokenCount = 0;
      let dbNotificationCount = 0;
      let pushSuccessCount = 0;
      let pushFailureCount = 0;

      // Every MATCHED provider gets a DB notification + push attempt REGARDLESS of
      // availability so the broadcast reliably surfaces in their notification list
      // and broadcast list even if they were offline. Live socket emit is sent to
      // every matched provider with an open websocket; provider availability can be
      // stale and must not block urgent broadcast delivery.
      await Promise.all(
        matchedProviders.map(async (provider) => {
          const sent = emitToUser(provider.id, "broadcast:new" as EventName, { request });
          if (sent > 0) socketEmitCount += 1;
          if (provider.expoPushToken) pushTokenCount += 1;

          try {
            const result = await notifyUser({
              userId: provider.id,
              title: "New Job Request",
              body: `${customer.name} needs ${serviceLabel} — ${priceText}`,
              type: "broadcast",
              link: `/broadcast/${request.id}`,
              data: { broadcastRequestId: request.id, role: "provider", type: "broadcast" },
            });

            if (result.created) dbNotificationCount += 1;
            if (result.hasToken) {
              if (result.pushSent) pushSuccessCount += 1;
              else pushFailureCount += 1;
            }
          } catch (notifyError) {
            pushFailureCount += 1;
            req.log?.warn?.({ err: notifyError, providerId: provider.id, broadcastRequestId: request.id }, "broadcast provider notification failed");
          }
        })
      );

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

    res.json({ request });
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

      // Get all open, non-expired broadcasts
      const rows = await db
        .select()
        .from(broadcastRequestsTable)
        .where(eq(broadcastRequestsTable.status, "open"))
        .orderBy(desc(broadcastRequestsTable.createdAt));

      const providerServices = (provider.services || []).map((s) => s.toLowerCase());

      const pLat = parseFloat(provider.latitude || "");
      const pLng = parseFloat(provider.longitude || "");
      const settings = await getPlatformSettings();
      const INITIAL_RADIUS_KM = settings.broadcastInitialRadiusKm;
      const EXPANDED_RADIUS_KM = settings.broadcastExpansionRadiusKm;
      const EXPAND_AFTER_MS = settings.broadcastExpandAfterMinutes * 60 * 1000;
      const now = Date.now();

      const filtered = rows.filter((r) => {
        if (new Date(r.expiresAt).getTime() <= now) return false;

        // Service matching: provider with empty services list sees everything.
        // Otherwise at least one of their services must overlap with the broadcast service.
        if (providerServices.length > 0) {
          const rSvc = r.service.toLowerCase();
          const match = providerServices.some(
            (ps) => ps === rSvc || ps.includes(rSvc) || rSvc.includes(ps)
          );
          if (!match && !rSvc.includes("general")) return false;
        }


        if (!isNaN(pLat) && !isNaN(pLng) && r.latitude != null && r.longitude != null) {
          const createdMs = r.createdAt ? new Date(r.createdAt).getTime() : now;
          const broadcastAgeMs = now - createdMs;
          const platformRadius = broadcastAgeMs >= EXPAND_AFTER_MS ? EXPANDED_RADIUS_KM : INITIAL_RADIUS_KM;
          const providerRadius = Math.max(1, Math.min(100, Number(provider.maxTravelDistanceKm || 15)));
          const effectiveRadius = Math.min(platformRadius, providerRadius);
          return distanceKm(pLat, pLng, r.latitude, r.longitude) <= effectiveRadius;
        }

        return true;
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
          !isNaN(pLat) && !isNaN(pLng) && r.latitude != null && r.longitude != null
            ? Math.round(distanceKm(pLat, pLng, r.latitude, r.longitude) * 10) / 10
            : null;

        return {
          ...r,
          myResponse: myResponseByRequest.get(r.id) || null,
          customerRating: customerRatingById.get(r.customerId) || 0,
          responseCount: responsesByRequest.get(r.id)?.length || 0,
          distanceKm: distKm,
        };
      });

      res.json({ requests: enriched, limit: 100, hasMore: filtered.length > filteredLimited.length });
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

    // Providers may only view broadcasts they are eligible for (service
    // match), same as the list endpoint — otherwise any provider could pull
    // full customer address/contact detail for a service they don't offer
    // just by guessing/enumerating a broadcast id.
    if (role === "provider") {
      const provider = await db.query.usersTable.findFirst({ where: eq(usersTable.id, userId) });
      const providerServices = (provider?.services || []).map((s) => s.toLowerCase());
      const rSvc = request.service.toLowerCase();
      const serviceMatches =
        providerServices.length === 0 ||
        rSvc.includes("general") ||
        providerServices.some((ps) => ps === rSvc || ps.includes(rSvc) || rSvc.includes(ps));

      if (!serviceMatches) {
        const ownResponse = await db.query.broadcastResponsesTable.findFirst({
          where: and(
            eq(broadcastResponsesTable.requestId, request.id),
            eq(broadcastResponsesTable.providerId, userId),
          ),
        });
        if (!ownResponse) {
          res.status(403).json({ error: "Access denied" });
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
      link: `/broadcast/${request.id}`,
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
      ratePerHour: provider.ratePerHour || null,
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
