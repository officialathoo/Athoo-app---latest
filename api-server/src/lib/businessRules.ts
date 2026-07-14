import { and, eq, inArray, ne, or } from "drizzle-orm";
import { db } from "@workspace/db";
import { bookingsTable, broadcastRequestsTable, negotiationsTable } from "@workspace/db/schema";

export const ACTIVE_BOOKING_STATUSES = ["pending", "accepted", "on_the_way", "arrived", "started", "in_progress"] as const;
export const ACTIVE_NEGOTIATION_STATUSES = ["customer_offer", "provider_counter"] as const;

export type ActiveWorkBlock = {
  blocked: boolean;
  code?: "ACTIVE_BOOKING" | "ACTIVE_BROADCAST" | "ACTIVE_NEGOTIATION";
  message?: string;
  entityId?: string;
};

function activeBookingStatusWhere() {
  return or(
    eq(bookingsTable.status, "pending"),
    eq(bookingsTable.status, "accepted"),
    eq(bookingsTable.status, "on_the_way"),
    eq(bookingsTable.status, "arrived"),
    eq(bookingsTable.status, "started"),
    eq(bookingsTable.status, "in_progress"),
  );
}

function activeNegotiationStatusWhere() {
  return or(
    eq(negotiationsTable.status, "customer_offer"),
    eq(negotiationsTable.status, "provider_counter"),
  );
}

export async function getCustomerActiveWorkBlock(customerId: string): Promise<ActiveWorkBlock> {
  const activeBooking = await db.query.bookingsTable.findFirst({
    where: and(eq(bookingsTable.customerId, customerId), activeBookingStatusWhere()),
  });
  if (activeBooking) {
    return {
      blocked: true,
      code: "ACTIVE_BOOKING",
      entityId: activeBooking.id,
      message: `You already have an active job #${String(activeBooking.publicId || activeBooking.id).slice(-10)}. Please complete or close this job before creating another request.`,
    };
  }

  const activeBroadcast = await db.query.broadcastRequestsTable.findFirst({
    where: and(eq(broadcastRequestsTable.customerId, customerId), eq(broadcastRequestsTable.status, "open")),
  });
  if (activeBroadcast) {
    return {
      blocked: true,
      code: "ACTIVE_BROADCAST",
      entityId: activeBroadcast.id,
      message: `You already have an active broadcast #${String(activeBroadcast.id).slice(-6).toUpperCase()}. Please select a provider or cancel it before creating another request.`,
    };
  }

  const activeNegotiation = await db.query.negotiationsTable.findFirst({
    where: and(eq(negotiationsTable.customerId, customerId), activeNegotiationStatusWhere()),
  });
  if (activeNegotiation) {
    return {
      blocked: true,
      code: "ACTIVE_NEGOTIATION",
      entityId: activeNegotiation.id,
      message: `You already have an active negotiation #${String(activeNegotiation.id).slice(-6).toUpperCase()}. Please accept, reject, or let it expire before starting another request.`,
    };
  }

  return { blocked: false };
}

export async function getProviderActiveWorkBlock(providerId: string, opts: { excludeBookingId?: string } = {}): Promise<ActiveWorkBlock> {
  const bookingWhere = opts.excludeBookingId
    ? and(
        eq(bookingsTable.providerId, providerId),
        ne(bookingsTable.id, opts.excludeBookingId),
        activeBookingStatusWhere(),
      )
    : and(eq(bookingsTable.providerId, providerId), activeBookingStatusWhere());

  const activeBooking = await db.query.bookingsTable.findFirst({ where: bookingWhere });
  if (activeBooking) {
    return {
      blocked: true,
      code: "ACTIVE_BOOKING",
      entityId: activeBooking.id,
      message: `You are currently busy on job #${String(activeBooking.publicId || activeBooking.id).slice(-10)}. Complete this job before accepting new work.`,
    };
  }

  const activeNegotiation = await db.query.negotiationsTable.findFirst({
    where: and(eq(negotiationsTable.providerId, providerId), activeNegotiationStatusWhere()),
  });
  if (activeNegotiation) {
    return {
      blocked: true,
      code: "ACTIVE_NEGOTIATION",
      entityId: activeNegotiation.id,
      message: `You already have an active negotiation #${String(activeNegotiation.id).slice(-6).toUpperCase()}. Please finish it before responding to another request.`,
    };
  }

  return { blocked: false };
}

export async function getBusyProviderIds(providerIds: string[]): Promise<Set<string>> {
  const uniqueProviderIds = [...new Set(providerIds.filter(Boolean))];
  if (uniqueProviderIds.length === 0) return new Set();

  const [activeBookings, activeNegotiations] = await Promise.all([
    db
      .select({ providerId: bookingsTable.providerId })
      .from(bookingsTable)
      .where(and(inArray(bookingsTable.providerId, uniqueProviderIds), activeBookingStatusWhere())),
    db
      .select({ providerId: negotiationsTable.providerId })
      .from(negotiationsTable)
      .where(and(inArray(negotiationsTable.providerId, uniqueProviderIds), activeNegotiationStatusWhere())),
  ]);

  return new Set([
    ...activeBookings.map((row) => row.providerId),
    ...activeNegotiations.map((row) => row.providerId),
  ]);
}

export function activeWorkHttpPayload(block: ActiveWorkBlock) {
  return {
    error: block.message || "You already have an active request or job.",
    code: block.code || "ACTIVE_WORK_BLOCKED",
    entityId: block.entityId,
  };
}
