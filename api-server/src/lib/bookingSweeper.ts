import { db } from "@workspace/db";
import { bookingsTable, usersTable, negotiationsTable, userSubscriptionsTable } from "@workspace/db/schema";
import { and, eq, isNull, isNotNull, lt, ne, sql } from "drizzle-orm";
import { emitToUser } from "./eventBus";
import { notifyUser } from "./notifications";
import { logger } from "./logger";

const NO_SHOW_GRACE_MS = 30 * 60 * 1000;
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
  const cutoff = new Date(Date.now() - NO_SHOW_GRACE_MS);

  // Use updatedAt and a longer grace window. The previous createdAt-based check
  // could cancel an already-accepted job immediately when the customer/provider
  // took more than a few minutes to accept and then the provider tapped
  // "I have arrived". Arrival must never race with the sweeper.
  const stale = await db
    .select()
    .from(bookingsTable)
    .where(
      and(
        eq(bookingsTable.status, "accepted"),
        isNull(bookingsTable.providerArrivedAt),
        lt(bookingsTable.updatedAt, cutoff)
      )
    );

  if (stale.length === 0) return 0;

  for (const booking of stale) {
    try {
      await db
        .update(bookingsTable)
        .set({ status: "cancelled", updatedAt: new Date() })
        .where(eq(bookingsTable.id, booking.id));

      if (booking.providerId) {
        await db
          .update(usersTable)
          .set({ isAvailable: true, updatedAt: new Date() })
          .where(eq(usersTable.id, booking.providerId));
        emitToUser(booking.providerId, "provider:availability", { isAvailable: true, reason: "auto_cancelled" });
        await applyNoShowPenalty(booking.providerId);
      }

      const payload = { bookingId: booking.id, reason: "no_show" };
      emitToUser(booking.customerId, "booking:cancelled", payload);
      emitToUser(booking.providerId, "booking:cancelled", payload);

      notifyUser({
        userId: booking.customerId,
        title: "Booking auto-cancelled",
        body: `${booking.providerName} has not been marked arrived within the allowed time. You can re-request the service.`,
        type: "booking",
        link: `/bookings/${booking.id}`,
        data: { bookingId: booking.id, reason: "no_show" },
      }).catch(() => undefined);
      notifyUser({
        userId: booking.providerId,
        title: "Booking auto-cancelled",
        body: `Your accepted ${booking.service} booking was cancelled because no arrival was confirmed within the allowed time.`,
        type: "booking",
        link: `/bookings/${booking.id}`,
        data: { bookingId: booking.id, reason: "no_show" },
      }).catch(() => undefined);
    } catch (e) {
      logger.error({ err: e, bookingId: booking.id }, "bookingSweeper: failed to auto-cancel");
    }
  }

  logger.info({ count: stale.length }, "bookingSweeper: auto-cancelled stale accepted bookings");
  return stale.length;
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
  for (const booking of stale) {
    try {
      await db
        .update(bookingsTable)
        .set({ status: "cancelled", updatedAt: new Date() })
        .where(eq(bookingsTable.id, booking.id));
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
  logger.info({ count: stale.length }, "bookingSweeper: expired stale pending bookings");
  return stale.length;
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

// 60 minutes before a scheduled booking, send a reminder to both customer
// and provider (stamped on the booking to prevent double-firing).
const PRE_JOB_REMINDER_WINDOW_MS = 60 * 60 * 1000; // 1 hour ahead
const PRE_JOB_REMINDER_MIN_MS = 25 * 60 * 1000;   // min 25 min ahead

function parseScheduledDateTime(date: string, time: string): Date | null {
  try {
    // date: "2024-05-03", time: "10:00 AM" or "14:00"
    const combined = `${date} ${time}`;
    const d = new Date(combined);
    if (!isNaN(d.getTime())) return d;
    // fallback: 24h format
    const d2 = new Date(`${date}T${time}`);
    if (!isNaN(d2.getTime())) return d2;
    return null;
  } catch { return null; }
}

async function sweepPreJobReminders(): Promise<number> {
  const now = new Date();
  const due = await db
    .select()
    .from(bookingsTable)
    .where(
      and(
        eq(bookingsTable.status, "accepted"),
        isNull(bookingsTable.preJobReminderSentAt),
        isNotNull(bookingsTable.scheduledDate),
        isNotNull(bookingsTable.scheduledTime),
      )
    );

  if (due.length === 0) return 0;

  let sent = 0;
  for (const booking of due) {
    try {
      const dt = parseScheduledDateTime(
        booking.scheduledDate || "",
        booking.scheduledTime || "",
      );
      if (!dt) continue;

      const msUntil = dt.getTime() - now.getTime();
      if (msUntil < PRE_JOB_REMINDER_MIN_MS || msUntil > PRE_JOB_REMINDER_WINDOW_MS) continue;

      await db
        .update(bookingsTable)
        .set({ preJobReminderSentAt: now })
        .where(eq(bookingsTable.id, booking.id));

      const timeLabel = booking.scheduledTime || "";
      notifyUser({
        userId: booking.customerId,
        title: "Upcoming booking reminder",
        body: `${booking.providerName} is scheduled to arrive at ${timeLabel}. Be ready!`,
        type: "booking",
        link: `/bookings/${booking.id}`,
        data: { bookingId: booking.id },
      }).catch(() => undefined);

      notifyUser({
        userId: booking.providerId,
        title: "Job reminder",
        body: `You have a ${booking.service} job at ${timeLabel}. Head over to ${booking.address} on time!`,
        type: "booking",
        link: `/jobs/${booking.id}`,
        data: { bookingId: booking.id },
      }).catch(() => undefined);

      sent++;
    } catch (e) {
      logger.error({ err: e, bookingId: booking.id }, "bookingSweeper: pre-job reminder failed");
    }
  }

  if (sent > 0) logger.info({ count: sent }, "bookingSweeper: sent pre-job reminders");
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
    sweepPreJobReminders(),
    clearExpiredCooldowns(),
    sweepExpiredPremiumPlans(),
    sweepPremiumExpiryReminders(),
    sweepExpiredNegotiations(),
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

