import crypto from "crypto";
import { logger } from "../lib/logger";
import { Router } from "express";
import { db } from "@workspace/db";
import { negotiationsTable, usersTable, bookingsTable } from "@workspace/db/schema";
import { and, eq, or, inArray, lte } from "drizzle-orm";
import { requireAuth, AuthRequest } from "../middlewares/auth";
import type { NegotiationMessage } from "@workspace/db/schema";
import { Response } from "express";
import { emitToUser, emitToRole } from "../lib/eventBus";
import { notifyUser } from "../lib/notifications";
import { getPlatformSettings } from "../lib/admin";
import { activeWorkHttpPayload, getCustomerActiveWorkBlock, getProviderActiveWorkBlock } from "../lib/businessRules";
import { providerScheduleAllows, providerWithinRadius } from "../lib/providerAvailability";

const router = Router();

type NegotiationStatus =
  | "customer_offer"
  | "provider_counter"
  | "accepted"
  | "rejected";

function generateId(): string {
  return crypto.randomUUID();
}

function toAmount(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value);
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.round(parsed) : null;
  }
  return null;
}

function isClosed(status: string) {
  return status === "accepted" || status === "rejected";
}

// 10-minute window for each side to respond before the offer auto-expires.
const NEGOTIATION_TTL_MS = 10 * 60 * 1000; // 10 minutes
function nextDeadline(): Date {
  return new Date(Date.now() + NEGOTIATION_TTL_MS);
}
function isExpired(neg: { status: string; expiresAt: Date | null }): boolean {
  if (isClosed(neg.status)) return false;
  return !!neg.expiresAt && neg.expiresAt.getTime() <= Date.now();
}

// If a negotiation deadline has passed, lazily mark it rejected and
// fan out a `negotiation:expired` event so live UIs can hide the timer.
async function expireIfStale<T extends { id: string; status: string; expiresAt: Date | null; customerId: string; providerId: string; messages: unknown }>(
  neg: T
): Promise<T> {
  if (!isExpired(neg)) return neg;
  const msgs = Array.isArray(neg.messages) ? [...(neg.messages as NegotiationMessage[])] : [];
  msgs.push({
    id: generateId(),
    senderId: "system",
    senderName: "System",
    text: "Offer expired (no response in time)",
    timestamp: new Date().toISOString(),
  });
  const [claimed] = await db
    .update(negotiationsTable)
    .set({ status: "rejected", messages: msgs, updatedAt: new Date() })
    .where(and(
      eq(negotiationsTable.id, neg.id),
      inArray(negotiationsTable.status, ["customer_offer", "provider_counter"]),
      lte(negotiationsTable.expiresAt, new Date()),
    ))
    .returning();
  if (!claimed) {
    const current = await db.query.negotiationsTable.findFirst({ where: eq(negotiationsTable.id, neg.id) });
    return (current || neg) as T;
  }
  emitToUser(neg.customerId, "negotiation:expired", { negotiation: claimed });
  emitToUser(neg.providerId, "negotiation:expired", { negotiation: claimed });
  return claimed as T;
}

async function getNegotiationOr404(id: string, res: Response) {
  const negotiation = await db.query.negotiationsTable.findFirst({
    where: eq(negotiationsTable.id, id),
  });

  if (!negotiation) {
    res.status(404).json({ error: "Negotiation not found" });
    return null;
  }

  return await expireIfStale(negotiation);
}

router.get("/", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const rows = await db
      .select()
      .from(negotiationsTable)
      .where(
        or(
          eq(negotiationsTable.customerId, userId),
          eq(negotiationsTable.providerId, userId)
        )
      )
      .orderBy(negotiationsTable.createdAt);
    // Lazy-expire any stale offers so callers always see the true state.
    const negotiations = await Promise.all(rows.map((n) => expireIfStale(n)));
    res.json({ negotiations: negotiations.reverse() });
  } catch (e) {
    logger.error({ err: e }, "negotiations list error");
    res.status(500).json({ error: "Failed to load negotiations" });
  }
});

router.get("/:id", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const neg = await getNegotiationOr404(String(req.params.id), res);
    if (!neg) return;
    const userId = req.user!.userId;
    if (neg.customerId !== userId && neg.providerId !== userId) {
      res.status(403).json({ error: "You can only view your own negotiations" });
      return;
    }
    res.json({ negotiation: neg });
  } catch (e) {
    logger.error({ err: e }, "negotiation get error");
    res.status(500).json({ error: "Failed to load negotiation" });
  }
});

router.post("/", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const role = req.user!.role;
    if (role !== "customer") {
      res.status(403).json({ error: "Only customers can start negotiations" });
      return;
    }

    const { providerId, providerName, customerName, service, customerOffer, address, latitude, longitude, scheduledDate, scheduledTime, clientRequestId } = req.body;
    const amount = toAmount(customerOffer);
    const requestId = typeof clientRequestId === "string" ? clientRequestId.trim() : "";
    if (!requestId || requestId.length > 120 || !/^[A-Za-z0-9._:-]+$/.test(requestId)) {
      res.status(400).json({ error: "A valid clientRequestId is required" });
      return;
    }
    if (!providerId || !service || !amount || amount < 100) {
      res.status(400).json({ error: "Valid provider, service, and offer are required" });
      return;
    }
    if (!address || !scheduledDate || !scheduledTime) {
      res.status(400).json({ error: "Location, date, and time are required for a negotiation offer" });
      return;
    }

    if (providerId === userId) {
      res.status(400).json({ error: "You cannot negotiate with yourself" });
      return;
    }

    const priorRequest = await db.query.negotiationsTable.findFirst({
      where: and(
        eq(negotiationsTable.customerId, userId),
        eq(negotiationsTable.clientRequestId, requestId),
      ),
    });
    if (priorRequest) {
      res.json({ negotiation: priorRequest, duplicate: true });
      return;
    }

    const customerBlock = await getCustomerActiveWorkBlock(userId);
    if (customerBlock.blocked) {
      res.status(409).json(activeWorkHttpPayload(customerBlock));
      return;
    }

    const provider = await db.query.usersTable.findFirst({
      where: eq(usersTable.id, String(providerId)),
    });

    if (!provider || provider.role !== "provider") {
      res.status(400).json({ error: "Selected user is not a valid provider" });
      return;
    }
    if (provider.isDeactivated || provider.isBlocked) {
      res.status(400).json({ error: provider.blockedReason || "This provider is not available for negotiation right now." });
      return;
    }
    if (provider.verificationStatus !== "approved") {
      res.status(400).json({ error: "This provider has not been verified yet." });
      return;
    }
    if (!provider.isAvailable) {
      res.status(400).json({ error: "This provider is currently busy and cannot take new offers." });
      return;
    }
    const customerLat = Number(latitude);
    const customerLng = Number(longitude);
    if (!Number.isFinite(customerLat) || !Number.isFinite(customerLng)) {
      res.status(400).json({ error: "Customer coordinates are required for provider radius validation" });
      return;
    }
    const radiusMatch = providerWithinRadius(provider, customerLat, customerLng);
    if (!radiusMatch.allowed) {
      res.status(400).json({ error: `This address is outside the provider's ${radiusMatch.radiusKm || 15} km service radius.` });
      return;
    }
    if (!(await providerScheduleAllows(provider.id, String(scheduledDate), String(scheduledTime)))) {
      res.status(400).json({ error: "This provider is not available during the selected schedule." });
      return;
    }

    const providerBlock = await getProviderActiveWorkBlock(provider.id);
    if (providerBlock.blocked) {
      res.status(409).json(activeWorkHttpPayload(providerBlock));
      return;
    }

    const activeExisting = await db.query.negotiationsTable.findFirst({
      where: and(
        eq(negotiationsTable.customerId, userId),
        eq(negotiationsTable.providerId, String(providerId)),
        eq(negotiationsTable.service, String(service)),
        or(
          eq(negotiationsTable.status, "customer_offer" as NegotiationStatus),
          eq(negotiationsTable.status, "provider_counter" as NegotiationStatus)
        )
      ),
    });

    if (activeExisting) {
      res.status(409).json({
        error: "An active negotiation already exists for this provider and service",
        negotiation: activeExisting,
      });
      return;
    }

    const firstMsg: NegotiationMessage = {
      id: generateId(),
      senderId: userId,
      senderName: customerName || "Customer",
      text: `Customer offered Rs. ${amount}`,
      offerAmount: amount,
      timestamp: new Date().toISOString(),
    };

    const negotiation = {
      id: generateId(),
      customerId: userId,
      clientRequestId: requestId,
      customerName: customerName || "Customer",
      providerId: String(providerId),
      providerName: providerName || provider.name,
      service: String(service),
      customerOffer: amount,
      providerCounter: null,
      finalPrice: null,
      status: "customer_offer" as NegotiationStatus,
      address: String(address),
      latitude: latitude != null ? Number(latitude) : null,
      longitude: longitude != null ? Number(longitude) : null,
      scheduledDate: String(scheduledDate),
      scheduledTime: String(scheduledTime),
      bookingId: null,
      // Provider has 20s to respond, otherwise the offer auto-expires.
      expiresAt: nextDeadline(),
      messages: [firstMsg],
    };

    const inserted = await db.insert(negotiationsTable).values(negotiation).onConflictDoNothing().returning();
    if (!inserted.length) {
      const duplicate = await db.query.negotiationsTable.findFirst({
        where: and(
          eq(negotiationsTable.customerId, userId),
          eq(negotiationsTable.clientRequestId, requestId),
        ),
      });
      if (duplicate) {
        res.json({ negotiation: duplicate, duplicate: true });
        return;
      }
      res.status(409).json({ error: "Negotiation request could not be committed" });
      return;
    }

    emitToUser(negotiation.providerId, "negotiation:new", { negotiation });
    emitToUser(negotiation.customerId, "negotiation:updated", { negotiation });
    notifyUser({
      userId: negotiation.providerId,
      title: "New offer",
      body: `${negotiation.customerName} offered Rs. ${amount} for ${negotiation.service}`,
      type: "negotiation",
      link: `/negotiations/${negotiation.id}`,
      data: { negotiationId: negotiation.id },
    
      email: { category: "booking" },
    }).catch(() => undefined);

    res.json({ negotiation });
  } catch (e) {
    logger.error({ err: e }, "negotiation create error");
    res.status(500).json({ error: "Failed to create negotiation" });
  }
});

router.patch("/:id/counter", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const amount = toAmount(req.body?.amount);
    const message = String(req.body?.message || "Counter offer sent").trim().slice(0, 300);

    if (!amount || amount < 100 || amount > 10_000_000) {
      res.status(400).json({ error: "Enter a valid counter amount" });
      return;
    }

    const neg = await getNegotiationOr404(String(req.params.id), res);
    if (!neg) return;

    const userId = req.user!.userId;
    const role = req.user!.role;
    const isCustomer = neg.customerId === userId;
    const isProvider = neg.providerId === userId;

    if (!isCustomer && !isProvider) {
      res.status(403).json({ error: "You can only update your own negotiations" });
      return;
    }

    if (isClosed(neg.status)) {
      res.status(400).json({ error: "This negotiation is already closed" });
      return;
    }

    const msgs = [...((neg.messages as NegotiationMessage[]) || [])] as NegotiationMessage[];

    // Enforce the platform-configured round limit.
    // Each message with an offerAmount counts as one negotiation round.
    const settings = await getPlatformSettings();
    const maxRounds = settings.maxNegotiationRounds ?? 3;
    const offerRoundsUsed = msgs.filter((m) => m.offerAmount != null).length;
    if (offerRoundsUsed >= maxRounds) {
      res.status(400).json({
        error: `Maximum of ${maxRounds} negotiation rounds reached. Please accept the current offer or decline.`,
      });
      return;
    }

    let nextStatus: NegotiationStatus;
    let patch: Partial<typeof neg>;

    if (isProvider && role === "provider") {
      if (neg.status !== "customer_offer") {
        res.status(409).json({ error: "Wait for the customer to respond before countering again" });
        return;
      }
      nextStatus = "provider_counter";
      patch = {
        providerCounter: amount,
        status: nextStatus,
        // Reset the 20s clock for the customer to respond.
        expiresAt: nextDeadline(),
      } as Partial<typeof neg>;
      msgs.push({
        id: generateId(),
        senderId: userId,
        senderName: neg.providerName,
        text: message || `Provider countered Rs. ${amount}`,
        offerAmount: amount,
        timestamp: new Date().toISOString(),
      });
    } else if (isCustomer && role === "customer") {
      if (neg.status !== "provider_counter") {
        res.status(409).json({ error: "Wait for the provider to respond before countering again" });
        return;
      }
      nextStatus = "customer_offer";
      patch = {
        customerOffer: amount,
        status: nextStatus,
        // Reset the 20s clock for the provider to respond.
        expiresAt: nextDeadline(),
      } as Partial<typeof neg>;
      msgs.push({
        id: generateId(),
        senderId: userId,
        senderName: neg.customerName,
        text: message || `Customer offered Rs. ${amount}`,
        offerAmount: amount,
        timestamp: new Date().toISOString(),
      });
    } else {
      res.status(403).json({ error: "Invalid negotiation action for this role" });
      return;
    }

    const [updated] = await db
      .update(negotiationsTable)
      .set({
        ...patch,
        messages: msgs,
        updatedAt: new Date(),
      })
      .where(and(
        eq(negotiationsTable.id, String(req.params.id)),
        eq(negotiationsTable.status, neg.status),
      ))
      .returning();
    if (!updated) {
      res.status(409).json({ error: "This offer changed on another device. Refresh and try again." });
      return;
    }
    if (updated) {
      emitToUser(updated.customerId, "negotiation:updated", { negotiation: updated });
      emitToUser(updated.providerId, "negotiation:updated", { negotiation: updated });
      const recipientId = isProvider ? updated.customerId : updated.providerId;
      const actor = isProvider ? updated.providerName : updated.customerName;
      notifyUser({
        userId: recipientId,
        title: "Counter offer",
        body: `${actor} countered Rs. ${amount}`,
        type: "negotiation",
        link: `/negotiations/${updated.id}`,
        data: { negotiationId: updated.id },
      
        email: { category: "booking" },
      }).catch(() => undefined);
    }
    res.json({ negotiation: updated });
  } catch (e) {
    logger.error({ err: e }, "negotiation counter error");
    res.status(500).json({ error: "Failed to counter offer" });
  }
});

router.patch("/:id/accept", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const neg = await getNegotiationOr404(String(req.params.id), res);
    if (!neg) return;

    const userId = req.user!.userId;
    const role = req.user!.role;

    if (isClosed(neg.status)) {
      res.status(400).json({ error: "This negotiation is already closed" });
      return;
    }

    const isCustomer = neg.customerId === userId && role === "customer";
    const isProvider = neg.providerId === userId && role === "provider";

    let finalPrice: number | null = null;
    let text = "";

    if (isProvider) {
      const providerBlock = await getProviderActiveWorkBlock(userId);
      if (providerBlock.blocked && providerBlock.entityId !== neg.id) {
        res.status(409).json(activeWorkHttpPayload(providerBlock));
        return;
      }
      if (neg.status !== "customer_offer") {
        res.status(400).json({ error: "Provider can only accept the current customer offer" });
        return;
      }
      finalPrice = neg.customerOffer;
      text = `Provider accepted Rs. ${finalPrice}`;
    } else if (isCustomer) {
      const customerBlock = await getCustomerActiveWorkBlock(userId);
      if (customerBlock.blocked && customerBlock.entityId !== neg.id) {
        res.status(409).json(activeWorkHttpPayload(customerBlock));
        return;
      }
      if (neg.status !== "provider_counter" || neg.providerCounter == null) {
        res.status(400).json({ error: "Customer can only accept the current provider counter" });
        return;
      }
      finalPrice = neg.providerCounter;
      text = `Customer accepted Rs. ${finalPrice}`;
    } else {
      res.status(403).json({ error: "You can only accept your own negotiations" });
      return;
    }

    const msgs = [...((neg.messages as NegotiationMessage[]) || [])] as NegotiationMessage[];
    msgs.push({
      id: generateId(),
      senderId: userId,
      senderName: isProvider ? neg.providerName : neg.customerName,
      text,
      offerAmount: finalPrice,
      timestamp: new Date().toISOString(),
    });

    // Auto-create a booking from the negotiation details
    let newBookingId: string | null = null;

    // ── Atomic transaction: flip negotiation status + insert booking ───────────
    // Without this, two concurrent accept calls (e.g. both parties tap at once)
    // can both pass the isClosed() guard and both insert a booking. The DB unique
    // partial index on bookings(customer_id/provider_id) is the final safety net,
    // but the transaction ensures we re-read status inside the lock window.
    await db.transaction(async (tx) => {
      // Re-verify status hasn't changed since the outer read.
      const freshNeg = await tx.query.negotiationsTable.findFirst({
        where: eq(negotiationsTable.id, String(req.params.id)),
      });
      if (!freshNeg || isClosed(freshNeg.status)) {
        throw new Error("ALREADY_CLOSED");
      }

      const acceptedRows = await tx
        .update(negotiationsTable)
        .set({
          status: "accepted",
          finalPrice,
          messages: msgs,
          updatedAt: new Date(),
        })
        .where(and(
          eq(negotiationsTable.id, String(req.params.id)),
          eq(negotiationsTable.status, freshNeg.status),
        ))
        .returning({ id: negotiationsTable.id });
      if (acceptedRows.length === 0) throw new Error("ALREADY_CLOSED");

      const [customer, provider] = await Promise.all([
        tx.query.usersTable.findFirst({ where: eq(usersTable.id, neg.customerId) }),
        tx.query.usersTable.findFirst({ where: eq(usersTable.id, neg.providerId) }),
      ]);
      if (customer && provider) {
        newBookingId = generateId();
        const today = new Date();
        const mm = String(today.getMonth() + 1).padStart(2, "0");
        const dd = String(today.getDate()).padStart(2, "0");
        const rand = String(crypto.randomInt(10000, 100000));
        const publicId = `ATH-${today.getFullYear()}${mm}${dd}-${rand}`;

        const booking = {
          id: newBookingId,
          publicId,
          customerId: neg.customerId,
          customerName: neg.customerName,
          customerPhone: customer.phone,
          providerId: neg.providerId,
          providerName: neg.providerName,
          providerPhone: provider.phone,
          service: neg.service,
          serviceIcon: "tool",
          description: null,
          attachment: null,
          address: (neg.address as string | null) || "To be confirmed",
          scheduledDate: (neg.scheduledDate as string | null) || today.toISOString().split("T")[0],
          scheduledTime: (neg.scheduledTime as string | null) || "10:00",
          status: "accepted",
          price: finalPrice,
          commissionAmount: 0,
          providerAmount: finalPrice,
          commissionRate: 0,
          visitCharge: 0,
          categorySlug: null,
          pickedLat: (neg.latitude as number | null) ?? null,
          pickedLng: (neg.longitude as number | null) ?? null,
          customerLat: null,
          customerLng: null,
          providerLat: null,
          providerLng: null,
          providerAccuracy: null,
          providerUpdatedAt: null,
          providerArrivedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        await tx.insert(bookingsTable).values(booking);
        await tx
          .update(negotiationsTable)
          .set({ bookingId: newBookingId })
          .where(eq(negotiationsTable.id, String(req.params.id)));

        emitToUser(neg.customerId, "booking:updated", { booking });
        emitToUser(neg.providerId, "booking:new", { booking });
        emitToRole("admin", "admin:event", { type: "booking:new", booking });

        notifyUser({
          userId: neg.customerId,
          title: "Booking Confirmed!",
          body: `Your ${neg.service} booking is confirmed at Rs. ${finalPrice}`,
          type: "booking",
          link: `/bookings/${newBookingId}`,
          data: { bookingId: newBookingId },
        
          email: { category: "booking" },
        }).catch(() => undefined);
      }
    });

    const updated = await db.query.negotiationsTable.findFirst({
      where: eq(negotiationsTable.id, String(req.params.id)),
    });
    if (updated) {
      emitToUser(updated.customerId, "negotiation:accepted", { negotiation: updated, bookingId: newBookingId });
      emitToUser(updated.providerId, "negotiation:accepted", { negotiation: updated, bookingId: newBookingId });
      const recipientId = isProvider ? updated.customerId : updated.providerId;
      const actor = isProvider ? updated.providerName : updated.customerName;
      notifyUser({
        userId: recipientId,
        title: "Offer accepted",
        body: `${actor} accepted Rs. ${finalPrice}`,
        type: "negotiation",
        link: `/negotiations/${updated.id}`,
        data: { negotiationId: updated.id },
      
        email: { category: "booking" },
      }).catch(() => undefined);
    }
    res.json({ negotiation: updated, bookingId: newBookingId });
  } catch (e: any) {
    if (e?.message === "ALREADY_CLOSED") {
      res.status(409).json({ error: "This offer was already accepted or closed by the other party. Please refresh." });
      return;
    }
    logger.error({ err: e }, "negotiation accept error");
    res.status(500).json({ error: "Failed to accept offer" });
  }
});

router.patch("/:id/reject", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const neg = await getNegotiationOr404(String(req.params.id), res);
    if (!neg) return;

    const userId = req.user!.userId;
    const role = req.user!.role;
    const isCustomer = neg.customerId === userId && role === "customer";
    const isProvider = neg.providerId === userId && role === "provider";

    if (!isCustomer && !isProvider) {
      res.status(403).json({ error: "You can only reject your own negotiations" });
      return;
    }

    if (isClosed(neg.status)) {
      res.status(400).json({ error: "This negotiation is already closed" });
      return;
    }

    const msgs = [...((neg.messages as NegotiationMessage[]) || [])] as NegotiationMessage[];
    msgs.push({
      id: generateId(),
      senderId: userId,
      senderName: isProvider ? neg.providerName : neg.customerName,
      text: isProvider ? "Provider rejected the offer" : "Customer rejected the counter offer",
      timestamp: new Date().toISOString(),
    });

    const [updated] = await db
      .update(negotiationsTable)
      .set({
        status: "rejected",
        messages: msgs,
        updatedAt: new Date(),
      })
      .where(and(
        eq(negotiationsTable.id, String(req.params.id)),
        eq(negotiationsTable.status, neg.status),
      ))
      .returning();
    if (!updated) {
      res.status(409).json({ error: "This negotiation was already updated" });
      return;
    }
    if (updated) {
      emitToUser(updated.customerId, "negotiation:rejected", { negotiation: updated });
      emitToUser(updated.providerId, "negotiation:rejected", { negotiation: updated });
    }
    res.json({ negotiation: updated });
  } catch (e) {
    logger.error({ err: e }, "negotiation reject error");
    res.status(500).json({ error: "Failed to reject offer" });
  }
});

export default router;

