import crypto from "crypto";
import { logger } from "../lib/logger";
import { Router, type Response } from "express";
import { db } from "@workspace/db";
import {
  broadcastRequestsTable,
  broadcastResponsesTable,
  broadcastOfferEventsTable,
  bookingsTable,
  serviceCategoriesTable,
  negotiationsTable,
  usersTable,
} from "@workspace/db/schema";
import { and, eq, ne, desc, sql, or, inArray } from "drizzle-orm";
import { requireAuth, type AuthRequest } from "../middlewares/auth";
import { getPlatformSettings } from "../lib/admin";
import { emitToUser, emitToRole, type EventName } from "../lib/eventBus";
import { notifyUser } from "../lib/notifications";
import { enqueueJob, registerJobHandler } from "../lib/queue";
import { normalizeStoredObjectPath } from "../lib/storageSecurity";
import { isCleanOwnedUploadObjectPath } from "../lib/verifiedUploads";
import { assertLocationInActiveServiceArea, LocationIntegrityError, parseCanonicalLocation } from "../lib/locationIntegrity";
import {
  ACTIVE_BOOKING_STATUSES,
  ACTIVE_NEGOTIATION_STATUSES,
  activeWorkHttpPayload,
  getBusyProviderIds,
  getCustomerActiveWorkBlock,
  getProviderActiveWorkBlock,
} from "../lib/businessRules";

const router = Router();

type BroadcastTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

class BroadcastFlowError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

type AcceptedBroadcastOutcome = {
  request: typeof broadcastRequestsTable.$inferSelect;
  response: typeof broadcastResponsesTable.$inferSelect;
  booking: typeof bookingsTable.$inferSelect;
  losingProviderIds: string[];
  duplicate: boolean;
};

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

function boundedWholeAmount(value: unknown, options: { min: number; max: number }): number | null {
  const raw = typeof value === "number" ? value : typeof value === "string" && /^\d{1,9}$/.test(value.trim()) ? Number(value.trim()) : NaN;
  if (!Number.isSafeInteger(raw) || raw < options.min || raw > options.max) return null;
  return raw;
}

function cleanResponseRequestId(value: unknown, requestId: string, providerId: string): string {
  const supplied = String(value || "").trim();
  if (/^[A-Za-z0-9._:-]{8,120}$/.test(supplied)) return supplied;
  // Backward-compatible deterministic key for clients released before Phase
  // 18B. Updated clients always provide a fresh key for each revision.
  return `legacy:${requestId}:${providerId}`.slice(0, 120);
}

function responsePayloadMatches(
  response: typeof broadcastResponsesTable.$inferSelect,
  input: {
    responseType: "accept" | "counter";
    providerOffer: number | null;
    providerTravellingCharge: number;
    message: string | null;
    clientRequestId: string;
  },
): boolean {
  return response.responseType === input.responseType
    && (response.providerOffer ?? null) === input.providerOffer
    && Number(response.providerTravellingCharge ?? 0) === input.providerTravellingCharge
    && (response.message || null) === input.message
    && response.clientRequestId === input.clientRequestId;
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

function broadcastResponseProviderBatchSize(): number {
  const configured = Number(process.env.BROADCAST_RESPONSE_PROVIDER_BATCH_SIZE || 500);
  if (!Number.isFinite(configured)) return 500;
  return Math.max(1, Math.min(1000, Math.floor(configured)));
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

/** Eligibility flags that are cheap to evaluate directly in SQL. */
const BROADCAST_CANDIDATE_FLAG_FILTERS = [
  eq(usersTable.role, "provider"),
  eq(usersTable.isBlocked, false),
  eq(usersTable.isDeactivated, false),
  eq(usersTable.isAvailable, true),
  eq(usersTable.isVerified, true),
  eq(usersTable.verificationStatus, "approved"),
];

/**
 * Coarse lat/lng bounding box for a radius. Providers outside the box can never
 * satisfy the precise haversine check because the effective radius is always
 * <= the requested radius, so excluding them in SQL is provably safe.
 */
function broadcastGeoBox(
  latitude: unknown,
  longitude: unknown,
  radiusKm: number,
): { minLat: number; maxLat: number; minLng: number; maxLng: number } | null {
  const lat = toCoord(latitude);
  const lng = toCoord(longitude);
  if (lat === null || lng === null) return null;
  const safeRadius = Math.max(1, Math.min(200, radiusKm));
  const latDelta = safeRadius / 111.32;
  const cosLat = Math.max(0.2, Math.cos((lat * Math.PI) / 180));
  const lngDelta = safeRadius / (111.32 * cosLat);
  return {
    minLat: lat - latDelta,
    maxLat: lat + latDelta,
    minLng: lng - lngDelta,
    maxLng: lng + lngDelta,
  };
}

/**
 * Scale-safe candidate fetch for broadcast delivery. Instead of loading every
 * provider row into memory, eligibility flags and a geographic bounding box
 * are applied in SQL and only plausible candidates reach Node, where the exact
 * haversine distance, service and busy checks still run.
 */
async function fetchBroadcastCandidates(
  request: Pick<BroadcastRecord, "latitude" | "longitude">,
  radiusKm: number,
): Promise<{ totalProviders: number; candidates: ProviderRecord[]; prefilteredCount: number }> {
  const box = broadcastGeoBox(request.latitude, request.longitude, radiusKm);

  const [totalRows, flagRows] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(usersTable)
      .where(eq(usersTable.role, "provider")),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(usersTable)
      .where(and(...BROADCAST_CANDIDATE_FLAG_FILTERS)),
  ]);

  const geoFilters = [sql`${usersTable.latitude} is not null`, sql`${usersTable.longitude} is not null`];
  if (box) {
    geoFilters.push(
      sql`(${usersTable.latitude})::double precision between ${box.minLat} and ${box.maxLat}`,
      sql`(${usersTable.longitude})::double precision between ${box.minLng} and ${box.maxLng}`,
    );
  }

  const candidates = await db
    .select()
    .from(usersTable)
    .where(and(...BROADCAST_CANDIDATE_FLAG_FILTERS, ...geoFilters));

  return {
    totalProviders: totalRows[0]?.count ?? 0,
    candidates,
    prefilteredCount: Math.max(0, (flagRows[0]?.count ?? 0) - candidates.length),
  };
}

async function lockActiveWorkSubjects(
  tx: BroadcastTransaction,
  customerId: string,
  providerId: string,
): Promise<void> {
  for (const userId of [customerId, providerId].sort()) {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`active-work:${userId}`}, 0))`);
  }
}

async function assertBroadcastPartiesAvailable(
  tx: BroadcastTransaction,
  customerId: string,
  providerId: string,
): Promise<{
  customer: typeof usersTable.$inferSelect;
  provider: typeof usersTable.$inferSelect;
}> {
  const [customer, provider] = await Promise.all([
    tx.query.usersTable.findFirst({ where: eq(usersTable.id, customerId) }),
    tx.query.usersTable.findFirst({ where: eq(usersTable.id, providerId) }),
  ]);
  if (!customer || customer.role !== "customer") {
    throw new BroadcastFlowError(404, "CUSTOMER_NOT_FOUND", "Customer account is not available");
  }
  if (!provider || provider.role !== "provider") {
    throw new BroadcastFlowError(404, "PROVIDER_NOT_FOUND", "Provider account is not available");
  }
  if (provider.isBlocked || provider.isDeactivated || !provider.isAvailable) {
    throw new BroadcastFlowError(409, "PROVIDER_NOT_AVAILABLE", provider.blockedReason || "This provider is not available right now");
  }
  if (!provider.isVerified || provider.verificationStatus !== "approved") {
    throw new BroadcastFlowError(403, "PROVIDER_NOT_VERIFIED", "This provider is not verified for new jobs");
  }

  const [customerBooking, providerBooking, customerNegotiation, providerNegotiation] = await Promise.all([
    tx.select({ id: bookingsTable.id }).from(bookingsTable).where(and(
      eq(bookingsTable.customerId, customerId),
      inArray(bookingsTable.status, [...ACTIVE_BOOKING_STATUSES]),
    )).limit(1),
    tx.select({ id: bookingsTable.id }).from(bookingsTable).where(and(
      eq(bookingsTable.providerId, providerId),
      inArray(bookingsTable.status, [...ACTIVE_BOOKING_STATUSES]),
    )).limit(1),
    tx.select({ id: negotiationsTable.id }).from(negotiationsTable).where(and(
      eq(negotiationsTable.customerId, customerId),
      inArray(negotiationsTable.status, [...ACTIVE_NEGOTIATION_STATUSES]),
    )).limit(1),
    tx.select({ id: negotiationsTable.id }).from(negotiationsTable).where(and(
      eq(negotiationsTable.providerId, providerId),
      inArray(negotiationsTable.status, [...ACTIVE_NEGOTIATION_STATUSES]),
    )).limit(1),
  ]);

  if (customerBooking[0]) throw new BroadcastFlowError(409, "ACTIVE_BOOKING", "You already have an active booking");
  if (providerBooking[0]) throw new BroadcastFlowError(409, "PROVIDER_BUSY", "This provider accepted another job first");
  if (customerNegotiation[0]) throw new BroadcastFlowError(409, "ACTIVE_NEGOTIATION", "You already have an active negotiation");
  if (providerNegotiation[0]) throw new BroadcastFlowError(409, "PROVIDER_BUSY", "This provider is completing another offer");
  return { customer, provider };
}

async function finalizeAcceptedBroadcast(
  tx: BroadcastTransaction,
  request: typeof broadcastRequestsTable.$inferSelect,
  response: typeof broadcastResponsesTable.$inferSelect,
  acceptedBy: "customer" | "provider",
): Promise<AcceptedBroadcastOutcome> {
  await lockActiveWorkSubjects(tx, request.customerId, response.providerId);
  const { customer, provider } = await assertBroadcastPartiesAvailable(tx, request.customerId, response.providerId);

  const agreedPrice = response.responseType === "accept"
    ? request.customerOffer
    : response.providerOffer;
  if (!agreedPrice || agreedPrice <= 0) {
    throw new BroadcastFlowError(400, "INVALID_AGREED_PRICE", "A valid agreed hourly price is required");
  }
  const visitCharge = Math.max(0, Number(
    response.responseType === "accept"
      ? request.travellingCharge ?? 0
      : response.providerTravellingCharge ?? request.travellingCharge ?? 0,
  ));

  const [booking] = await tx.insert(bookingsTable).values({
    id: generateId(),
    publicId: generatePublicId(),
    clientRequestId: `broadcast:${request.id}`,
    customerId: request.customerId,
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
    locationCity: request.locationCity,
    locationArea: request.locationArea,
    locationProvince: request.locationProvince,
    locationCountryCode: request.locationCountryCode,
    locationSource: request.locationSource,
    locationAccuracy: request.locationAccuracy,
    locationConfirmedAt: request.locationConfirmedAt,
    locationVerifiedAt: request.locationVerifiedAt,
    scheduledDate: request.scheduledDate,
    scheduledTime: request.scheduledTime,
    status: "accepted",
    price: agreedPrice,
    commissionAmount: 0,
    providerAmount: agreedPrice,
    commissionRate: 0,
    visitCharge,
    ratePerHour: agreedPrice,
    categorySlug: request.service,
    pickedLat: request.latitude,
    pickedLng: request.longitude,
    customerLat: request.latitude,
    customerLng: request.longitude,
    providerLat: null,
    providerLng: null,
    providerAccuracy: null,
    providerUpdatedAt: null,
    providerArrivedAt: null,
  }).returning();
  if (!booking) throw new BroadcastFlowError(409, "BOOKING_CREATE_CONFLICT", "This job could not be confirmed");

  const [updatedRequest] = await tx.update(broadcastRequestsTable).set({
    status: "accepted",
    acceptedResponseId: response.id,
    bookingId: booking.id,
    updatedAt: new Date(),
  }).where(and(
    eq(broadcastRequestsTable.id, request.id),
    eq(broadcastRequestsTable.status, "open"),
  )).returning();
  if (!updatedRequest) throw new BroadcastFlowError(409, "BROADCAST_FILLED", "This job is no longer available");

  const [acceptedResponse] = await tx.update(broadcastResponsesTable).set({
    status: "accepted_by_customer",
    rejectedAt: null,
    updatedAt: new Date(),
  }).where(and(
    eq(broadcastResponsesTable.id, response.id),
    eq(broadcastResponsesTable.requestId, request.id),
    eq(broadcastResponsesTable.status, "pending"),
  )).returning();
  if (!acceptedResponse) throw new BroadcastFlowError(409, "RESPONSE_UNAVAILABLE", "This provider offer is no longer available");

  const losingResponses = await tx.update(broadcastResponsesTable).set({
    status: "not_selected",
    updatedAt: new Date(),
  }).where(and(
    eq(broadcastResponsesTable.requestId, request.id),
    ne(broadcastResponsesTable.id, response.id),
    eq(broadcastResponsesTable.status, "pending"),
  )).returning({ providerId: broadcastResponsesTable.providerId });

  await tx.update(usersTable).set({ isAvailable: false, updatedAt: new Date() })
    .where(eq(usersTable.id, provider.id));
  await tx.insert(broadcastOfferEventsTable).values({
    id: generateId(),
    requestId: request.id,
    responseId: response.id,
    bookingId: booking.id,
    actorId: acceptedBy === "provider" ? provider.id : customer.id,
    actorRole: acceptedBy,
    eventType: "booking_created",
    revision: response.revision,
    amount: agreedPrice,
    travellingCharge: visitCharge,
    metadata: { acceptedBy, losingResponseCount: losingResponses.length },
  });

  return {
    request: updatedRequest,
    response: acceptedResponse,
    booking,
    losingProviderIds: [...new Set(losingResponses.map((item) => item.providerId))],
    duplicate: false,
  };
}

async function deliverAcceptedBroadcast(
  outcome: AcceptedBroadcastOutcome,
  acceptedBy: "customer" | "provider",
): Promise<void> {
  if (outcome.duplicate) return;
  const { booking, request } = outcome;
  emitToUser(booking.customerId, "booking:updated" as EventName, { booking });
  emitToUser(booking.customerId, "broadcast:accepted" as EventName, { requestId: request.id, bookingId: booking.id });
  emitToUser(booking.providerId, "booking:new" as EventName, { booking });
  emitToUser(booking.providerId, "broadcast:selected" as EventName, {
    booking,
    requestId: request.id,
    serviceLabel: request.serviceLabel,
    customerName: booking.customerName,
  });
  emitToUser(booking.providerId, "provider:availability" as EventName, { isAvailable: false, reason: "accepted" });
  // Every connected provider receives only the opaque request id and refreshes
  // their feed. Offline devices reconcile on their next foreground GET.
  emitToRole("provider", "broadcast:accepted" as EventName, { requestId: request.id });
  emitToRole("admin", "admin:event" as EventName, { type: "booking:new", booking });

  notifyUser({
    userId: booking.customerId,
    title: acceptedBy === "provider" ? "Provider accepted your job" : "Booking confirmed",
    body: `${booking.providerName} confirmed ${booking.service} at Rs. ${Number(booking.price || 0).toLocaleString()} per hour.`,
    type: "booking",
    link: `/bookings/${booking.id}`,
    data: { bookingId: booking.id },
    email: { category: "booking" },
  }).catch(() => undefined);
  notifyUser({
    userId: booking.providerId,
    title: acceptedBy === "provider" ? "Job accepted" : "🎉 You got the job!",
    body: `${booking.service} with ${booking.customerName} is confirmed.`,
    type: "booking",
    link: `/jobs/${booking.id}`,
    data: { bookingId: booking.id },
    email: { category: "booking" },
  }).catch(() => undefined);

  await forEachWithConcurrency(outcome.losingProviderIds, broadcastDeliveryConcurrency(), async (providerId) => {
    emitToUser(providerId, "broadcast:rejected" as EventName, {
      requestId: request.id,
      serviceLabel: request.serviceLabel,
      customerName: booking.customerName,
    });
    await notifyUser({
      userId: providerId,
      title: "Request filled",
      body: `${booking.customerName}'s ${request.serviceLabel} request was filled by another provider.`,
      type: "broadcast",
      link: "/broadcast",
      data: { broadcastRequestId: request.id, role: "provider", type: "broadcast" },
    });
  });
}

async function deliverExpandedBroadcast(requestId: string): Promise<void> {
  const request = await db.query.broadcastRequestsTable.findFirst({
    where: eq(broadcastRequestsTable.id, requestId),
  });
  if (!request || request.status !== "open" || isExpiredBroadcast(request)) return;

  const settings = await getPlatformSettings();
  if (settings.broadcastExpansionRadiusKm <= settings.broadcastInitialRadiusKm) return;

  // Only providers plausibly inside the expansion radius are loaded; the exact
  // initial-vs-expanded match logic below is unchanged.
  const { candidates } = await fetchBroadcastCandidates(request, settings.broadcastExpansionRadiusKm);

  const busyProviderIds = await getBusyProviderIds(candidates.map((provider) => provider.id));
  const expandedOnly = candidates.filter((provider) => {
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

    const normalizedVideoUrl = normalizeStoredObjectPath(videoUrl) || null;
    if (videoUrl && (!normalizedVideoUrl || !(await isCleanOwnedUploadObjectPath(normalizedVideoUrl, userId, ["shared"])))) {
      res.status(400).json({ error: "Broadcast video must pass Athoo security scanning before use" });
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

    const canonicalLocation = parseCanonicalLocation({ ...req.body, address, latitude, longitude });
    await assertLocationInActiveServiceArea(canonicalLocation);
    const parsedLat = canonicalLocation.latitude;
    const parsedLng = canonicalLocation.longitude;
    const parsedOffer = toNumber(customerOffer);
    const parsedTravellingCharge = Math.max(0, toNumber(travellingCharge) ?? 0);

    const request = {
      id: generateId(),
      customerId: userId,
      clientRequestId: String(clientRequestId),
      customerName: customer.name,
      service: category?.slug || rawService,
      serviceLabel: category?.name || String(serviceLabel).trim(),
      serviceIcon: category?.icon || serviceIcon || "tool",
      description: description || null,
      videoUrl: normalizedVideoUrl,
      address: canonicalLocation.formattedAddress,
      latitude: parsedLat,
      longitude: parsedLng,
      locationCity: canonicalLocation.city,
      locationArea: canonicalLocation.area,
      locationProvince: canonicalLocation.province,
      locationCountryCode: canonicalLocation.countryCode,
      locationSource: canonicalLocation.source,
      locationAccuracy: canonicalLocation.accuracy,
      locationConfirmedAt: canonicalLocation.confirmedAt,
      locationVerifiedAt: new Date(),
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
    // turn a successful creation into a HTTP 500 or encourage duplicate retries.
    try {
      // SQL pre-filters eligibility flags and a bounding box around the request
      // so candidate volume stays proportional to nearby providers, not to the
      // whole provider table. The summary still explains every exclusion.
      const { totalProviders, candidates, prefilteredCount } = await fetchBroadcastCandidates(
        request,
        settings.broadcastInitialRadiusKm,
      );
      deliverySummary.candidateCount = totalProviders;
      if (prefilteredCount > 0) {
        deliverySummary.skippedByReason.prefiltered_unavailable_or_out_of_radius = prefilteredCount;
      }
      const candidateProviders: ProviderRecord[] = candidates;

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
    if (e instanceof LocationIntegrityError) {
      res.status(e.status).json({ error: e.message, code: e.code });
      return;
    }
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
          responseRevisionLimit: Math.max(1, Math.min(10, Number(settings.maxNegotiationRounds || 3))),
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

    // Load provider summaries in bounded batch queries. The previous
    // per-response lookup created an N+1 query burst and unbounded concurrent
    // database work when a broadcast accumulated many responses.
    const providerIds = [...new Set(responses.map((response) => response.providerId))];
    const providers: Array<{
      id: string;
      rating: number | null;
      totalJobs: number | null;
      isVerified: boolean | null;
      profileImage: string | null;
      profileColor: string | null;
    }> = [];
    const providerBatchSize = broadcastResponseProviderBatchSize();
    for (let start = 0; start < providerIds.length; start += providerBatchSize) {
      const batchIds = providerIds.slice(start, start + providerBatchSize);
      const batch = await db
          .select({
            id: usersTable.id,
            rating: usersTable.rating,
            totalJobs: usersTable.totalJobs,
            isVerified: usersTable.isVerified,
            profileImage: usersTable.profileImage,
            profileColor: usersTable.profileColor,
          })
          .from(usersTable)
          .where(inArray(usersTable.id, batchIds));
      providers.push(...batch);
    }
    const providerById = new Map(providers.map((provider) => [provider.id, provider]));
    const enrichedResponses = responses.map((response) => {
      const provider = providerById.get(response.providerId);
      return {
        ...response,
        providerRating: provider?.rating || 0,
        providerTotalJobs: provider?.totalJobs || 0,
        providerIsVerified: provider?.isVerified || false,
        providerProfileImage: provider?.profileImage || null,
        providerProfileColor: provider?.profileColor || "#1A6EE0",
      };
    });

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

    const requestId = String(req.params.id);
    const request = await db.query.broadcastRequestsTable.findFirst({ where: eq(broadcastRequestsTable.id, requestId) });

    if (!request) {
      res.status(404).json({ error: "Broadcast request not found" });
      return;
    }

    if (request.customerId === userId) {
      res.status(400).json({ error: "You cannot respond to your own request" });
      return;
    }

    const provider = await db.query.usersTable.findFirst({ where: eq(usersTable.id, userId) });
    if (!provider || provider.isBlocked || provider.isDeactivated || !provider.isAvailable) {
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

    const explicitAction = String(req.body?.action || "").trim().toLowerCase();
    if (explicitAction && explicitAction !== "accept" && explicitAction !== "counter") {
      res.status(400).json({ error: "action must be accept or counter", code: "INVALID_RESPONSE_ACTION" });
      return;
    }
    const parsedOffer = boundedWholeAmount(req.body?.providerOffer, { min: 50, max: 10_000_000 });
    const requestedTravel = req.body?.providerTravellingCharge;
    const parsedTravel = requestedTravel === undefined
      ? Math.max(0, Number(request.travellingCharge || 0))
      : boundedWholeAmount(requestedTravel, { min: 0, max: 1_000_000 });
    if (parsedTravel === null) {
      res.status(400).json({ error: "Enter a valid whole-rupee travel charge", code: "INVALID_TRAVEL_CHARGE" });
      return;
    }
    const responseType: "accept" | "counter" = explicitAction
      ? explicitAction as "accept" | "counter"
      : (request.customerOffer != null
        && (parsedOffer === null || parsedOffer === request.customerOffer)
        && parsedTravel === Number(request.travellingCharge || 0))
        ? "accept"
        : "counter";
    if (responseType === "accept" && (!request.customerOffer || request.customerOffer <= 0)) {
      res.status(400).json({ error: "This request has no customer price to accept. Send a counter quote instead.", code: "CUSTOMER_OFFER_REQUIRED" });
      return;
    }
    if (responseType === "counter" && parsedOffer === null) {
      res.status(400).json({ error: "Enter a valid whole-rupee hourly counter", code: "INVALID_COUNTER_AMOUNT" });
      return;
    }
    if (responseType === "counter"
      && parsedOffer === request.customerOffer
      && parsedTravel === Number(request.travellingCharge || 0)) {
      res.status(400).json({ error: "This matches the customer's offer. Use Accept Offer to confirm the job immediately.", code: "USE_DIRECT_ACCEPT" });
      return;
    }
    if (req.body?.message !== undefined && typeof req.body.message !== "string") {
      res.status(400).json({ error: "message must be text", code: "INVALID_RESPONSE_MESSAGE" });
      return;
    }
    const rawMessage = String(req.body?.message || "").trim();
    if (rawMessage.length > 300) {
      res.status(400).json({ error: "message must be 300 characters or fewer", code: "INVALID_RESPONSE_MESSAGE" });
      return;
    }
    const suppliedClientRequestId = req.body?.clientRequestId;
    if (suppliedClientRequestId !== undefined
      && !/^[A-Za-z0-9._:-]{8,120}$/.test(String(suppliedClientRequestId).trim())) {
      res.status(400).json({ error: "clientRequestId format is invalid", code: "INVALID_CLIENT_REQUEST_ID" });
      return;
    }
    const message = rawMessage || null;
    const clientRequestId = cleanResponseRequestId(req.body?.clientRequestId, request.id, userId);
    const maxRevisions = Math.max(1, Math.min(10, Number(settings.maxNegotiationRounds || 3)));

    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`broadcast:${request.id}`}, 0))`);
      const freshRequest = await tx.query.broadcastRequestsTable.findFirst({ where: eq(broadcastRequestsTable.id, request.id) });
      if (!freshRequest) throw new BroadcastFlowError(404, "BROADCAST_NOT_FOUND", "Broadcast request not found");
      const existing = await tx.query.broadcastResponsesTable.findFirst({ where: and(
        eq(broadcastResponsesTable.requestId, freshRequest.id),
        eq(broadcastResponsesTable.providerId, userId),
      ) });

      if (freshRequest.status === "accepted") {
        if (existing && freshRequest.acceptedResponseId === existing.id && freshRequest.bookingId) {
          const booking = await tx.query.bookingsTable.findFirst({ where: eq(bookingsTable.id, freshRequest.bookingId) });
          if (booking) return {
            kind: "accepted" as const,
            outcome: { request: freshRequest, response: existing, booking, losingProviderIds: [], duplicate: true },
          };
        }
        throw new BroadcastFlowError(409, "BROADCAST_FILLED", "This job is no longer available because another provider accepted first");
      }
      if (freshRequest.status !== "open") {
        throw new BroadcastFlowError(409, "BROADCAST_NOT_AVAILABLE", "This broadcast request is no longer open");
      }
      if (isExpiredBroadcast(freshRequest)) {
        throw new BroadcastFlowError(409, "BROADCAST_EXPIRED", "This broadcast request has expired");
      }

      const freshProvider = await tx.query.usersTable.findFirst({ where: eq(usersTable.id, userId) });
      if (!freshProvider || freshProvider.isBlocked || freshProvider.isDeactivated || !freshProvider.isAvailable) {
        throw new BroadcastFlowError(409, "PROVIDER_NOT_AVAILABLE", freshProvider?.blockedReason || "Your account cannot respond right now");
      }
      if (!freshProvider.isVerified || freshProvider.verificationStatus !== "approved") {
        throw new BroadcastFlowError(403, "PROVIDER_NOT_VERIFIED", "Only verified providers can respond to broadcast requests");
      }
      const freshMatch = matchProviderToBroadcast(freshProvider, freshRequest, radius, new Set());
      if (!freshMatch.eligible) {
        throw new BroadcastFlowError(403, "BROADCAST_NOT_ELIGIBLE", "This job request is outside your current service category or service area");
      }

      const input = {
        responseType,
        providerOffer: responseType === "counter" ? parsedOffer : null,
        providerTravellingCharge: responseType === "counter" ? parsedTravel : Number(freshRequest.travellingCharge || 0),
        message,
        clientRequestId,
      };
      let response: typeof broadcastResponsesTable.$inferSelect;
      let revised = false;
      let duplicate = false;

      if (!existing) {
        [response] = await tx.insert(broadcastResponsesTable).values({
          id: generateId(),
          requestId: freshRequest.id,
          providerId: userId,
          providerName: freshProvider.name,
          ...input,
          revision: 1,
          status: "pending",
        }).returning();
      } else if (existing.status === "pending") {
        if (!responsePayloadMatches(existing, input)) {
          throw new BroadcastFlowError(409, "RESPONSE_ALREADY_PENDING", "You already have a response awaiting the customer");
        }
        response = existing;
        duplicate = true;
      } else if (existing.status === "rejected_by_customer") {
        if (existing.clientRequestId === clientRequestId) {
          throw new BroadcastFlowError(409, "NEW_REVISION_REQUIRED", "The customer declined this offer. Change the amount and send a revised counter.");
        }
        if (existing.revision >= maxRevisions) {
          throw new BroadcastFlowError(409, "REVISION_LIMIT_REACHED", `Maximum of ${maxRevisions} response revisions reached`);
        }
        if (responseType === "counter"
          && existing.providerOffer === input.providerOffer
          && Number(existing.providerTravellingCharge || 0) === input.providerTravellingCharge) {
          throw new BroadcastFlowError(400, "COUNTER_MUST_CHANGE", "Change the hourly or travel amount before sending another counter");
        }
        const [updated] = await tx.update(broadcastResponsesTable).set({
          ...input,
          revision: existing.revision + 1,
          status: "pending",
          rejectedAt: null,
          updatedAt: new Date(),
        }).where(and(
          eq(broadcastResponsesTable.id, existing.id),
          eq(broadcastResponsesTable.status, "rejected_by_customer"),
          eq(broadcastResponsesTable.revision, existing.revision),
        )).returning();
        if (!updated) throw new BroadcastFlowError(409, "RESPONSE_CHANGED", "This response changed on another device");
        response = updated;
        revised = true;
      } else {
        throw new BroadcastFlowError(409, "RESPONSE_NOT_AVAILABLE", "This response can no longer be changed");
      }

      if (!duplicate) {
        await tx.insert(broadcastOfferEventsTable).values({
          id: generateId(),
          requestId: freshRequest.id,
          responseId: response.id,
          actorId: userId,
          actorRole: "provider",
          eventType: revised ? "response_revised" : "response_submitted",
          revision: response.revision,
          amount: response.responseType === "accept" ? freshRequest.customerOffer : response.providerOffer,
          travellingCharge: response.providerTravellingCharge,
          metadata: { responseType: response.responseType },
        });
      }

      if (response.responseType === "accept") {
        const outcome = await finalizeAcceptedBroadcast(tx, freshRequest, response, "provider");
        return { kind: "accepted" as const, outcome };
      }
      return { kind: "counter" as const, response, duplicate, revised };
    });

    if (result.kind === "accepted") {
      deliverAcceptedBroadcast(result.outcome, "provider").catch((error) => {
        logger.warn({ err: error, broadcastRequestId: request.id }, "broadcast accepted but notification delivery was incomplete");
      });
      res.status(result.outcome.duplicate ? 200 : 201).json({
        response: result.outcome.response,
        booking: result.outcome.booking,
        accepted: true,
        duplicate: result.outcome.duplicate,
      });
      return;
    }

    if (!result.duplicate) {
      emitToUser(request.customerId, "broadcast:response" as EventName, {
        requestId: request.id,
        response: {
          ...result.response,
          providerRating: provider.rating || 0,
          providerTotalJobs: provider.totalJobs || 0,
          providerIsVerified: provider.isVerified || false,
        },
      });
      notifyUser({
        userId: request.customerId,
        title: result.revised ? "Provider revised their counter" : "Provider sent a counter",
        body: `${provider.name} proposed Rs. ${Number(result.response.providerOffer || 0).toLocaleString()} per hour for ${request.serviceLabel}`,
        type: "broadcast",
        link: `/broadcasts/${request.id}`,
        data: { broadcastRequestId: request.id, role: "customer", type: "broadcast" },
      }).catch(() => undefined);
    }
    res.status(result.duplicate ? 200 : 201).json({ response: result.response, accepted: false, duplicate: result.duplicate });
  } catch (e) {
    if (e instanceof BroadcastFlowError) {
      res.status(e.status).json({ error: e.message, code: e.code });
      return;
    }
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

    const requestId = String(req.params.id);
    const responseId = String(req.params.responseId);
    const outcome = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`broadcast:${requestId}`}, 0))`);
      const request = await tx.query.broadcastRequestsTable.findFirst({ where: eq(broadcastRequestsTable.id, requestId) });
      if (!request) throw new BroadcastFlowError(404, "BROADCAST_NOT_FOUND", "Broadcast request not found");
      if (request.customerId !== userId) throw new BroadcastFlowError(403, "ACCESS_DENIED", "Access denied");

      const response = await tx.query.broadcastResponsesTable.findFirst({ where: and(
        eq(broadcastResponsesTable.id, responseId),
        eq(broadcastResponsesTable.requestId, request.id),
      ) });
      if (!response) throw new BroadcastFlowError(404, "RESPONSE_NOT_FOUND", "Provider response not found");

      if (request.status === "accepted") {
        if (request.acceptedResponseId === response.id && request.bookingId) {
          const booking = await tx.query.bookingsTable.findFirst({ where: eq(bookingsTable.id, request.bookingId) });
          if (booking) return { request, response, booking, losingProviderIds: [], duplicate: true };
        }
        throw new BroadcastFlowError(409, "BROADCAST_FILLED", "This job was already confirmed with another provider");
      }
      if (request.status !== "open" || isExpiredBroadcast(request)) {
        throw new BroadcastFlowError(409, "BROADCAST_NOT_AVAILABLE", "This broadcast request is no longer available");
      }
      if (response.status !== "pending") {
        throw new BroadcastFlowError(409, "RESPONSE_UNAVAILABLE", "This provider response is no longer available");
      }
      return finalizeAcceptedBroadcast(tx, request, response, "customer");
    });

    deliverAcceptedBroadcast(outcome, "customer").catch((error) => {
      logger.warn({ err: error, broadcastRequestId: requestId }, "broadcast selected but notification delivery was incomplete");
    });
    res.status(outcome.duplicate ? 200 : 201).json({
      booking: outcome.booking,
      request: outcome.request,
      response: outcome.response,
      duplicate: outcome.duplicate,
    });
  } catch (e) {
    if (e instanceof BroadcastFlowError) {
      res.status(e.status).json({ error: e.message, code: e.code });
      return;
    }
    logger.error({ err: e }, "broadcast select error");
    res.status(500).json({ error: "Failed to select provider and create booking" });
  }
});

// ─── Customer: Reject one counter while keeping the broadcast open ──────────
router.post("/:id/responses/:responseId/reject", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    if (req.user!.role !== "customer") {
      res.status(403).json({ error: "Only customers can reject provider counters" });
      return;
    }
    const userId = req.user!.userId;
    const requestId = String(req.params.id);
    const responseId = String(req.params.responseId);
    const settings = await getPlatformSettings();
    const maxRevisions = Math.max(1, Math.min(10, Number(settings.maxNegotiationRounds || 3)));

    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`broadcast:${requestId}`}, 0))`);
      const request = await tx.query.broadcastRequestsTable.findFirst({ where: eq(broadcastRequestsTable.id, requestId) });
      if (!request) throw new BroadcastFlowError(404, "BROADCAST_NOT_FOUND", "Broadcast request not found");
      if (request.customerId !== userId) throw new BroadcastFlowError(403, "ACCESS_DENIED", "Access denied");
      if (request.status !== "open" || isExpiredBroadcast(request)) {
        throw new BroadcastFlowError(409, "BROADCAST_NOT_AVAILABLE", "This broadcast request is no longer available");
      }
      const response = await tx.query.broadcastResponsesTable.findFirst({ where: and(
        eq(broadcastResponsesTable.id, responseId),
        eq(broadcastResponsesTable.requestId, request.id),
      ) });
      if (!response) throw new BroadcastFlowError(404, "RESPONSE_NOT_FOUND", "Provider response not found");
      if (response.status === "rejected_by_customer") {
        return { request, response, duplicate: true, canRevise: response.revision < maxRevisions };
      }
      if (response.status !== "pending") {
        throw new BroadcastFlowError(409, "RESPONSE_UNAVAILABLE", "This provider response is no longer available");
      }
      const [rejected] = await tx.update(broadcastResponsesTable).set({
        status: "rejected_by_customer",
        rejectedAt: new Date(),
        updatedAt: new Date(),
      }).where(and(
        eq(broadcastResponsesTable.id, response.id),
        eq(broadcastResponsesTable.status, "pending"),
      )).returning();
      if (!rejected) throw new BroadcastFlowError(409, "RESPONSE_CHANGED", "This provider response changed on another device");
      await tx.insert(broadcastOfferEventsTable).values({
        id: generateId(),
        requestId: request.id,
        responseId: rejected.id,
        actorId: userId,
        actorRole: "customer",
        eventType: "response_rejected",
        revision: rejected.revision,
        amount: rejected.responseType === "accept" ? request.customerOffer : rejected.providerOffer,
        travellingCharge: rejected.providerTravellingCharge,
        metadata: { providerMayRevise: rejected.revision < maxRevisions },
      });
      return { request, response: rejected, duplicate: false, canRevise: rejected.revision < maxRevisions };
    });

    if (!result.duplicate) {
      emitToUser(result.response.providerId, "broadcast:response-rejected" as EventName, {
        requestId,
        responseId,
        canRevise: result.canRevise,
      });
      notifyUser({
        userId: result.response.providerId,
        title: "Customer declined your counter",
        body: result.canRevise
          ? `You can send a revised amount for ${result.request.serviceLabel}.`
          : `The response limit was reached for ${result.request.serviceLabel}.`,
        type: "broadcast",
        link: `/broadcasts/${requestId}`,
        data: { broadcastRequestId: requestId, role: "provider", type: "broadcast" },
      }).catch(() => undefined);
    }
    res.json({ response: result.response, canRevise: result.canRevise, duplicate: result.duplicate });
  } catch (e) {
    if (e instanceof BroadcastFlowError) {
      res.status(e.status).json({ error: e.message, code: e.code });
      return;
    }
    logger.error({ err: e }, "broadcast response reject error");
    res.status(500).json({ error: "Failed to reject provider response" });
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

    await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`broadcast:${request.id}`}, 0))`);
      const [cancelled] = await tx.update(broadcastRequestsTable)
        .set({ status: "cancelled", updatedAt: new Date() })
        .where(and(eq(broadcastRequestsTable.id, request.id), eq(broadcastRequestsTable.status, "open")))
        .returning({ id: broadcastRequestsTable.id });
      if (!cancelled) throw new BroadcastFlowError(409, "BROADCAST_NOT_AVAILABLE", "Only open requests can be cancelled");
      await tx.update(broadcastResponsesTable).set({ status: "not_selected", updatedAt: new Date() }).where(and(
        eq(broadcastResponsesTable.requestId, request.id),
        eq(broadcastResponsesTable.status, "pending"),
      ));
      await tx.insert(broadcastOfferEventsTable).values({
        id: generateId(),
        requestId: request.id,
        actorId: userId,
        actorRole: req.user!.role === "admin" ? "admin" : "customer",
        eventType: "broadcast_cancelled",
        metadata: {},
      });
    });

    emitToRole("provider", "broadcast:cancelled" as EventName, { requestId: request.id });

    res.json({ success: true });
  } catch (e) {
    if (e instanceof BroadcastFlowError) {
      res.status(e.status).json({ error: e.message, code: e.code });
      return;
    }
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

    await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`broadcast:${existing.requestId}`}, 0))`);
      const request = await tx.query.broadcastRequestsTable.findFirst({ where: eq(broadcastRequestsTable.id, existing.requestId) });
      if (!request || request.status !== "open" || isExpiredBroadcast(request)) {
        throw new BroadcastFlowError(409, "BROADCAST_NOT_AVAILABLE", "This broadcast request is no longer available");
      }
      const [withdrawn] = await tx.update(broadcastResponsesTable)
        .set({ status: "withdrawn", updatedAt: new Date() })
        .where(and(eq(broadcastResponsesTable.id, existing.id), eq(broadcastResponsesTable.status, "pending")))
        .returning();
      if (!withdrawn) throw new BroadcastFlowError(409, "RESPONSE_CHANGED", "This response changed on another device");
      await tx.insert(broadcastOfferEventsTable).values({
        id: generateId(),
        requestId: existing.requestId,
        responseId: existing.id,
        actorId: userId,
        actorRole: "provider",
        eventType: "response_withdrawn",
        revision: existing.revision,
        amount: existing.responseType === "accept" ? request.customerOffer : existing.providerOffer,
        travellingCharge: existing.providerTravellingCharge,
        metadata: {},
      });
    });

    res.json({ success: true });
  } catch (e) {
    if (e instanceof BroadcastFlowError) {
      res.status(e.status).json({ error: e.message, code: e.code });
      return;
    }
    logger.error({ err: e }, "broadcast withdraw error");
    res.status(500).json({ error: "Failed to withdraw response" });
  }
});

export default router;
