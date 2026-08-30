import { and, eq, or } from "drizzle-orm";
import { getPlatformSettings } from "./admin";
import {
  bookingsTable,
  broadcastRequestsTable,
  broadcastResponsesTable,
  chatsTable,
  db,
  messagesTable,
  negotiationsTable,
  paymentAccountsTable,
  usersTable,
  type UploadSecurityRecord,
} from "@workspace/db";

interface StorageReader {
  userId: string;
  role: string;
}

function normalizeServiceKey(value: unknown): string {
  return String(value || "")
    .normalize("NFKD")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function numericCoordinate(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRadians = (degrees: number) => degrees * Math.PI / 180;
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function providerCanReadOpenBroadcastMedia(
  providerId: string,
  request: {
    service: string;
    serviceLabel: string;
    latitude: number | null;
    longitude: number | null;
    createdAt: Date | null;
    expiresAt: Date;
  },
): Promise<boolean> {
  if (request.expiresAt.getTime() <= Date.now()) return false;
  const provider = await db.query.usersTable.findFirst({ where: eq(usersTable.id, providerId) });
  if (!provider || provider.role !== "provider" || provider.isBlocked || provider.isDeactivated) return false;
  if (!provider.isVerified || provider.verificationStatus !== "approved") return false;

  const requested = new Set([request.service, request.serviceLabel].map(normalizeServiceKey).filter(Boolean));
  const services = new Set((provider.services || []).map(normalizeServiceKey).filter(Boolean));
  if (!requested.size || !services.size || ![...requested].some((value) => value === "general" || services.has("general") || services.has(value))) {
    return false;
  }

  const providerLat = numericCoordinate(provider.latitude);
  const providerLng = numericCoordinate(provider.longitude);
  const requestLat = numericCoordinate(request.latitude);
  const requestLng = numericCoordinate(request.longitude);
  if (providerLat === null || providerLng === null || requestLat === null || requestLng === null) return false;

  const activeWork = await db.select({ id: bookingsTable.id })
    .from(bookingsTable)
    .where(and(
      eq(bookingsTable.providerId, providerId),
      or(eq(bookingsTable.status, "accepted"), eq(bookingsTable.status, "in_progress")),
    ))
    .limit(1);
  if (activeWork.length) return false;

  const settings = await getPlatformSettings();
  const createdAtMs = request.createdAt?.getTime() || Date.now();
  const expandAfterMs = Number(settings.broadcastExpandAfterMinutes || 0) * 60_000;
  const platformRadius = Date.now() - createdAtMs >= expandAfterMs
    ? Number(settings.broadcastExpansionRadiusKm || 30)
    : Number(settings.broadcastInitialRadiusKm || 10);
  const providerRadius = Math.max(1, Math.min(100, Number(provider.maxTravelDistanceKm || 15)));
  const effectiveRadius = Math.min(Math.max(1, platformRadius), providerRadius);
  return distanceKm(providerLat, providerLng, requestLat, requestLng) <= effectiveRadius;
}

function negotiationMessagesContainPath(messages: unknown, objectPath: string): boolean {
  if (!Array.isArray(messages)) return false;
  return messages.some((entry) => {
    if (!entry || typeof entry !== "object") return false;
    const value = entry as Record<string, unknown>;
    if (value.mediaUrl === objectPath) return true;
    return Array.isArray(value.mediaUrls) && value.mediaUrls.some((item) => item === objectPath);
  });
}

/**
 * Entity-aware authorization for scanned user uploads.
 *
 * An opaque URL is never treated as permission. Owners and administrators can
 * read their records; every other shared read must be proven through the
 * booking, chat, negotiation, broadcast, or public-profile entity that exposed
 * the file to that user. Unknown shared upload references fail closed.
 */
export async function canReadStoredUploadObject(
  objectPath: string,
  user: StorageReader,
  securityRecord: UploadSecurityRecord | null | undefined,
): Promise<boolean> {
  const normalized = String(objectPath || "").trim();
  if (!normalized.startsWith("/objects/uploads/") || normalized.includes("/quarantine/")) return false;
  if (user.role === "admin") return true;
  if (!securityRecord || securityRecord.scanStatus !== "clean") return false;
  if (securityRecord.ownerId === user.userId) return true;
  if (securityRecord.scope !== "shared") return false;

  const profile = await db.select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.profileImage, normalized))
    .limit(1);
  if (profile.length) return true;

  const paymentQr = await db.select({ id: paymentAccountsTable.id })
    .from(paymentAccountsTable)
    .where(eq(paymentAccountsTable.qrCodeUrl, normalized))
    .limit(1);
  if (paymentQr.length) return true;

  const booking = await db.select({ id: bookingsTable.id })
    .from(bookingsTable)
    .where(and(
      or(eq(bookingsTable.customerId, user.userId), eq(bookingsTable.providerId, user.userId)),
      or(eq(bookingsTable.attachment, normalized), eq(bookingsTable.videoUrl, normalized)),
    ))
    .limit(1);
  if (booking.length) return true;

  const chatMedia = await db.select({ id: messagesTable.id })
    .from(messagesTable)
    .innerJoin(chatsTable, eq(chatsTable.id, messagesTable.chatId))
    .where(and(
      eq(messagesTable.mediaUrl, normalized),
      or(eq(chatsTable.participant1Id, user.userId), eq(chatsTable.participant2Id, user.userId)),
    ))
    .limit(1);
  if (chatMedia.length) return true;

  const negotiationRows = await db.select({ messages: negotiationsTable.messages })
    .from(negotiationsTable)
    .where(or(eq(negotiationsTable.customerId, user.userId), eq(negotiationsTable.providerId, user.userId)));
  if (negotiationRows.some((row) => negotiationMessagesContainPath(row.messages, normalized))) return true;

  if (user.role === "provider") {
    const broadcast = await db.select({
      requestId: broadcastRequestsTable.id,
      status: broadcastRequestsTable.status,
      acceptedResponseId: broadcastRequestsTable.acceptedResponseId,
      service: broadcastRequestsTable.service,
      serviceLabel: broadcastRequestsTable.serviceLabel,
      latitude: broadcastRequestsTable.latitude,
      longitude: broadcastRequestsTable.longitude,
      createdAt: broadcastRequestsTable.createdAt,
      expiresAt: broadcastRequestsTable.expiresAt,
    })
      .from(broadcastRequestsTable)
      .where(eq(broadcastRequestsTable.videoUrl, normalized))
      .limit(1);
    const request = broadcast[0];
    if (request?.status === "open") {
      return providerCanReadOpenBroadcastMedia(user.userId, request);
    }
    if (request?.acceptedResponseId) {
      const winningResponse = await db.select({ id: broadcastResponsesTable.id })
        .from(broadcastResponsesTable)
        .where(and(
          eq(broadcastResponsesTable.id, request.acceptedResponseId),
          eq(broadcastResponsesTable.providerId, user.userId),
        ))
        .limit(1);
      if (winningResponse.length) return true;
    }
  }

  return false;
}
