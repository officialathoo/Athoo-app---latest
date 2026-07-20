import crypto from "crypto";
import { logger } from "../lib/logger";
import { Router, type Response } from "express";
import { db } from "@workspace/db";
import { bookingsTable, negotiationsTable, serviceCategoriesTable, usersTable, invoicesTable } from "@workspace/db/schema";
import { and, eq, inArray, desc, not, gte, lt, sql, isNull } from "drizzle-orm";
import { requireAuth, type AuthRequest } from "../middlewares/auth";
import { getPlatformSettings } from "../lib/admin";
import { emitToUser, emitToRole, type EventName } from "../lib/eventBus";
import { notifyUser } from "../lib/notifications";
import { activeWorkHttpPayload, getCustomerActiveWorkBlock, getProviderActiveWorkBlock } from "../lib/businessRules";
import { canTransitionBookingStatus, isBookingStatus, type BookingStatus } from "../domain/booking-status";
import { ReviewSubmissionError, submitBookingReview } from "../domain/reviews";
import { providerScheduleAllows, providerWithinRadius } from "../lib/providerAvailability";
import { restoreProviderAvailabilityIfCompliant } from "../lib/documentCompliance";
import { calculateTimedInvoice } from "../domain/invoiceCalculation";


function parseScheduledDateTime(dateValue: unknown, timeValue: unknown): Date | null {
  const date = String(dateValue || "").trim();
  const time = String(timeValue || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const match = time.match(/^(\d{1,2}):(\d{2})(?:\s*(AM|PM))?$/i);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const ap = String(match[3] || "").toUpperCase();
  if (ap === "PM" && hour < 12) hour += 12;
  if (ap === "AM" && hour === 12) hour = 0;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  const dt = new Date(`${date}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`);
  return Number.isFinite(dt.getTime()) ? dt : null;
}

function validateFutureBookingDateTime(dateValue: unknown, timeValue: unknown, minMinutes = 20): string | null {
  const dt = parseScheduledDateTime(dateValue, timeValue);
  if (!dt) return "Please choose a valid booking date and time.";
  if (dt.getTime() < Date.now() + minMinutes * 60 * 1000) {
    return `Please choose a future booking time at least ${minMinutes} minutes from now.`;
  }
  return null;
}

function broadcastBookingUpdate(
  booking: any,
  event: EventName = "booking:updated",
  extra: Record<string, unknown> = {},
) {
  if (!booking) return;
  const payload = { booking, ...extra };
  if (booking.customerId) emitToUser(booking.customerId, event, payload);
  if (booking.providerId) emitToUser(booking.providerId, event, payload);
}

const router = Router();

type AllowedStatus = BookingStatus;

// Job OTP (PIN) lifetime — 3 minutes per spec.
const PIN_TTL_MS = 3 * 60 * 1000;

function pinExpiry(): Date {
  return new Date(Date.now() + PIN_TTL_MS);
}

function isPinExpired(expiresAt: Date | null | undefined): boolean {
  if (!expiresAt) return true;
  return new Date(expiresAt).getTime() <= Date.now();
}

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

function generatePin(): string {
  return crypto.randomInt(1000, 10000).toString();
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

const isAllowedStatus = isBookingStatus;

async function getBookingOr404(id: string, res: Response) {
  const booking = await db.query.bookingsTable.findFirst({ where: eq(bookingsTable.id, id) });
  if (!booking) {
    res.status(404).json({ error: "Booking not found" });
    return null;
  }
  return booking;
}

function sanitizeBookingForViewer(
  booking: Record<string, any>,
  viewerRole: string,
  viewerUserId: string,
) {
  const safeBooking = { ...booking } as Record<string, any>;
  const isProviderViewer = viewerRole === "provider" && booking.providerId === viewerUserId;

  if (!isProviderViewer && viewerRole !== "admin") {
    delete safeBooking.customerPhone;
    delete safeBooking.providerPhone;
  }

  if (isProviderViewer) {
    delete safeBooking.startPin;
    delete safeBooking.completePin;
  }

  return safeBooking;
}

async function enrichBookings(bookings: any[], role: string, userId: string) {
  const uniqueIds = [...new Set(bookings.flatMap((b: any) => [b.customerId, b.providerId]))] as string[];
  const profiles = uniqueIds.length
    ? await db.select({
        id: usersTable.id,
        profileImage: usersTable.profileImage,
        profileColor: usersTable.profileColor,
      }).from(usersTable).where(inArray(usersTable.id, uniqueIds))
    : [];

  const profileMap = Object.fromEntries(
    profiles.map((profile) => [profile.id, profile])
  );

  return bookings.map((b: any) =>
    sanitizeBookingForViewer(
      {
        ...b,
        customerProfileImage: profileMap[b.customerId]?.profileImage ?? null,
        providerProfileImage: profileMap[b.providerId]?.profileImage ?? null,
        providerProfileColor: profileMap[b.providerId]?.profileColor ?? null,
      },
      role,
      userId,
    )
  );
}

async function completeBookingWithInvoice(args: {
  bookingId: string;
  providerId: string;
  completionPin: string;
}) {
  const settings = await getPlatformSettings();
  const commissionRate = Number(settings.commissionRate || 0);
  const commissionIncludesVisitCharge = String(process.env.COMMISSION_INCLUDES_VISIT_CHARGE || "true").toLowerCase() !== "false";
  const completedAt = new Date();

  return db.transaction(async (tx) => {
    // Serialize completion attempts for this booking. This protects the invoice,
    // commission ledger and provider counters from double-taps and retries.
    await tx.execute(sql`SELECT id FROM bookings WHERE id = ${args.bookingId} FOR UPDATE`);
    const booking = await tx.query.bookingsTable.findFirst({
      where: eq(bookingsTable.id, args.bookingId),
    });
    if (!booking) return { status: 404 as const, error: "Booking not found" };
    if (booking.providerId !== args.providerId) {
      return { status: 403 as const, error: "Only the assigned provider can verify the completion PIN" };
    }
    if (booking.status !== "in_progress") {
      return {
        status: 409 as const,
        error: booking.status === "completed"
          ? "This booking has already been completed."
          : "Only in-progress bookings can be completed",
        code: "BOOKING_COMPLETE_CONFLICT",
      };
    }
    if (!booking.completePin) {
      return { status: 400 as const, error: "No active PIN. Generate a fresh completion PIN." };
    }
    if (isPinExpired(booking.completePinExpiresAt)) {
      return { status: 400 as const, error: "This PIN has expired. Generate a new one." };
    }
    if (booking.completePin !== args.completionPin) {
      return { status: 400 as const, error: "Incorrect PIN. Ask the customer for the current 4-digit code." };
    }

    const calculation = calculateTimedInvoice({
      ratePerHour: booking.ratePerHour,
      visitCharge: booking.visitCharge,
      fallbackServiceAmount: booking.price,
      jobStartedAt: booking.jobStartedAt,
      jobCompletedAt: completedAt,
      commissionRate,
      commissionIncludesVisitCharge,
    });

    await tx.execute(sql`SELECT id FROM users WHERE id = ${booking.providerId} FOR UPDATE`);
    const provider = await tx.query.usersTable.findFirst({
      where: eq(usersTable.id, booking.providerId),
    });
    if (!provider) return { status: 404 as const, error: "Provider not found" };

    const nextPending = Number(provider.pendingCommission || 0) + calculation.commissionAmount;
    const commissionLimit = Number(provider.commissionLimit || settings.defaultCommissionLimit || 5000);
    const shouldBlock = nextPending >= commissionLimit;

    const [completedBooking] = await tx.update(bookingsTable)
      .set({
        status: "completed",
        completePin: null,
        completePinExpiresAt: null,
        price: calculation.serviceAmount,
        commissionRate: calculation.commissionRate,
        commissionAmount: calculation.commissionAmount,
        providerAmount: calculation.providerAmount,
        jobCompletedAt: completedAt,
        updatedAt: completedAt,
      })
      .where(and(
        eq(bookingsTable.id, args.bookingId),
        eq(bookingsTable.status, "in_progress"),
        eq(bookingsTable.completePin, args.completionPin),
        gte(bookingsTable.completePinExpiresAt, completedAt),
      ))
      .returning();

    if (!completedBooking) {
      return {
        status: 409 as const,
        error: "This booking was already completed or the PIN changed. Please refresh and try again.",
        code: "BOOKING_COMPLETE_CONFLICT",
      };
    }

    await tx.update(usersTable).set({
      totalJobs: Number(provider.totalJobs || 0) + 1,
      totalCommission: Number(provider.totalCommission || 0) + calculation.commissionAmount,
      pendingCommission: nextPending,
      isBlocked: shouldBlock,
      blockedReason: shouldBlock ? "Commission due limit reached. Please clear your Athoo dues." : null,
      updatedAt: completedAt,
    }).where(eq(usersTable.id, provider.id));

    const existingInvoice = await tx.select({ id: invoicesTable.id })
      .from(invoicesTable)
      .where(eq(invoicesTable.bookingId, booking.id))
      .limit(1);

    if (existingInvoice.length === 0) {
      const sequenceResult = await tx.execute<{ next_value: string }>(
        sql`select nextval('athoo_invoice_number_seq')::text as next_value`,
      );
      const nextNum = Number(sequenceResult.rows[0]?.next_value || 0);
      if (!Number.isSafeInteger(nextNum) || nextNum <= 0) {
        throw new Error("Failed to allocate invoice number");
      }
      const invoiceNumber = `ATH-${String(nextNum).padStart(6, "0")}`;
      await tx.insert(invoicesTable).values({
        id: crypto.randomUUID(),
        invoiceNumber,
        bookingId: booking.id,
        bookingPublicId: booking.publicId,
        customerId: booking.customerId,
        providerId: booking.providerId,
        customerName: booking.customerName,
        providerName: booking.providerName,
        service: booking.service,
        address: booking.address,
        scheduledDate: booking.scheduledDate,
        scheduledTime: booking.scheduledTime,
        ratePerHour: calculation.ratePerHour,
        durationMinutes: calculation.durationMinutes,
        jobStartedAt: booking.jobStartedAt,
        jobCompletedAt: completedAt,
        subtotal: calculation.serviceAmount,
        visitCharge: calculation.visitCharge,
        platformFee: 0,
        discountAmount: 0,
        totalAmount: calculation.totalAmount,
        commissionAmount: calculation.commissionAmount,
        providerAmount: calculation.providerAmount,
        status: "issued",
      });
    }

    return { status: 200 as const, booking: completedBooking };
  });
}

router.get("/summary", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const role = req.user!.role;
    if (role !== "customer" && role !== "provider") {
      return res.status(403).json({ error: "Customer or provider account required" });
    }
    const ownerCondition = role === "customer"
      ? eq(bookingsTable.customerId, userId)
      : eq(bookingsTable.providerId, userId);
    const [summary] = await db.select({
      total: sql<number>`count(*)::int`,
      completed: sql<number>`count(*) filter (where ${bookingsTable.status} = 'completed')::int`,
      active: sql<number>`count(*) filter (where ${bookingsTable.status} in ('pending','accepted','in_progress'))::int`,
      completedValue: sql<number>`coalesce(sum(case when ${bookingsTable.status} = 'completed' then coalesce(${bookingsTable.price}, 0) else 0 end), 0)::int`,
      providerValue: sql<number>`coalesce(sum(case when ${bookingsTable.status} = 'completed' then coalesce(${bookingsTable.providerAmount}, ${bookingsTable.price}, 0) else 0 end), 0)::int`,
    }).from(bookingsTable).where(ownerCondition);
    const total = Number(summary?.total || 0);
    const completed = Number(summary?.completed || 0);
    const active = Number(summary?.active || 0);
    const completedValue = Number(summary?.completedValue || 0);
    const providerValue = Number(summary?.providerValue || 0);
    return res.json({
      total,
      completed,
      active,
      totalSpent: role === "customer" ? completedValue : undefined,
      totalEarned: role === "provider" ? providerValue : undefined,
    });
  } catch (e) {
    logger.error({ err: e }, "bookings summary error");
    return res.status(500).json({ error: "Failed to load summary" });
  }
});

router.get("/", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const role = req.user!.role;
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 100));
    const offset = Math.max(0, Number(req.query.offset) || 0);

    const bookings = role === "customer"
      ? await db.select().from(bookingsTable).where(eq(bookingsTable.customerId, userId)).orderBy(desc(bookingsTable.createdAt)).limit(limit).offset(offset)
      : role === "provider"
      ? await db.select().from(bookingsTable).where(eq(bookingsTable.providerId, userId)).orderBy(desc(bookingsTable.createdAt)).limit(limit).offset(offset)
      : await db.select().from(bookingsTable).orderBy(desc(bookingsTable.createdAt)).limit(limit).offset(offset);

    const enriched = await enrichBookings(bookings, role, userId);
    res.json({ bookings: enriched, limit, offset, hasMore: bookings.length === limit });
  } catch (e) {
    logger.error({ err: e }, "bookings list error");
    res.status(500).json({ error: "Failed to load bookings" });
  }
});

router.get("/:id", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const booking = await getBookingOr404(req.params.id as string, res);
    if (!booking) return;

    const userId = req.user!.userId;
    if (req.user!.role !== "admin" && booking.customerId !== userId && booking.providerId !== userId) {
      res.status(403).json({ error: "You can only view your own bookings" });
      return;
    }

    res.json({ booking: sanitizeBookingForViewer(booking as any, req.user!.role, userId) });
  } catch (e) {
    logger.error({ err: e }, "booking get error");
    res.status(500).json({ error: "Failed to load booking" });
  }
});

router.post("/", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const role = req.user!.role;

    if (role !== "customer") {
      res.status(403).json({ error: "Only customers can create bookings" });
      return;
    }

    const {
      providerId,
      service,
      serviceIcon,
      description,
      attachment,
      videoUrl,
      address,
      scheduledDate,
      scheduledTime,
      price,
      pickedLat,
      pickedLng,
      customerLat,
      customerLng,
      latitude,
      longitude,
      clientRequestId,
    } = req.body;

    if (!providerId || !service || !address || !scheduledDate || !scheduledTime) {
      res.status(400).json({ error: "providerId, service, address, scheduledDate, and scheduledTime are required" });
      return;
    }

    if (providerId === userId) {
      res.status(400).json({ error: "You cannot book yourself" });
      return;
    }

    const normalizedClientRequestId = typeof clientRequestId === "string" ? clientRequestId.trim() : "";
    if (!normalizedClientRequestId || normalizedClientRequestId.length > 120 || !/^[A-Za-z0-9._:-]+$/.test(normalizedClientRequestId)) {
      res.status(400).json({ error: "A valid clientRequestId is required to safely create a booking." });
      return;
    }

    const existingRequestBooking = await db.query.bookingsTable.findFirst({
      where: and(
        eq(bookingsTable.customerId, userId),
        eq(bookingsTable.clientRequestId, normalizedClientRequestId),
      ),
    });
    if (existingRequestBooking) {
      res.json({
        booking: sanitizeBookingForViewer(existingRequestBooking as any, role, userId),
        duplicate: true,
      });
      return;
    }

    const activeBlock = await getCustomerActiveWorkBlock(userId);
    if (activeBlock.blocked) {
      res.status(409).json(activeWorkHttpPayload(activeBlock));
      return;
    }

    // Load platform settings once for all policy enforcement below
    const settings = await getPlatformSettings();

    // Require customer GPS coordinates — enforced server-side regardless of client
    const parsedPickedLat = toNumber(pickedLat) ?? toNumber(customerLat) ?? toNumber(latitude);
    const parsedPickedLng = toNumber(pickedLng) ?? toNumber(customerLng) ?? toNumber(longitude);
    if (parsedPickedLat === null || parsedPickedLng === null) {
      res.status(400).json({ error: "Your location is required to create a booking. Please enable location access in your app settings." });
      return;
    }

    // Professional schedule validation: no past jobs and no immediate accidental bookings.
    // Server-side enforcement is mandatory because frontend date pickers can be bypassed.
    const minNoticeMinutes = Math.max(20, Number(settings.minBookingNoticeHours || 0) * 60);
    const dateTimeError = validateFutureBookingDateTime(scheduledDate, scheduledTime, minNoticeMinutes);
    if (dateTimeError) {
      res.status(400).json({ error: dateTimeError });
      return;
    }

    // Enforce daily booking limit per customer from admin settings
    const todayStart = new Date(); todayStart.setUTCHours(0, 0, 0, 0);
    const tomorrowStart = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
    const todayBookingsCount = await db
      .select({ id: bookingsTable.id })
      .from(bookingsTable)
      .where(and(
        eq(bookingsTable.customerId, userId),
        not(eq(bookingsTable.status, "cancelled")),
        gte(bookingsTable.createdAt, todayStart),
        lt(bookingsTable.createdAt, tomorrowStart)
      ));
    if (todayBookingsCount.length >= settings.maxBookingsPerDay) {
      res.status(429).json({ error: `You can only create ${settings.maxBookingsPerDay} booking(s) per day.` });
      return;
    }

    const customer = await db.query.usersTable.findFirst({ where: eq(usersTable.id, userId) });
    const provider = await db.query.usersTable.findFirst({ where: eq(usersTable.id, providerId) });

    if (!customer || !provider) {
      res.status(400).json({ error: "Invalid customer or provider" });
      return;
    }
    if (provider.role !== "provider") {
      res.status(400).json({ error: "Selected user is not a provider" });
      return;
    }
    if (provider.isDeactivated) {
      res.status(400).json({ error: "This provider account is not active" });
      return;
    }
    const radiusMatch = providerWithinRadius(provider, parsedPickedLat, parsedPickedLng);
    if (!radiusMatch.allowed) {
      res.status(400).json({ error: `This address is outside the provider's ${radiusMatch.radiusKm || 15} km service radius.` });
      return;
    }
    if (!(await providerScheduleAllows(provider.id, String(scheduledDate), String(scheduledTime)))) {
      res.status(400).json({ error: "This provider is not available during the selected schedule. Please choose another time." });
      return;
    }

    if (provider.isBlocked || !provider.isAvailable) {
      res.status(400).json({ error: provider.blockedReason || "This provider cannot receive new bookings right now." });
      return;
    }
    if (provider.verificationStatus !== "approved") {
      res.status(400).json({ error: "This provider has not been verified yet and cannot accept bookings." });
      return;
    }

    const providerBlock = await getProviderActiveWorkBlock(provider.id);
    if (providerBlock.blocked) {
      res.status(409).json(activeWorkHttpPayload(providerBlock));
      return;
    }

    // visitCharge: customer-specified travelling charge takes priority; else category; else Rs. 500 default
    const categorySlug = typeof req.body.categorySlug === "string" ? req.body.categorySlug.trim() : null;
    const bodyVisitCharge = toNumber(req.body.visitCharge);
    let visitCharge = 500;
    if (bodyVisitCharge != null && bodyVisitCharge >= 0) {
      // Customer explicitly set travelling charge at booking time
      visitCharge = bodyVisitCharge;
    } else if (categorySlug) {
      const category = await db.query.serviceCategoriesTable.findFirst({
        where: eq(serviceCategoriesTable.slug, categorySlug),
        columns: { visitCharge: true },
      });
      visitCharge = Number(category?.visitCharge ?? 500);
    }

    let categorySuggestedRate: number | null = null;
    if (categorySlug) {
      const categoryForRate = await db.query.serviceCategoriesTable.findFirst({
        where: eq(serviceCategoriesTable.slug, categorySlug),
        columns: { minHourlyRate: true, maxHourlyRate: true, visitCharge: true },
      });
      const minRate = Number((categoryForRate as any)?.minHourlyRate || 0);
      const maxRate = Number((categoryForRate as any)?.maxHourlyRate || 0);
      if (minRate > 0 && maxRate > 0) categorySuggestedRate = Math.round((minRate + maxRate) / 2);
      else if (minRate > 0) categorySuggestedRate = minRate;
      else if (maxRate > 0) categorySuggestedRate = maxRate;
    }
    const parsedPrice = toNumber(price) ?? provider.ratePerHour ?? categorySuggestedRate ?? null;
    const parsedCustomerLat = toNumber(customerLat) ?? parsedPickedLat;
    const parsedCustomerLng = toNumber(customerLng) ?? parsedPickedLng;

    const booking = {
      id: generateId(),
      publicId: generatePublicId(),
      clientRequestId: normalizedClientRequestId,
      customerId: userId,
      customerName: customer.name,
      customerPhone: customer.phone,
      providerId,
      providerName: provider.name,
      providerPhone: provider.phone,
      service: String(service).trim(),
      serviceIcon: serviceIcon || "tool",
      description: description || null,
      attachment: attachment || null,
      videoUrl: typeof videoUrl === "string" && videoUrl.length > 0 ? videoUrl : null,
      address: String(address).trim(),
      scheduledDate: String(scheduledDate),
      scheduledTime: String(scheduledTime),
      status: "pending",
      price: parsedPrice,
      commissionAmount: 0,
      providerAmount: parsedPrice ?? 0,
      commissionRate: 0,
      visitCharge,
      // Snapshot the agreed hourly amount. Future provider profile changes must not alter this job.
      ratePerHour: parsedPrice,
      categorySlug: categorySlug || null,
      pickedLat: parsedPickedLat,
      pickedLng: parsedPickedLng,
      customerLat: parsedCustomerLat,
      customerLng: parsedCustomerLng,
      providerLat: null,
      providerLng: null,
      providerAccuracy: null,
      providerUpdatedAt: null,
      providerArrivedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const [insertedBooking] = await db.insert(bookingsTable)
      .values(booking)
      .onConflictDoNothing()
      .returning();

    if (!insertedBooking) {
      const duplicateBooking = await db.query.bookingsTable.findFirst({
        where: and(
          eq(bookingsTable.customerId, userId),
          eq(bookingsTable.clientRequestId, normalizedClientRequestId),
        ),
      });
      if (duplicateBooking) {
        res.json({
          booking: sanitizeBookingForViewer(duplicateBooking as any, role, userId),
          duplicate: true,
        });
        return;
      }
      res.status(409).json({ error: "This booking request could not be created. Please refresh and try again." });
      return;
    }

    const createdBooking = insertedBooking;

    emitToUser(providerId, "booking:new", { booking: createdBooking });
    emitToUser(userId, "booking:updated", { booking: createdBooking });
    // Broadcast to all admin sockets so the live admin dashboard updates without polling.
    emitToRole("admin", "admin:event", { type: "booking:new", booking: createdBooking });
    notifyUser({
      userId: providerId,
      title: "New booking request",
      body: `${customer.name} requested ${createdBooking.service}`,
      type: "booking",
      link: `/jobs/${createdBooking.id}`,
      data: { bookingId: createdBooking.id, customerId: userId },
    
      email: { category: "booking" },
    }).catch(() => undefined);

    res.json({ booking: sanitizeBookingForViewer(createdBooking as any, role, userId), duplicate: false });
  } catch (e) {
    logger.error({ err: e }, "booking create error");
    res.status(500).json({ error: "Failed to create booking" });
  }
});

router.patch("/:id/status", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { status } = req.body as { status: AllowedStatus };
    const userId = req.user!.userId;
    const role = req.user!.role;

    if (!isAllowedStatus(status)) {
      res.status(400).json({ error: "Invalid booking status" });
      return;
    }

    const existing = await getBookingOr404(req.params.id as string, res);
    if (!existing) return;

    const isCustomerOwner = existing.customerId === userId;
    const isProviderOwner = existing.providerId === userId;

    if (role !== "admin" && !isCustomerOwner && !isProviderOwner) {
      res.status(403).json({ error: "You can only update your own bookings" });
      return;
    }

    if (status === "accepted") {
      if (role !== "provider" || !isProviderOwner) {
        res.status(403).json({ error: "Only the assigned provider can accept this booking" });
        return;
      }
      const provider = await db.query.usersTable.findFirst({ where: eq(usersTable.id, existing.providerId) });
      if (!provider || provider.isBlocked || provider.isDeactivated) {
        res.status(400).json({ error: provider?.blockedReason || "Provider cannot accept jobs right now" });
        return;
      }
      if (provider.verificationStatus !== "approved") {
        res.status(403).json({ error: "Your account must be verified before you can accept jobs." });
        return;
      }
      const providerBlock = await getProviderActiveWorkBlock(existing.providerId, { excludeBookingId: existing.id });
      if (providerBlock.blocked) {
        res.status(409).json(activeWorkHttpPayload(providerBlock));
        return;
      }
    }

    if (["in_progress", "completed"].includes(status) && role !== "admin") {
      res.status(400).json({ error: "Use the secure PIN verification actions to start or complete a booking" });
      return;
    }

    // Enforce cancellation window — customers cannot cancel too close to scheduled time (admin can always override)
    if (status === "cancelled" && role === "customer" && isCustomerOwner) {
      const cancSettings = await getPlatformSettings();
      if (cancSettings.bookingCancellationWindowHours > 0 && existing.scheduledDate && existing.scheduledTime) {
        const scheduledDT = parseScheduledDateTime(existing.scheduledDate, existing.scheduledTime);
        if (scheduledDT) {
          const windowMs = cancSettings.bookingCancellationWindowHours * 60 * 60 * 1000;
          if (scheduledDT.getTime() - Date.now() < windowMs) {
            res.status(400).json({ error: `Bookings cannot be cancelled within ${cancSettings.bookingCancellationWindowHours} hour(s) of the scheduled time. Please contact support.` });
            return;
          }
        }
      }
    }

    // Strict state-machine enforcement (admins can override).
    if (role !== "admin" && !canTransitionBookingStatus(existing.status, status)) {
      res.status(400).json({
        error: `Invalid transition: '${existing.status}' → '${status}'`,
      });
      return;
    }

    // NOTE: `price` is intentionally NOT mutable on /:id/status. Price changes
    // belong in the negotiation/counter-offer flow; allowing arbitrary price
    // updates here let either party silently overwrite the agreed amount.
    const updates: Record<string, unknown> = { status, updatedAt: new Date() };
    if (status === "accepted") {
      updates.startPin = existing.startPin || generatePin();
      if (!existing.startPinExpiresAt || isPinExpired(existing.startPinExpiresAt)) {
        updates.startPinExpiresAt = pinExpiry();
      }
    }

    // Optimistic concurrency guard: update only if the status still matches
    // the value we validated above. This prevents two simultaneous requests
    // from silently overwriting one another after both read the same booking.
    const [updated] = await db.update(bookingsTable)
      .set(updates)
      .where(and(
        eq(bookingsTable.id, req.params.id as string),
        eq(bookingsTable.status, existing.status),
      ))
      .returning();

    if (!updated) {
      res.status(409).json({
        error: "This booking changed while your request was being processed. Please refresh and try again.",
        code: "BOOKING_STATUS_CONFLICT",
      });
      return;
    }

    if (status === "accepted") {
      await db.update(usersTable)
        .set({ isAvailable: false, updatedAt: new Date() })
        .where(eq(usersTable.id, existing.providerId));
      emitToUser(existing.providerId, "provider:availability", { isAvailable: false, reason: "accepted" });
    }
    // If we cancelled out of an active job, free the provider so they
    // aren't stuck "busy" with no active booking.
    if (status === "cancelled" && ["accepted", "in_progress"].includes(existing.status)) {
      await restoreProviderAvailabilityIfCompliant(existing.providerId, "cancelled");
    }
    if (updated) {
      const eventName: EventName =
        status === "cancelled" ? "booking:cancelled" : "booking:status";
      broadcastBookingUpdate(updated, eventName, { status });

      if (status === "accepted") {
        notifyUser({
          userId: updated.customerId,
          title: "Booking accepted",
          body: `${updated.providerName} accepted your ${updated.service} booking`,
          type: "booking",
          link: `/bookings/${updated.id}`,
          data: { bookingId: updated.id },
        
          email: { category: "booking" },
        }).catch(() => undefined);
      } else if (status === "cancelled") {
        const recipientId =
          isProviderOwner ? updated.customerId : updated.providerId;
        const actor = isProviderOwner ? updated.providerName : updated.customerName;
        notifyUser({
          userId: recipientId,
          title: "Booking cancelled",
          body: `${actor} cancelled the ${updated.service} booking`,
          type: "booking",
          link: `/bookings/${updated.id}`,
          data: { bookingId: updated.id },
        
          email: { category: "booking" },
        }).catch(() => undefined);
      }
    }

    res.json({ booking: sanitizeBookingForViewer(updated as any, req.user!.role, req.user!.userId) });
  } catch (e) {
    logger.error({ err: e }, "booking status update error");
    res.status(500).json({ error: "Failed to update booking" });
  }
});

router.patch("/:id/live-location", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    if (process.env.ENABLE_LIVE_TRACKING !== "true") {
      res.status(410).json({
        error: "Live tracking is disabled. Athoo uses static job location, distance, and route preview to keep the app faster and reduce map costs.",
        code: "LIVE_TRACKING_DISABLED",
      });
      return;
    }
    const id = req.params.id as string;
    const userId = req.user!.userId;
    const role = req.user!.role;
    const { providerLat, providerLng, providerAccuracy = null } = req.body as any;

    if (role !== "provider") {
      res.status(403).json({ error: "Only providers can update live location" });
      return;
    }

    const parsedProviderLat = toNumber(providerLat);
    const parsedProviderLng = toNumber(providerLng);
    const parsedProviderAccuracy = toNumber(providerAccuracy);
    if (parsedProviderLat == null || parsedProviderLng == null) {
      res.status(400).json({ error: "providerLat and providerLng are required numbers" });
      return;
    }

    const existing = await getBookingOr404(id, res);
    if (!existing) return;
    if (existing.providerId !== userId) {
      res.status(403).json({ error: "You can only update your own booking location" });
      return;
    }

    await db.update(bookingsTable).set({
      providerLat: parsedProviderLat,
      providerLng: parsedProviderLng,
      providerAccuracy: parsedProviderAccuracy,
      providerUpdatedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(bookingsTable.id, id));

    const updated = await db.query.bookingsTable.findFirst({ where: eq(bookingsTable.id, id) });

    if (updated?.customerId) {
      emitToUser(updated.customerId, "booking:location", {
        bookingId: id,
        providerLat: parsedProviderLat,
        providerLng: parsedProviderLng,
        providerAccuracy: parsedProviderAccuracy,
        providerUpdatedAt: updated.providerUpdatedAt,
      });
    }

    res.json({ booking: sanitizeBookingForViewer(updated as any, req.user!.role, req.user!.userId) });
  } catch (e) {
    logger.error({ err: e }, "booking live location update error");
    res.status(500).json({ error: "Failed to update live location" });
  }
});

// Customer can update the job-site pin to their current GPS (e.g. if they typed wrong address)
router.patch("/:id/customer-location", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id as string;
    const userId = req.user!.userId;
    const role = req.user!.role;
    if (role !== "customer") {
      res.status(403).json({ error: "Only customers can update job location" });
      return;
    }
    const { lat, lng, address } = req.body as any;
    const parsedLat = toNumber(lat);
    const parsedLng = toNumber(lng);
    if (parsedLat == null || parsedLng == null) {
      res.status(400).json({ error: "lat and lng are required numbers" });
      return;
    }
    const existing = await getBookingOr404(id, res);
    if (!existing) return;
    if (existing.customerId !== userId) {
      res.status(403).json({ error: "You can only update your own booking location" });
      return;
    }
    if (!["pending", "accepted", "in_progress"].includes(existing.status)) {
      res.status(400).json({ error: "Cannot update location for a completed or cancelled booking" });
      return;
    }
    if (existing.providerArrivedAt || existing.jobStartedAt || existing.status === "in_progress") {
      res.status(409).json({ error: "Job location is locked after the provider arrives. Contact support if the address is unsafe or incorrect." });
      return;
    }
    const updates: Record<string, any> = {
      pickedLat: parsedLat,
      pickedLng: parsedLng,
      customerLat: parsedLat,
      customerLng: parsedLng,
      updatedAt: new Date(),
    };
    if (typeof address === "string" && address.trim()) {
      updates.address = address.trim();
    }
    await db.update(bookingsTable).set(updates).where(eq(bookingsTable.id, id));
    const updated = await db.query.bookingsTable.findFirst({ where: eq(bookingsTable.id, id) });
    if (updated?.providerId) {
      emitToUser(updated.providerId, "booking:location-updated", {
        bookingId: id,
        customerLat: parsedLat,
        customerLng: parsedLng,
        address: updates.address ?? existing.address,
      });
    }
    res.json({ booking: sanitizeBookingForViewer(updated as any, req.user!.role, req.user!.userId) });
  } catch (e) {
    logger.error({ err: e }, "booking customer location update error");
    res.status(500).json({ error: "Failed to update job location" });
  }
});

router.post("/:id/arrived", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const booking = await getBookingOr404(req.params.id as string, res);
    if (!booking) return;
    const userId = req.user!.userId;
    const role = req.user!.role;
    if (role !== "provider" || booking.providerId !== userId) {
      res.status(403).json({ error: "Only the assigned provider can mark arrival" });
      return;
    }
    if (!["accepted", "in_progress"].includes(String(booking.status))) {
      res.status(400).json({ error: "Only accepted or in-progress bookings can be marked arrived" });
      return;
    }

    const [updated] = await db.update(bookingsTable)
      .set({ providerArrivedAt: new Date(), updatedAt: new Date() })
      .where(and(
        eq(bookingsTable.id, req.params.id as string),
        isNull(bookingsTable.providerArrivedAt),
        inArray(bookingsTable.status, ["accepted", "in_progress"]),
      ))
      .returning();

    if (!updated) {
      const current = await db.query.bookingsTable.findFirst({
        where: eq(bookingsTable.id, req.params.id as string),
      });
      res.json({
        booking: sanitizeBookingForViewer(current as any, req.user!.role, req.user!.userId),
        duplicate: true,
      });
      return;
    }

    broadcastBookingUpdate(updated, "booking:arrived");
    notifyUser({
      userId: updated.customerId,
      title: "Provider arrived",
      body: `${updated.providerName} has arrived at your location`,
      type: "booking",
      link: `/bookings/${updated.id}`,
      data: { bookingId: updated.id },
    
      email: { category: "booking" },
    }).catch(() => undefined);

    res.json({
      booking: sanitizeBookingForViewer(updated as any, req.user!.role, req.user!.userId),
      duplicate: false,
    });
  } catch (e) {
    logger.error({ err: e }, "booking arrived error");
    res.status(500).json({ error: "Failed to mark provider arrival" });
  }
});

router.post("/:id/generate-start-pin", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const booking = await getBookingOr404(req.params.id as string, res);
    if (!booking) return;
    const userId = req.user!.userId;
    const role = req.user!.role;
    // Provider asks for / regenerates the PIN; customer can only view it via the booking record.
    if (booking.providerId !== userId) {
      res.status(403).json({ error: "Only the assigned provider can prepare a start PIN" });
      return;
    }
    if (booking.status !== "accepted") {
      res.status(400).json({ error: "Start PIN can only be prepared for accepted bookings" });
      return;
    }

    // Regenerate PIN if missing or expired; otherwise just refresh the expiry window.
    const force = (req.body as any)?.regenerate === true;
    const expired = isPinExpired(booking.startPinExpiresAt);
    const pin = (force || !booking.startPin || expired) ? generatePin() : booking.startPin;
    await db.update(bookingsTable).set({
      startPin: pin,
      startPinExpiresAt: pinExpiry(),
      updatedAt: new Date(),
    }).where(eq(bookingsTable.id, req.params.id as string));
    const updated = await db.query.bookingsTable.findFirst({ where: eq(bookingsTable.id, req.params.id as string) });
    if (updated) {
      // Push fresh booking (with new PIN visible) to the customer in real time.
      broadcastBookingUpdate(updated, "booking:updated");
    }
    // NEVER include the raw PIN in the provider-facing response — sanitize hides it.
    res.json({
      booking: sanitizeBookingForViewer(updated as any, role, userId),
      pinPrepared: true,
      expiresAt: updated?.startPinExpiresAt,
    });
  } catch (e) {
    logger.error({ err: e }, "generate-start-pin error");
    res.status(500).json({ error: "Failed to prepare start PIN" });
  }
});

router.post("/:id/verify-start-pin", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { pin } = req.body as { pin: string };
    const userId = req.user!.userId;
    const booking = await getBookingOr404(req.params.id as string, res);
    if (!booking) return;
    if (booking.providerId !== userId) {
      res.status(403).json({ error: "Only the assigned provider can verify the start PIN" });
      return;
    }
    if (booking.status !== "accepted") {
      res.status(400).json({ error: "Only accepted bookings can be started" });
      return;
    }
    if (!booking.startPin) {
      res.status(400).json({ error: "No active PIN. Tap 'Generate PIN' to ask the customer for a new code." });
      return;
    }
    if (isPinExpired(booking.startPinExpiresAt)) {
      res.status(400).json({ error: "This PIN has expired. Generate a new one." });
      return;
    }
    if (booking.startPin !== String(pin || "").trim()) {
      res.status(400).json({ error: "Incorrect PIN. Ask customer for the 4-digit code shown in their app." });
      return;
    }

    const [startedBooking] = await db.update(bookingsTable)
      .set({
        status: "in_progress",
        jobStartedAt: new Date(),
        startPin: null,
        startPinExpiresAt: null,
        updatedAt: new Date(),
      })
      .where(and(
        eq(bookingsTable.id, req.params.id as string),
        eq(bookingsTable.status, "accepted"),
        eq(bookingsTable.startPin, String(pin || "").trim()),
        gte(bookingsTable.startPinExpiresAt, new Date()),
      ))
      .returning();
    if (!startedBooking) {
      res.status(409).json({
        error: "This booking was already started or the PIN changed. Please refresh and try again.",
        code: "BOOKING_START_CONFLICT",
      });
      return;
    }
    // Auto-busy: provider can't accept new requests while a job is in progress.
    await db.update(usersTable)
      .set({ isAvailable: false, updatedAt: new Date() })
      .where(eq(usersTable.id, booking.providerId));
    const updated = await db.query.bookingsTable.findFirst({ where: eq(bookingsTable.id, req.params.id as string) });

    if (updated) {
      broadcastBookingUpdate(updated, "booking:started");
      // Tell the provider's app the availability flipped so the toggle re-renders.
      emitToUser(updated.providerId, "provider:availability", { isAvailable: false, reason: "in_progress" });
      notifyUser({
        userId: updated.customerId,
        title: "Job started",
        body: `${updated.providerName} started your ${updated.service} job`,
        type: "booking",
        link: `/bookings/${updated.id}`,
        data: { bookingId: updated.id },
      
        email: { category: "booking" },
      }).catch(() => undefined);
    }

    res.json({ booking: sanitizeBookingForViewer(updated as any, req.user!.role, req.user!.userId) });
  } catch (e) {
    logger.error({ err: e }, "verify-start-pin error");
    res.status(500).json({ error: "Failed to verify start PIN" });
  }
});

router.post("/:id/generate-complete-pin", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const booking = await getBookingOr404(req.params.id as string, res);
    if (!booking) return;
    const userId = req.user!.userId;
    const role = req.user!.role;
    if (booking.providerId !== userId) {
      res.status(403).json({ error: "Only the assigned provider can generate a completion PIN" });
      return;
    }
    if (booking.status !== "in_progress") {
      res.status(400).json({ error: "Completion PIN can only be generated for in-progress bookings" });
      return;
    }

    // Always cycle a fresh PIN on regenerate; reuse a still-valid one otherwise.
    const force = (req.body as any)?.regenerate === true;
    const expired = isPinExpired(booking.completePinExpiresAt);
    const pin = (force || !booking.completePin || expired) ? generatePin() : booking.completePin;
    await db.update(bookingsTable).set({
      completePin: pin,
      completePinExpiresAt: pinExpiry(),
      updatedAt: new Date(),
    }).where(eq(bookingsTable.id, req.params.id as string));
    const updated = await db.query.bookingsTable.findFirst({ where: eq(bookingsTable.id, req.params.id as string) });
    if (updated) {
      // Broadcast so the customer's screen updates with the in-app PIN immediately.
      broadcastBookingUpdate(updated, "booking:updated");
    }
    // NEVER include the raw PIN in the provider-facing response — it must come from the customer.
    res.json({
      booking: sanitizeBookingForViewer(updated as any, role, userId),
      pinPrepared: true,
      expiresAt: updated?.completePinExpiresAt,
    });
  } catch (e) {
    logger.error({ err: e }, "generate-complete-pin error");
    res.status(500).json({ error: "Failed to generate complete PIN" });
  }
});

router.post("/:id/verify-complete-pin", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { pin } = req.body as { pin: string };
    const userId = req.user!.userId;
    const booking = await getBookingOr404(req.params.id as string, res);
    if (!booking) return;
    if (booking.providerId !== userId) {
      res.status(403).json({ error: "Only the assigned provider can verify the completion PIN" });
      return;
    }
    if (booking.status !== "in_progress") {
      res.status(400).json({ error: "Only in-progress bookings can be completed" });
      return;
    }
    if (!booking.completePin) {
      res.status(400).json({ error: "No active PIN. Tap 'Generate PIN' so the customer can read out a fresh code." });
      return;
    }
    if (isPinExpired(booking.completePinExpiresAt)) {
      res.status(400).json({ error: "This PIN has expired. Generate a new one." });
      return;
    }
    if (booking.completePin !== String(pin || "").trim()) {
      res.status(400).json({ error: "Incorrect PIN. Ask customer for the 4-digit code shown in their app." });
      return;
    }

    const completion = await completeBookingWithInvoice({
      bookingId: req.params.id as string,
      providerId: userId,
      completionPin: String(pin || "").trim(),
    });
    if (!("booking" in completion)) {
      const code = "code" in completion ? completion.code : undefined;
      res.status(completion.status).json({ error: completion.error, ...(code ? { code } : {}) });
      return;
    }
    const updated = completion.booking;

    if (updated) {
      await restoreProviderAvailabilityIfCompliant(updated.providerId, "completed");
      broadcastBookingUpdate(updated, "booking:completed");
      notifyUser({
        userId: updated.customerId,
        title: "Job completed",
        body: `Please rate your ${updated.service} experience with ${updated.providerName}`,
        type: "booking",
        link: `/bookings/${updated.id}`,
        data: { bookingId: updated.id },
      
        email: { category: "booking" },
      }).catch(() => undefined);
    }

    res.json({ booking: sanitizeBookingForViewer(updated as any, req.user!.role, req.user!.userId) });
  } catch (e) {
    logger.error({ err: e }, "verify-complete-pin error");
    res.status(500).json({ error: "Failed to verify complete PIN" });
  }
});

// ─── Mark as Paid (customer confirms cash handed to provider) ─────────────────
router.post("/:id/mark-paid", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const booking = await getBookingOr404(req.params.id as string, res);
    if (!booking) return;
    if (booking.customerId !== userId) {
      res.status(403).json({ error: "Only the customer can mark payment as paid" });
      return;
    }
    if (booking.status !== "completed") {
      res.status(400).json({ error: "Only completed bookings can be marked as paid" });
      return;
    }
    if (["paid", "received"].includes(String(booking.paymentStatus))) {
      res.json({ booking: sanitizeBookingForViewer(booking as any, req.user!.role, req.user!.userId), duplicate: true });
      return;
    }
    const updated = await db.transaction(async (tx) => {
      const [changed] = await tx.update(bookingsTable)
        .set({ paymentStatus: "paid", paidAt: new Date(), updatedAt: new Date() })
        .where(and(eq(bookingsTable.id, req.params.id as string), eq(bookingsTable.paymentStatus, "pending")))
        .returning();
      if (!changed) return null;
      await tx.update(invoicesTable).set({ status: "paid", updatedAt: new Date() }).where(eq(invoicesTable.bookingId, changed.id));
      return changed;
    });
    if (!updated) {
      res.status(409).json({ error: "Payment state changed on another device" });
      return;
    }
    if (updated) {
      notifyUser({
        userId: updated.providerId,
        title: "Payment Confirmed",
        body: `${updated.customerName} confirmed cash payment of Rs. ${updated.price || 0} for ${updated.service}.`,
        type: "booking",
        link: `/bookings/${updated.id}`,
        data: { bookingId: updated.id },
      
        email: { category: "booking" },
      }).catch(() => undefined);
      broadcastBookingUpdate(updated, "booking:updated");
    }
    res.json({ booking: sanitizeBookingForViewer(updated as any, req.user!.role, req.user!.userId), duplicate: false });
  } catch (e) {
    logger.error({ err: e }, "mark-paid error");
    res.status(500).json({ error: "Failed to mark booking as paid" });
  }
});

// ─── Mark as Received (provider confirms cash received from customer) ─────────
router.post("/:id/mark-received", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const booking = await getBookingOr404(req.params.id as string, res);
    if (!booking) return;
    if (booking.providerId !== userId) {
      res.status(403).json({ error: "Only the provider can mark payment as received" });
      return;
    }
    if (booking.status !== "completed") {
      res.status(400).json({ error: "Only completed bookings can be marked as received" });
      return;
    }
    if (booking.paymentStatus === "received") {
      res.json({ booking: sanitizeBookingForViewer(booking as any, req.user!.role, req.user!.userId), duplicate: true });
      return;
    }
    const updated = await db.transaction(async (tx) => {
      const [changed] = await tx.update(bookingsTable)
        .set({ paymentStatus: "received", receivedAt: new Date(), paidAt: booking.paidAt || new Date(), updatedAt: new Date() })
        .where(and(eq(bookingsTable.id, req.params.id as string), inArray(bookingsTable.paymentStatus, ["pending", "paid"])))
        .returning();
      if (!changed) return null;
      await tx.update(invoicesTable).set({ status: "paid", updatedAt: new Date() }).where(eq(invoicesTable.bookingId, changed.id));
      return changed;
    });
    if (!updated) {
      res.status(409).json({ error: "Payment state changed on another device" });
      return;
    }
    if (updated) {
      notifyUser({
        userId: updated.customerId,
        title: "Payment Received",
        body: `${updated.providerName} confirmed receiving cash payment for ${updated.service}.`,
        type: "booking",
        link: `/bookings/${updated.id}`,
        data: { bookingId: updated.id },
      
        email: { category: "booking" },
      }).catch(() => undefined);
      broadcastBookingUpdate(updated, "booking:updated");
    }
    res.json({ booking: sanitizeBookingForViewer(updated as any, req.user!.role, req.user!.userId), duplicate: false });
  } catch (e) {
    logger.error({ err: e }, "mark-received error");
    res.status(500).json({ error: "Failed to mark booking as received" });
  }
});

router.patch("/:id/rate", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const updated = await submitBookingReview({
      bookingId: req.params.id as string,
      customerId: req.user!.userId,
      rating: req.body?.rating,
      review: req.body?.review,
    });
    res.json({ booking: sanitizeBookingForViewer(updated as any, req.user!.role, req.user!.userId) });
  } catch (e) {
    if (e instanceof ReviewSubmissionError) {
      res.status(e.status).json({ error: e.message });
      return;
    }
    logger.error({ err: e }, "rate-booking error");
    res.status(500).json({ error: "Failed to rate booking" });
  }
});

// Provider counter-offer on a direct booking.
// Creates a negotiation with status="provider_counter" linked to the booking.
router.post("/:id/counter", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    if (req.user!.role !== "provider") {
      res.status(403).json({ error: "Only providers can submit a counter offer" });
      return;
    }
    const booking = await getBookingOr404(req.params.id as string, res);
    if (!booking) return;
    if (booking.providerId !== userId) {
      res.status(403).json({ error: "This booking was not assigned to you" });
      return;
    }
    if (booking.status !== "pending") {
      res.status(400).json({ error: "Counter offers can only be sent on pending bookings" });
      return;
    }
    const amount = typeof req.body.amount === "number" ? Math.round(req.body.amount) : parseInt(String(req.body.amount), 10);
    if (!amount || amount < 50) {
      res.status(400).json({ error: "A valid counter amount (minimum Rs. 50) is required" });
      return;
    }
    const message = typeof req.body.message === "string" ? req.body.message.trim() : "";

    // Validate provider eligibility before either auto-accepting or creating a counter.
    // This prevents the same-price shortcut from bypassing verification, blocking,
    // deactivation, or active-job restrictions.
    const provider = await db.query.usersTable.findFirst({ where: eq(usersTable.id, userId) });
    if (!provider) {
      res.status(404).json({ error: "Provider not found" });
      return;
    }
    if (provider.isBlocked || provider.isDeactivated) {
      res.status(403).json({ error: provider.blockedReason || "Your account cannot send counter offers right now" });
      return;
    }
    if (provider.verificationStatus !== "approved") {
      res.status(403).json({ error: "Only verified providers can submit counter offers." });
      return;
    }
    const providerBlock = await getProviderActiveWorkBlock(userId, { excludeBookingId: booking.id });
    if (providerBlock.blocked) {
      res.status(409).json(activeWorkHttpPayload(providerBlock));
      return;
    }

    // If provider accepts the customer's same amount, do NOT create a second
    // customer-approval step. Mark booking accepted immediately.
    if ((booking.price ?? 0) > 0 && amount === booking.price) {
      const updates: Record<string, unknown> = {
        status: "accepted",
        startPin: booking.startPin || generatePin(),
        startPinExpiresAt: booking.startPinExpiresAt && !isPinExpired(booking.startPinExpiresAt) ? booking.startPinExpiresAt : pinExpiry(),
        updatedAt: new Date(),
      };
      const [updated] = await db.update(bookingsTable)
        .set(updates)
        .where(and(
          eq(bookingsTable.id, booking.id),
          eq(bookingsTable.status, "pending"),
        ))
        .returning();
      if (!updated) {
        res.status(409).json({
          error: "This booking changed while your offer was being processed. Please refresh and try again.",
          code: "BOOKING_ACCEPT_CONFLICT",
        });
        return;
      }
      await db.update(usersTable)
        .set({ isAvailable: false, updatedAt: new Date() })
        .where(eq(usersTable.id, userId));
      emitToUser(userId, "provider:availability", { isAvailable: false, reason: "accepted" });
      if (updated) {
        broadcastBookingUpdate(updated, "booking:accepted", { status: "accepted" });
        notifyUser({
          userId: updated.customerId,
          title: "Booking accepted",
          body: `${updated.providerName} accepted your ${updated.service} booking at Rs. ${amount.toLocaleString()}.`,
          type: "booking",
          link: `/bookings/${updated.id}`,
          data: { bookingId: updated.id },
        
          email: { category: "booking" },
        }).catch(() => undefined);
      }
      res.json({
        booking: sanitizeBookingForViewer(updated as any, req.user!.role, req.user!.userId),
        autoAccepted: true,
      });
      return;
    }

    const messages = [
      {
        id: crypto.randomUUID(),
        senderId: userId,
        senderName: provider.name,
        text: message || `I'd like to charge Rs. ${amount.toLocaleString()} for this job.`,
        timestamp: new Date().toISOString(),
      },
    ];
    const neg = await db.insert(negotiationsTable).values({
      id: crypto.randomUUID(),
      customerId: booking.customerId,
      customerName: booking.customerName,
      providerId: userId,
      providerName: provider.name,
      service: booking.service,
      customerOffer: booking.price ?? 0,
      providerCounter: amount,
      status: "provider_counter",
      bookingId: booking.id,
      address: booking.address,
      scheduledDate: booking.scheduledDate,
      scheduledTime: booking.scheduledTime,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5-min window
      messages,
    }).returning();
    const negotiation = neg[0];
    emitToUser(booking.customerId, "negotiation:new", { negotiation });
    notifyUser({
      userId: booking.customerId,
      title: "Provider Counter Offer",
      body: `${provider.name} proposed Rs. ${amount.toLocaleString()} for ${booking.service}.`,
      type: "booking",
      data: { bookingId: booking.id },
    
      email: { category: "booking" },
    });
    res.status(201).json({ negotiation });
  } catch (e) {
    logger.error({ err: e }, "booking-counter error");
    res.status(500).json({ error: "Failed to submit counter offer" });
  }
});

export default router;

