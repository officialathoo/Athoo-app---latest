import { db } from "@workspace/db";
import { usersTable, type User } from "@workspace/db/schema";
import { and, eq, gte, isNull, lt, or } from "drizzle-orm";
import { getPlatformSettings } from "./admin";
import { createAdminNotification } from "./adminNotifications";
import { queueEmail } from "./emailDelivery";
import { emitToUser } from "./eventBus";
import { logger } from "./logger";
import { notifyUser } from "./notifications";

const ACTIVITY_WRITE_INTERVAL_MS = Math.max(
  60_000,
  Number(process.env.USER_ACTIVITY_WRITE_INTERVAL_MS || 10 * 60_000),
);
const INACTIVITY_SWEEP_MIN_INTERVAL_MS = Math.max(
  15 * 60_000,
  Number(process.env.INACTIVITY_SWEEP_MIN_INTERVAL_MS || 6 * 60 * 60_000),
);

const lastActivityWrite = new Map<string, number>();
let lastSweepAt = 0;
let inactivitySweepRunning = false;

type ActivityUser = Pick<
  User,
  "id" | "name" | "role" | "email" | "inactivityState" | "isDeactivated" | "isBlocked" | "accountStatus"
>;

function eligibleForActivity(user: ActivityUser): boolean {
  return user.role !== "admin" && !user.isBlocked && !user.isDeactivated && user.accountStatus === "active";
}

export async function recordUserActivity(user: ActivityUser, force = false): Promise<void> {
  if (!eligibleForActivity(user)) return;
  const now = Date.now();
  const previousWrite = lastActivityWrite.get(user.id) || 0;
  const returningFromInactivity = Boolean(user.inactivityState && user.inactivityState !== "active");
  if (!force && !returningFromInactivity && now - previousWrite < ACTIVITY_WRITE_INTERVAL_MS) return;

  lastActivityWrite.set(user.id, now);
  const [updated] = await db
    .update(usersTable)
    .set({
      lastActiveAt: new Date(now),
      inactivityState: "active",
      inactivityWarningSentAt: null,
      inactivityRestrictedAt: null,
      inactivityReviewAt: null,
      updatedAt: new Date(now),
    })
    .where(and(eq(usersTable.id, user.id), eq(usersTable.accountStatus, "active")))
    .returning({ id: usersTable.id });

  if (!updated || !returningFromInactivity) return;
  emitToUser(user.id, "account:inactivity-cleared", { userId: user.id, role: user.role });
  if (user.role === "provider") {
    void notifyUser({
      userId: user.id,
      title: "Welcome back to Athoo",
      body: "Your inactivity restriction was cleared. Turn availability on when you are ready to receive jobs.",
      type: "system",
      link: "/provider/availability",
      data: { source: "inactivity_lifecycle" },
    }).catch(() => undefined);
  }
}

function dayCutoff(days: number, now: Date): Date {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

async function sendLifecycleEmail(user: User, status: string, reason: string, dedupe: string): Promise<void> {
  if (!user.email) return;
  await queueEmail({
    userId: user.id,
    to: user.email,
    templateKey: "account_status",
    category: "security",
    dedupeKey: dedupe,
    variables: { name: user.name, status, reason, category: "security" },
  });
}

async function markForReview(user: User, now: Date): Promise<boolean> {
  const [updated] = await db
    .update(usersTable)
    .set({
      inactivityState: "review",
      inactivityWarningSentAt: user.inactivityWarningSentAt || now,
      inactivityRestrictedAt: user.inactivityRestrictedAt || now,
      inactivityReviewAt: now,
      ...(user.role === "provider" ? { isAvailable: false } : {}),
      updatedAt: now,
    })
    .where(and(eq(usersTable.id, user.id), isNull(usersTable.inactivityReviewAt)))
    .returning({ id: usersTable.id });
  if (!updated) return false;

  await createAdminNotification({
    title: "Inactive account needs review",
    message: `${user.name} (${user.role}) has reached the configured inactivity review threshold. Permanent deletion is not automatic.`,
    type: "account",
    link: `/admin/inactive-accounts?focus=${user.id}`,
  });
  await Promise.allSettled([
    notifyUser({
      userId: user.id,
      title: "Your Athoo account needs attention",
      body: "Your account has been inactive for an extended period. Sign in to restore active status or contact Athoo Support.",
      type: "system",
      link: "/profile",
      data: { source: "inactivity_lifecycle", state: "review" },
    }),
    sendLifecycleEmail(
      user,
      "inactive review",
      "Your Athoo account has been inactive for an extended period. Sign in to restore active status or contact support. Athoo does not permanently delete accounts automatically because of inactivity.",
      `inactive-review:${user.id}:${now.toISOString().slice(0, 10)}`,
    ),
  ]);
  return true;
}

async function restrictInactiveUser(user: User, now: Date): Promise<boolean> {
  const [updated] = await db
    .update(usersTable)
    .set({
      inactivityState: "restricted",
      inactivityWarningSentAt: user.inactivityWarningSentAt || now,
      inactivityRestrictedAt: now,
      ...(user.role === "provider" ? { isAvailable: false } : {}),
      updatedAt: now,
    })
    .where(and(eq(usersTable.id, user.id), isNull(usersTable.inactivityRestrictedAt)))
    .returning({ id: usersTable.id });
  if (!updated) return false;

  const providerCopy = user.role === "provider"
    ? "Your provider profile has been paused from new-job matching. Sign in and turn availability on when you return."
    : "Sign in to keep your account active and review any pending activity.";
  await Promise.allSettled([
    notifyUser({
      userId: user.id,
      title: "Athoo inactivity restriction",
      body: providerCopy,
      type: "system",
      link: "/profile",
      data: { source: "inactivity_lifecycle", state: "restricted" },
    }),
    sendLifecycleEmail(
      user,
      "restricted for inactivity",
      providerCopy,
      `inactive-restricted:${user.id}:${now.toISOString().slice(0, 10)}`,
    ),
  ]);
  return true;
}

async function warnInactiveUser(user: User, now: Date): Promise<boolean> {
  const [updated] = await db
    .update(usersTable)
    .set({ inactivityState: "warning", inactivityWarningSentAt: now, updatedAt: now })
    .where(and(eq(usersTable.id, user.id), isNull(usersTable.inactivityWarningSentAt)))
    .returning({ id: usersTable.id });
  if (!updated) return false;

  await Promise.allSettled([
    notifyUser({
      userId: user.id,
      title: "We have not seen you recently",
      body: "Sign in to Athoo to keep your account active and review your profile, bookings, and notification settings.",
      type: "system",
      link: "/profile",
      data: { source: "inactivity_lifecycle", state: "warning" },
    }),
    sendLifecycleEmail(
      user,
      "inactivity warning",
      "We have not seen you recently. Sign in to Athoo to keep your account active and review your profile and notification settings.",
      `inactive-warning:${user.id}:${now.toISOString().slice(0, 10)}`,
    ),
  ]);
  return true;
}

export async function sweepInactiveAccounts(force = false): Promise<{
  skipped: boolean;
  warned: number;
  restricted: number;
  queuedForReview: number;
}> {
  const now = new Date();
  const empty = { skipped: true, warned: 0, restricted: 0, queuedForReview: 0 };
  if (inactivitySweepRunning) return empty;
  if (!force && now.getTime() - lastSweepAt < INACTIVITY_SWEEP_MIN_INTERVAL_MS) return empty;

  inactivitySweepRunning = true;
  try {
    const settings = await getPlatformSettings();
    if (!settings.inactivityLifecycleEnabled) {
      lastSweepAt = now.getTime();
      return empty;
    }

    const warningCutoff = dayCutoff(settings.inactivityWarningDays, now);
    const restrictionCutoff = dayCutoff(settings.inactivityRestrictionDays, now);
    const reviewCutoff = dayCutoff(settings.inactivityReviewDays, now);
    const common = and(
      or(eq(usersTable.role, "customer"), eq(usersTable.role, "provider")),
      eq(usersTable.accountStatus, "active"),
      eq(usersTable.isDeactivated, false),
      eq(usersTable.isBlocked, false),
    );

    const [reviewUsers, restrictionUsers, warningUsers] = await Promise.all([
      db.select().from(usersTable).where(and(common, lt(usersTable.lastActiveAt, reviewCutoff), isNull(usersTable.inactivityReviewAt))).limit(500),
      db.select().from(usersTable).where(and(common, lt(usersTable.lastActiveAt, restrictionCutoff), gte(usersTable.lastActiveAt, reviewCutoff), isNull(usersTable.inactivityRestrictedAt))).limit(500),
      db.select().from(usersTable).where(and(common, lt(usersTable.lastActiveAt, warningCutoff), gte(usersTable.lastActiveAt, restrictionCutoff), isNull(usersTable.inactivityWarningSentAt))).limit(500),
    ]);

    let queuedForReview = 0;
    let restricted = 0;
    let warned = 0;
    for (const user of reviewUsers) if (await markForReview(user, now)) queuedForReview += 1;
    for (const user of restrictionUsers) if (await restrictInactiveUser(user, now)) restricted += 1;
    for (const user of warningUsers) if (await warnInactiveUser(user, now)) warned += 1;

    lastSweepAt = Date.now();
    if (warned || restricted || queuedForReview) {
      logger.info({ warned, restricted, queuedForReview }, "inactive account lifecycle sweep completed");
    }
    return { skipped: false, warned, restricted, queuedForReview };
  } finally {
    inactivitySweepRunning = false;
  }
}
