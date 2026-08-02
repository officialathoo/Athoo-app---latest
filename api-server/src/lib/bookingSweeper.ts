import { db } from "@workspace/db";
import { bookingsTable, usersTable, negotiationsTable, userSubscriptionsTable } from "@workspace/db/schema";
import { and, asc, eq, isNull, isNotNull, lt, ne, sql } from "drizzle-orm";
import { emitToUser } from "./eventBus";
import { notifyUser } from "./notifications";
import { logger } from "./logger";
import { sweepInactiveAccounts } from "./inactivityLifecycle";
import {
  restoreProviderAvailabilityIfCompliant,
  sweepProviderDocumentCompliance,
} from "./documentCompliance";
import { getBookingTimeZone, getNoShowEligibleAt, parseScheduledDateTime } from "../domain/booking-schedule";

function boundedIntegerFromEnv(name: string, fallback: number, minimum: number, maximum: number): number {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}`);
  }
  return value;
}

function booleanFromEnv(name: string, fallback: boolean): boolean {
  const raw = String(process.env[name] ?? fallback).trim().toLowerCase();
  if (raw === "true") return true;
  if (raw === "false") return false;
  throw new Error(`${name} must be true or false`);
}

// Current Athoo policy does not automatically cancel an accepted job merely
// because the arrival button was not pressed. Operations may opt in later, but
// the safe path remains schedule-aware, bounded, and race-protected.
const NO_SHOW_AUTO_CANCEL_ENABLED = booleanFromEnv("BOOKING_NO_SHOW_AUTO_CANCEL_ENABLED", false);
const NO_SHOW_GRACE_MS = boundedIntegerFromEnv("BOOKING_NO_SHOW_GRACE_MINUTES", 30, 5, 240) * 60 * 1000;
const NO_SHOW_SWEEP_BATCH_SIZE = boundedIntegerFromEnv("BOOKING_NO_SHOW_SWEEP_BATCH_SIZE", 100, 1, 500);
const BOOKING_TIME_ZONE = getBookingTimeZone();
// Pending bookings (no provider has accepted) auto-cancel after 10 minutes.
const PENDING_GRACE_MS = 10 * 60 * 1000;
// Push the rating reminder 30 minutes after a job completes (only once).
const RATING_REMINDER_MS = 30 * 60 * 1000;
// 2 no-shows in 24h → 60-minute matching cooldown.
const NOSHOW_COOLDOWN_THRESHOLD = 2;
const NOSHOW_COOLDOWN_MS = 60 * 60 * 1000;
const SWEEP_INTERVAL_MS = Number(process.env.BOOKING_SWEEP_INTERVAL_MS || 60 * 1000);
const SWEEPER_LOCK_ID = 842_026_071;
let sweeperHandle: NodeJS.Timeout | null = null;
let sweepRunning = false;
let lastStartedAt: Date | null = null;
let lastCompletedAt: Date | null = null;
let lastDurationMs: number | null = null;
let lastError: string | null = null;

// Penalise a provider for a no-show: bump count and, if they cross the 24h
// threshold, place them on a temporary matching cooldown.
export async function applyNoShowPenalty(providerId: string): Promise<void> {
  if (!providerId) return;
  try {
    const provider = await db.query.usersTable.findFirst({
      where: eq(usersTable.id, providerId),
    });
    if (!provider) return;
    const within24h = provider.cooldownUntil && provider.cooldownUntil.getTime() > Date.now() - 24 * 60 * 60 * 1000;
    const newCount = (provider.noShowCount || 0) + 1;
    const cooldownUntil = newCount >= NOSHOW_COOLDOWN_THRESHOLD
      ? new Date(Date.now() + NOSHOW_COOLDOWN_MS)
      : within24h ? provider.cooldownUntil : null;
    await db.update(usersTable)
      .set({ noShowCount: newCount, cooldownUntil, updatedAt: new Date() })
      .where(eq(usersTable.id, providerId));
    if (cooldownUntil) {
      emitToUser(providerId, "notification:new", { type: "cooldown", until: cooldownUntil });
      notifyUser({
        userId: providerId,
        title: "Temporary cooldown",
        body: `Multiple no-shows detected. You won't receive new requests until ${cooldownUntil.toLocaleTimeString()}.`,
        type: "system",
        data: { cooldownUntil },
      }).catch(() => undefined);
    }
  } catch (e) {
    logger.error({ err: e, providerId }, "applyNoShowPenalty failed");
  }
}

async function sweepStuckAcceptedBookings(): Promise<number> {
  if (!NO_SHOW_AUTO_CANCEL_ENABLED) return 0;

  const now = new Date();
  const cutoff = new Date(now.getTime() - NO_SHOW_GRACE_MS);

  // Only read a bounded set of old accepted rows. The final decision is based
  // on the configured local scheduled start, never just record age.
  const candidates = await db
    .select()
    .from(bookingsTable)
    .where(
      and(
        eq(bookingsTable.status, "accepted"),
        isNull(bookingsTable.providerArrivedAt),
        lt(bookingsTable.updatedAt, cutoff)
      )
    )
    .orderBy(
      asc(bookingsTable.scheduledDate),
      asc(bookingsTable.scheduledTime),
      asc(bookingsTable.updatedAt),
    )
    .limit(NO_SHOW_SWEEP_BATCH_SIZE);

  if (candidates.length === 0) return 0;

  let cancelledCount = 0;
  for (const booking of candidates) {
    try {
      const eligibleAt = getNoShowEligibleAt({
        scheduledDate: booking.scheduledDate,
        scheduledTime: booking.scheduledTime,
        acceptedOrLastActivityAt: booking.updatedAt,
        graceMs: NO_SHOW_GRACE_MS,
        timeZone: BOOKING_TIME_ZONE,
      });
      if (!eligibleAt) {
        logger.warn({ bookingId: booking.id }, "bookingSweeper: invalid schedule; skipped no-show cancellation");
        continue;
      }
      if (eligibleAt.getTime() > now.getTime()) continue;

      // Re-check status, arrival and activity in the write itself. An arrival or
      // any concurrent booking update wins instead of being overwritten.
      const [cancelled] = await db
        .update(bookingsTable)
        .set({ status: "cancelled", updatedAt: now })
        .where(and(
          eq(bookingsTable.id, booking.id),
          eq(bookingsTable.status, "accepted"),
          isNull(bookingsTable.providerArrivedAt),
          lt(bookingsTable.updatedAt, cutoff),
        ))
        .returning();
      if (!cancelled) continue;

      cancelledCount += 1;

      if (cancelled.providerId) {
        await restoreProviderAvailabilityIfCompliant(cancelled.providerId, "auto_cancelled");
        await applyNoShowPenalty(cancelled.providerId);
      }

      const payload = { bookingId: cancelled.id, reason: "no_show" };
      emitToUser(cancelled.customerId, "booking:cancelled", payload);
      emitToUser(cancelled.providerId, "booking:cancelled", payload);

      notifyUser({
        userId: cancelled.customerId,
        title: "Booking auto-cancelled",
        body: `${cancelled.providerName} has not been marked arrived after the scheduled time and grace period. You can re-request the service.`,
        type: "booking",
        link: `/bookings/${cancelled.id}`,
        data: { bookingId: cancelled.id, reason: "no_show" },
      }).catch(() => undefined);
      notifyUser({
        userId: cancelled.providerId,
        title: "Booking auto-cancelled",
        body: `Your accepted ${cancelled.service} booking was cancelled because no arrival was confirmed after the scheduled time and grace period.`,
        type: "booking",
        link: `/bookings/${cancelled.id}`,
        data: { bookingId: cancelled.id, reason: "no_show" },
      }).catch(() => undefined);
    } catch (e) {
      logger.error({ err: e, bookingId: booking.id }, "bookingSweeper: failed to auto-cancel");
    }
  }

  if (cancelledCount > 0) {
    logger.info(
      { count: cancelledCount, examined: candidates.length, timeZone: BOOKING_TIME_ZONE },
      "bookingSweeper: auto-cancelled schedule-eligible no-show bookings",
    );
  }
  return cancelledCount;
}

// Pending bookings that no provider has picked up after the grace period
// auto-cancel — frees the customer to re-post and keeps stale requests off
// provider feeds.
async function sweepStalePendingBookings(): Promise<number> {
  const cutoff = new Date(Date.now() - PENDING_GRACE_MS);
  const stale = await db
    .select()
    .from(bookingsTable)
    .where(
      and(
        eq(bookingsTable.status, "pending"),
        lt(bookingsTable.createdAt, cutoff)
      )
    );
  if (stale.length === 0) return 0;
  let expiredCount = 0;
  for (const booking of stale) {
    try {
      const scheduledAt = parseScheduledDateTime(
        booking.scheduledDate,
        booking.scheduledTime,
        BOOKING_TIME_ZONE,
      );
      const createdAtMs = booking.createdAt ? new Date(booking.createdAt).getTime() : Date.now();
      const expiryAtMs = Math.max(
        Number.isFinite(createdAtMs) ? createdAtMs + PENDING_GRACE_MS : Date.now(),
        scheduledAt ? scheduledAt.getTime() + PENDING_GRACE_MS : 0,
      );
      // Future scheduled work must remain available until after its scheduled
      // start. The old created-at-only rule cancelled tomorrow's jobs in ten
      // minutes even though the provider still had time to accept.
      if (expiryAtMs > Date.now()) continue;

      const [cancelled] = await db
        .update(bookingsTable)
        .set({ status: "cancelled", updatedAt: new Date() })
        .where(and(eq(bookingsTable.id, booking.id), eq(bookingsTable.status, "pending")))
        .returning({ id: bookingsTable.id });
      if (!cancelled) continue;
      expiredCount += 1;
      const payload = { bookingId: booking.id, reason: "no_provider" };
      emitToUser(booking.customerId, "booking:cancelled", payload);
      notifyUser({
        userId: booking.customerId,
        title: "No providers responded",
        body: `Your ${booking.service} request expired. Try again or broaden your area.`,
        type: "booking",
        link: `/bookings/${booking.id}`,
        data: { bookingId: booking.id, reason: "no_provider" },
      }).catch(() => undefined);
    } catch (e) {
      logger.error({ err: e, bookingId: booking.id }, "bookingSweeper: failed to expire pending booking");
    }
  }
  if (expiredCount > 0) {
    logger.info({ count: expiredCount, examined: stale.length }, "bookingSweeper: expired stale pending bookings");
  }
  return expiredCount;
}

// 30 minutes after a job completes, ping the customer to leave a rating —
// once. Stamped on the booking so we never double-prompt.
async function sweepRatingReminders(): Promise<number> {
  const cutoff = new Date(Date.now() - RATING_REMINDER_MS);
  const due = await db
    .select()
    .from(bookingsTable)
    .where(
      and(
        eq(bookingsTable.status, "completed"),
        isNull(bookingsTable.rating),
        isNull(bookingsTable.ratingReminderSentAt),
        lt(bookingsTable.updatedAt, cutoff)
      )
    );
  if (due.length === 0) return 0;
  for (const booking of due) {
    try {
      await db
        .update(bookingsTable)
        .set({ ratingReminderSentAt: new Date() })
        .where(eq(bookingsTable.id, booking.id));
      notifyUser({
        userId: booking.customerId,
        title: "Rate your experience",
        body: `How was your ${booking.service} job with ${booking.providerName}? Your rating helps the community.`,
        type: "booking",
        link: `/bookings/${booking.id}`,
        data: { bookingId: booking.id, prompt: "rate" },
      }).catch(() => undefined);
      emitToUser(booking.customerId, "notification:new", { bookingId: booking.id, prompt: "rate" });
    } catch (e) {
      logger.error({ err: e, bookingId: booking.id }, "bookingSweeper: failed to send rating reminder");
    }
  }
  logger.info({ count: due.length }, "bookingSweeper: sent rating reminders");
  return due.length;
}

// Lift cooldowns whose deadline has passed.
async function clearExpiredCooldowns(): Promise<number> {
  const now = new Date();
  const result = await db
    .update(usersTable)
    .set({ cooldownUntil: null, updatedAt: now })
    .where(and(isNotNull(usersTable.cooldownUntil), lt(usersTable.cooldownUntil, now)));
  // Drizzle's update returns no count by default; we just no-op silently.
  void result; void sql;
  return 0;
}

// Scheduled-job reminders are sent to both parties on the job day and again
// five hours before start. Persisted stamps and conditional updates make these
// safe across multiple API instances and restarts.
const PRE_JOB_REMINDER_WINDOW_MS = 5 * 60 * 60 * 1000;
const PRE_JOB_REMINDER_MIN_MS = 15 * 60 * 1000;
const PRE_JOB_REMINDER_BATCH_SIZE = boundedIntegerFromEnv("PRE_JOB_REMINDER_BATCH_SIZE", 200, 1, 500);

function localDateKey(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

async function sweepScheduledDayReminders(): Promise<number> {
  const now = new Date();
  const today = localDateKey(now, BOOKING_TIME_ZONE);
  const due = await db
    .select()
    .from(bookingsTable)
    .where(and(
      eq(bookingsTable.status, "accepted"),
      isNull(bookingsTable.scheduledDayReminderSentAt),
      eq(bookingsTable.scheduledDate, today),
      isNotNull(bookingsTable.scheduledTime),
    ))
    .orderBy(asc(bookingsTable.scheduledTime))
    .limit(PRE_JOB_REMINDER_BATCH_SIZE);

  let sent = 0;
  for (const booking of due) {
    try {
      const scheduledAt = parseScheduledDateTime(booking.scheduledDate || "", booking.scheduledTime || "");
      if (!scheduledAt) continue;
      const msUntil = scheduledAt.getTime() - now.getTime();
      // Do not emit two reminders together when the first sweep happens inside
      // the five-hour window; the five-hour reminder below is more useful.
      if (msUntil <= PRE_JOB_REMINDER_WINDOW_MS) continue;
      const claimed = await db.update(bookingsTable)
        .set({ scheduledDayReminderSentAt: now })
        .where(and(eq(bookingsTable.id, booking.id), isNull(bookingsTable.scheduledDayReminderSentAt)))
        .returning({ id: bookingsTable.id });
      if (!claimed.length) continue;

      notifyUser({
        userId: booking.customerId,
        title: "Scheduled job today",
        body: `${booking.providerName} is scheduled for ${booking.service} today at ${booking.scheduledTime}.`,
        type: "booking",
        link: `/bookings/${booking.id}`,
        data: { bookingId: booking.id, reminder: "scheduled_day" },
      }).catch(() => undefined);
      notifyUser({
        userId: booking.providerId,
        title: "Scheduled job today",
        body: `You have a ${booking.service} job today at ${booking.scheduledTime}, ${booking.address}.`,
        type: "booking",
        link: `/jobs/${booking.id}`,
        data: { bookingId: booking.id, reminder: "scheduled_day" },
      }).catch(() => undefined);
      sent += 1;
    } catch (error) {
      logger.error({ err: error, bookingId: booking.id }, "bookingSweeper: scheduled-day reminder failed");
    }
  }
  if (sent) logger.info({ count: sent }, "bookingSweeper: sent scheduled-day reminders");
  return sent;
}

async function sweepPreJobReminders(): Promise<number> {
  const now = new Date();
  const due = await db
    .select()
    .from(bookingsTable)
    .where(and(
      eq(bookingsTable.status, "accepted"),
      isNull(bookingsTable.preJobReminderSentAt),
      isNotNull(bookingsTable.scheduledDate),
      isNotNull(bookingsTable.scheduledTime),
    ))
    .orderBy(asc(bookingsTable.scheduledDate), asc(bookingsTable.scheduledTime))
    .limit(PRE_JOB_REMINDER_BATCH_SIZE);

  let sent = 0;
  for (const booking of due) {
    try {
      const scheduledAt = parseScheduledDateTime(booking.scheduledDate || "", booking.scheduledTime || "");
      if (!scheduledAt) continue;
      const msUntil = scheduledAt.getTime() - now.getTime();
      if (msUntil < PRE_JOB_REMINDER_MIN_MS || msUntil > PRE_JOB_REMINDER_WINDOW_MS) continue;
      const claimed = await db.update(bookingsTable)
        .set({ preJobReminderSentAt: now })
        .where(and(eq(bookingsTable.id, booking.id), isNull(bookingsTable.preJobReminderSentAt)))
        .returning({ id: bookingsTable.id });
      if (!claimed.length) continue;

      notifyUser({
        userId: booking.customerId,
        title: "Job starts within five hours",
        body: `${booking.providerName} is scheduled for ${booking.service} at ${booking.scheduledTime}.`,
        type: "booking",
        link: `/bookings/${booking.id}`,
        data: { bookingId: booking.id, reminder: "five_hours" },
      }).catch(() => undefined);
      notifyUser({
        userId: booking.providerId,
        title: "Job starts within five hours",
        body: `${booking.service} is scheduled at ${booking.scheduledTime}. Review the route to ${booking.address}.`,
        type: "booking",
        link: `/jobs/${booking.id}`,
        data: { bookingId: booking.id, reminder: "five_hours" },
      }).catch(() => undefined);
      sent += 1;
    } catch (error) {
      logger.error({ err: error, bookingId: booking.id }, "bookingSweeper: five-hour reminder failed");
    }
  }
  if (sent) logger.info({ count: sent }, "bookingSweeper: sent five-hour reminders");
  return sent;
}

// ─── Premium plan expiry ──────────────────────────────────────────────────────
const PREMIUM_EXPIRY_WARNING_MS = 3 * 24 * 60 * 60 * 1000; // 3 days

async function sweepExpiredPremiumPlans(): Promise<number> {
  const now = new Date();
  const expired = await db
    .select()
    .from(usersTable)
    .where(
      and(
        eq(usersTable.isPremium, true),
        isNotNull(usersTable.premiumExpiresAt),
        lt(usersTable.premiumExpiresAt, now)
      )
    );

  if (expired.length === 0) return 0;

  for (const user of expired) {
    try {
      await db
        .update(usersTable)
        .set({ isPremium: false, premiumReminderSentAt: null, updatedAt: now })
        .where(eq(usersTable.id, user.id));

      // Finalize the matching user_subscriptions row so subscription history and
      // admin review reflect the terminal state (this previously only updated
      // usersTable, leaving the subscription row stuck at active/cancellation_scheduled
      // forever). Guarded by the row's current status so a re-run of this sweep
      // (or overlap between ticks) cannot double-transition it.
      const activeRow = await db.query.userSubscriptionsTable.findFirst({
        where: and(eq(userSubscriptionsTable.userId, user.id), eq(userSubscriptionsTable.status, "active")),
      });
      if (activeRow) {
        await db.update(userSubscriptionsTable).set({ status: "expired", updatedAt: now })
          .where(and(eq(userSubscriptionsTable.id, activeRow.id), eq(userSubscriptionsTable.status, "active")));
      } else {
        const scheduledRow = await db.query.userSubscriptionsTable.findFirst({
          where: and(eq(userSubscriptionsTable.userId, user.id), eq(userSubscriptionsTable.status, "cancellation_scheduled")),
        });
        if (scheduledRow) {
          await db.update(userSubscriptionsTable).set({ status: "cancelled", updatedAt: now })
            .where(and(eq(userSubscriptionsTable.id, scheduledRow.id), eq(userSubscriptionsTable.status, "cancellation_scheduled")));
        }
      }

      notifyUser({
        userId: user.id,
        title: "Premium Plan Expired",
        body: "Your Athoo Premium plan has expired. Renew now to keep enjoying premium benefits.",
        type: "system",
        data: { action: "renew_premium" },
      }).catch(() => undefined);
    } catch (e) {
      logger.error({ err: e, userId: user.id }, "sweepExpiredPremiumPlans: failed to expire user plan");
    }
  }

  logger.info({ count: expired.length }, "bookingSweeper: expired premium plans");
  return expired.length;
}

async function sweepPremiumExpiryReminders(): Promise<number> {
  const now = new Date();
  const in3Days = new Date(now.getTime() + PREMIUM_EXPIRY_WARNING_MS);
  // Find users whose plan expires within the next 3 days and haven't been reminded yet.
  // We use the premiumReminderSentAt field if it exists, otherwise fall back to checking expiry window.
  const expiringSoon = await db
    .select()
    .from(usersTable)
    .where(
      and(
        eq(usersTable.isPremium, true),
        isNotNull(usersTable.premiumExpiresAt),
        lt(usersTable.premiumExpiresAt, in3Days),
        sql`${usersTable.premiumExpiresAt} > ${now}`,
        // Dedupe guard: this sweep runs every ~60s, so without a persisted
        // "already reminded" flag an expiring user would receive a duplicate
        // notification roughly every minute for up to 3 days.
        isNull(usersTable.premiumReminderSentAt)
      )
    );

  if (expiringSoon.length === 0) return 0;

  let sent = 0;
  for (const user of expiringSoon) {
    try {
      const expiresAt = user.premiumExpiresAt as Date;
      const daysLeft = Math.max(1, Math.ceil((expiresAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)));
      notifyUser({
        userId: user.id,
        title: "Premium Plan Expiring Soon",
        body: `Your Athoo Premium plan expires in ${daysLeft} day${daysLeft !== 1 ? "s" : ""}. Renew now to keep your benefits.`,
        type: "system",
        data: { action: "renew_premium", expiresAt: expiresAt.toISOString() },
      }).catch(() => undefined);
      await db.update(usersTable).set({ premiumReminderSentAt: now, updatedAt: now }).where(eq(usersTable.id, user.id));
      sent++;
    } catch (e) {
      logger.error({ err: e, userId: user.id }, "sweepPremiumExpiryReminders: failed");
    }
  }

  if (sent > 0) logger.info({ count: sent }, "bookingSweeper: sent premium expiry reminders");
  return sent;
}

// ─── Negotiation expiry notifications ────────────────────────────────────────
async function sweepExpiredNegotiations(): Promise<number> {
  const now = new Date();
  // Find open negotiations that have passed their expiresAt without being concluded.
  const expired = await db
    .select()
    .from(negotiationsTable)
    .where(
      and(
        ne(negotiationsTable.status, "accepted"),
        ne(negotiationsTable.status, "rejected"),
        isNotNull(negotiationsTable.expiresAt),
        lt(negotiationsTable.expiresAt, now)
      )
    );

  if (expired.length === 0) return 0;

  let notified = 0;
  for (const neg of expired) {
    try {
      // Notify both parties that the offer window closed.
      if (neg.customerId) {
        notifyUser({
          userId: neg.customerId,
          title: "Offer Expired",
          body: `Your service offer for "${neg.service || "a service"}" has expired. You can post a new request anytime.`,
          type: "booking",
          data: { negotiationId: neg.id },
        }).catch(() => undefined);
      }
      if (neg.providerId) {
        notifyUser({
          userId: neg.providerId,
          title: "Offer Expired",
          body: `An offer for "${neg.service || "a service"}" was not accepted in time and has expired.`,
          type: "booking",
          data: { negotiationId: neg.id },
        }).catch(() => undefined);
      }
      // Mark as rejected so we don't re-notify on the next sweep.
      await db
        .update(negotiationsTable)
        .set({ status: "rejected" })
        .where(eq(negotiationsTable.id, neg.id));
      notified++;
    } catch (e) {
      logger.error({ err: e, negotiationId: neg.id }, "sweepExpiredNegotiations: failed");
    }
  }

  if (notified > 0) logger.info({ count: notified }, "bookingSweeper: expired negotiations notified");
  return notified;
}

async function runAllSweeps(): Promise<void> {
  if (sweepRunning) {
    logger.warn("bookingSweeper: skipped overlapping in-process run");
    return;
  }
  sweepRunning = true;
  lastStartedAt = new Date();
  const started = Date.now();
  let lockAcquired = false;
  try {
    const lockResult = await db.execute(sql`SELECT pg_try_advisory_lock(${SWEEPER_LOCK_ID}) AS acquired`);
    lockAcquired = Boolean((lockResult.rows?.[0] as { acquired?: boolean } | undefined)?.acquired);
    if (!lockAcquired) {
      logger.info("bookingSweeper: another instance owns the sweep lock");
      return;
    }
    const results = await Promise.allSettled([
    sweepStuckAcceptedBookings(),
    sweepStalePendingBookings(),
    sweepRatingReminders(),
    sweepScheduledDayReminders(),
    sweepPreJobReminders(),
    clearExpiredCooldowns(),
    sweepExpiredPremiumPlans(),
    sweepPremiumExpiryReminders(),
    sweepExpiredNegotiations(),
    sweepInactiveAccounts(),
    sweepProviderDocumentCompliance(),
    ]);
    const rejected = results.filter((result) => result.status === "rejected");
    lastError = rejected.length ? `${rejected.length} sweep task(s) failed` : null;
    if (rejected.length) logger.error({ rejected }, "bookingSweeper: one or more sweep tasks failed");
  } catch (error) {
    lastError = error instanceof Error ? error.message : String(error);
    throw error;
  } finally {
    if (lockAcquired) {
      try { await db.execute(sql`SELECT pg_advisory_unlock(${SWEEPER_LOCK_ID})`); }
      catch (error) { logger.error({ err: error }, "bookingSweeper: failed to release advisory lock"); }
    }
    lastCompletedAt = new Date();
    lastDurationMs = Date.now() - started;
    sweepRunning = false;
  }
}

export function bookingSweeperStats() {
  return {
    running: sweepRunning,
    intervalMs: SWEEP_INTERVAL_MS,
    bookingTimeZone: BOOKING_TIME_ZONE,
    noShowAutoCancelEnabled: NO_SHOW_AUTO_CANCEL_ENABLED,
    noShowGraceMs: NO_SHOW_GRACE_MS,
    noShowBatchSize: NO_SHOW_SWEEP_BATCH_SIZE,
    lastStartedAt: lastStartedAt?.toISOString() || null,
    lastCompletedAt: lastCompletedAt?.toISOString() || null,
    lastDurationMs,
    lastError,
  };
}

export function stopBookingSweeper(): void {
  if (sweeperHandle) clearInterval(sweeperHandle);
  sweeperHandle = null;
}

export function startBookingSweeper(): NodeJS.Timeout {
  void runAllSweeps().catch((e) =>
    logger.error({ err: e }, "bookingSweeper: initial run failed")
  );
  stopBookingSweeper();
  const handle = setInterval(() => {
    void runAllSweeps().catch((e) =>
      logger.error({ err: e }, "bookingSweeper: scheduled run failed")
    );
  }, SWEEP_INTERVAL_MS);
  if (typeof handle.unref === "function") handle.unref();
  sweeperHandle = handle;
  return handle;
}
