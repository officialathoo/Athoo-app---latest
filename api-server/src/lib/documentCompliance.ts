import { db } from "@workspace/db";
import {
  providerDocumentsTable,
  providerDocumentUpdateRequestsTable,
  usersTable,
  type ProviderDocument,
  type ProviderDocumentUpdateRequest,
  type User,
} from "@workspace/db/schema";
import { and, asc, eq, gt, inArray, isNotNull, isNull, or } from "drizzle-orm";
import { createAdminNotification } from "./adminNotifications";
import { emitToUser } from "./eventBus";
import { logger } from "./logger";
import { notifyUser } from "./notifications";
import type { ExpiringDocumentType } from "./documentValidity";

export const EXPIRING_DOCUMENT_TYPES = ["cnic_front", "cnic_back", "police"] as const;
export type { ExpiringDocumentType } from "./documentValidity";
export type DocumentComplianceStatus =
  | "active"
  | "action_required"
  | "warning"
  | "grace"
  | "renewal_pending"
  | "suspended";

const DAY_MS = 24 * 60 * 60 * 1000;
const SWEEP_MIN_INTERVAL_MS = Math.max(
  5 * 60_000,
  Number(process.env.DOCUMENT_EXPIRY_SWEEP_MIN_INTERVAL_MS || 15 * 60_000),
);
const SWEEP_BATCH_SIZE = Math.min(
  500,
  Math.max(25, Number(process.env.DOCUMENT_EXPIRY_SWEEP_BATCH_SIZE || 250)),
);
const SWEEP_MAX_BATCHES = Math.min(
  20,
  Math.max(1, Number(process.env.DOCUMENT_EXPIRY_SWEEP_MAX_BATCHES || 4)),
);

let sweepRunning = false;
let lastSweepAt = 0;
let sweepCursor: string | null = null;

function configuredGraceDays(): number {
  const parsed = Number(process.env.DOCUMENT_EXPIRY_GRACE_DAYS || 7);
  return Number.isInteger(parsed) ? Math.min(30, Math.max(1, parsed)) : 7;
}

function asDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function endOfDay(value: Date): Date {
  return new Date(Date.UTC(
    value.getUTCFullYear(),
    value.getUTCMonth(),
    value.getUTCDate(),
    23,
    59,
    59,
    999,
  ));
}

function dateOnlyEpoch(value: Date): number {
  return Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate());
}

function daysUntil(expiry: Date, now: Date): number {
  return Math.round((dateOnlyEpoch(expiry) - dateOnlyEpoch(now)) / DAY_MS);
}

function formatDateOnly(value: Date): string {
  return value.toLocaleDateString("en-PK", { timeZone: "UTC" });
}

function documentLabel(type: ExpiringDocumentType): string {
  if (type === "police") return "Police verification";
  return "CNIC";
}

function groupKey(type: ExpiringDocumentType): "cnic" | "police" {
  return type === "police" ? "police" : "cnic";
}

export type ComplianceDocumentState = {
  type: ExpiringDocumentType;
  label: string;
  status: string;
  expiresAt: string | null;
  expiryNotApplicable: boolean;
  isExpired: boolean;
  daysRemaining: number | null;
  hasPendingRequest: boolean;
};

export type ProviderComplianceSummary = {
  status: DocumentComplianceStatus;
  reason: string | null;
  graceEndsAt: string | null;
  suspendedAt: string | null;
  nearestExpiryAt: string | null;
  missingExpiryMetadata: ExpiringDocumentType[];
  expiredTypes: ExpiringDocumentType[];
  pendingTypes: ExpiringDocumentType[];
  documents: ComplianceDocumentState[];
};

export function buildProviderComplianceSummary(
  provider: User,
  documents: ProviderDocument[],
  requests: ProviderDocumentUpdateRequest[],
  now = new Date(),
): ProviderComplianceSummary {
  const approved = new Map(
    documents
      .filter((document) => document.status === "approved" && EXPIRING_DOCUMENT_TYPES.includes(document.type as ExpiringDocumentType))
      .map((document) => [document.type as ExpiringDocumentType, document]),
  );
  const pending = new Set(
    requests
      .filter((request) => request.status === "pending")
      .map((request) => request.documentType as ExpiringDocumentType),
  );

  const missingExpiryMetadata: ExpiringDocumentType[] = [];
  const expiredTypes: ExpiringDocumentType[] = [];
  const documentStates: ComplianceDocumentState[] = [];
  let nearestExpiry: Date | null = null;
  let earliestExpiredAt: Date | null = null;

  for (const type of EXPIRING_DOCUMENT_TYPES) {
    const document = approved.get(type);
    const expiresAt = asDate(document?.expiresAt);
    const expiryNotApplicable = Boolean(document?.expiryNotApplicable && type !== "police");
    // Missing approved documents and approved documents without trustworthy
    // validity metadata both require action. Legacy accounts are warned rather
    // than suspended until an actual expiry date is known.
    const missing = !document || (!expiryNotApplicable && !expiresAt);
    if (missing) missingExpiryMetadata.push(type);

    const remaining = expiresAt ? daysUntil(expiresAt, now) : null;
    const expired = remaining !== null && remaining < 0;
    if (expired) {
      expiredTypes.push(type);
      if (!earliestExpiredAt || expiresAt!.getTime() < earliestExpiredAt.getTime()) earliestExpiredAt = expiresAt;
    } else if (expiresAt && (!nearestExpiry || expiresAt.getTime() < nearestExpiry.getTime())) {
      nearestExpiry = expiresAt;
    }

    documentStates.push({
      type,
      label: documentLabel(type),
      status: document?.status || "missing",
      expiresAt: expiresAt?.toISOString() || null,
      expiryNotApplicable,
      isExpired: expired,
      daysRemaining: remaining,
      hasPendingRequest: pending.has(type),
    });
  }

  const pendingTypes = [...pending].filter((type): type is ExpiringDocumentType => EXPIRING_DOCUMENT_TYPES.includes(type));
  const graceEndsAt = earliestExpiredAt
    ? new Date(endOfDay(earliestExpiredAt).getTime() + configuredGraceDays() * DAY_MS)
    : null;
  const allExpiredHavePending = expiredTypes.length > 0 && expiredTypes.every((type) => pending.has(type));
  const previouslySuspended = Boolean(provider.documentSuspendedAt);

  let status: DocumentComplianceStatus = "active";
  let reason: string | null = null;

  if (previouslySuspended && expiredTypes.length > 0) {
    status = "suspended";
    reason = provider.documentComplianceReason || "Required identity documents are expired. Submit replacements for administrator review.";
  } else if (expiredTypes.length > 0 && graceEndsAt && now.getTime() > graceEndsAt.getTime() && !allExpiredHavePending) {
    status = "suspended";
    reason = `${[...new Set(expiredTypes.map(documentLabel))].join(" and ")} expired and the ${configuredGraceDays()}-day renewal period ended.`;
  } else if (expiredTypes.length > 0 && allExpiredHavePending) {
    status = "renewal_pending";
    reason = "Your replacement documents are waiting for Athoo review.";
  } else if (expiredTypes.length > 0) {
    status = "grace";
    reason = `${[...new Set(expiredTypes.map(documentLabel))].join(" and ")} expired. Submit updated documents before the grace period ends.`;
  } else if (pendingTypes.length > 0) {
    status = "renewal_pending";
    reason = "Your replacement documents are waiting for Athoo review.";
  } else if (missingExpiryMetadata.length > 0 && provider.verificationStatus === "approved") {
    status = "action_required";
    reason = "Add validity details for your approved CNIC and police verification documents.";
  } else if (nearestExpiry && daysUntil(nearestExpiry, now) <= 30) {
    status = "warning";
    reason = "One or more verification documents will expire soon.";
  }

  return {
    status,
    reason,
    graceEndsAt: graceEndsAt?.toISOString() || null,
    suspendedAt: asDate(provider.documentSuspendedAt)?.toISOString() || null,
    nearestExpiryAt: nearestExpiry?.toISOString() || null,
    missingExpiryMetadata,
    expiredTypes,
    pendingTypes,
    documents: documentStates,
  };
}

export async function loadProviderCompliance(providerId: string, now = new Date()) {
  const provider = await db.query.usersTable.findFirst({ where: eq(usersTable.id, providerId) });
  if (!provider || provider.role !== "provider") return null;
  const [documents, requests] = await Promise.all([
    db.select().from(providerDocumentsTable).where(eq(providerDocumentsTable.providerId, providerId)),
    db.select().from(providerDocumentUpdateRequestsTable).where(eq(providerDocumentUpdateRequestsTable.providerId, providerId)),
  ]);
  return { provider, documents, requests, summary: buildProviderComplianceSummary(provider, documents, requests, now) };
}

export async function persistProviderCompliance(provider: User, summary: ProviderComplianceSummary, now = new Date()): Promise<void> {
  const wasSuspended = Boolean(provider.documentSuspendedAt) || provider.documentComplianceStatus === "suspended";
  const shouldSuspend = summary.status === "suspended";
  const canRestore = !summary.expiredTypes.length && !summary.missingExpiryMetadata.length && !summary.pendingTypes.length;
  const shouldRestore = wasSuspended && !shouldSuspend && canRestore;
  const currentGrace = asDate(provider.documentGraceEndsAt)?.toISOString() || null;
  const complianceChanged =
    provider.documentComplianceStatus !== summary.status ||
    (provider.documentComplianceReason || null) !== summary.reason ||
    currentGrace !== summary.graceEndsAt;
  const suspensionStateDrift = shouldSuspend && (
    provider.isAvailable !== false ||
    provider.isVerified !== false ||
    provider.verificationStatus !== "in_process"
  );

  if (!complianceChanged && !suspensionStateDrift && !shouldRestore) return;

  const patch: Record<string, unknown> = {
    documentComplianceStatus: summary.status,
    documentComplianceReason: summary.reason,
    documentGraceEndsAt: summary.graceEndsAt ? new Date(summary.graceEndsAt) : null,
    updatedAt: now,
  };

  if (shouldSuspend) {
    patch.documentSuspendedAt = provider.documentSuspendedAt || now;
    patch.isAvailable = false;
    patch.isVerified = false;
    patch.verificationStatus = "in_process";
    patch.verificationNote = summary.reason;
  } else if (shouldRestore) {
    patch.documentSuspendedAt = null;
    patch.documentGraceEndsAt = null;
    patch.isVerified = true;
    patch.verificationStatus = "approved";
    patch.verificationNote = null;
    // Never put a provider online automatically after a compliance suspension.
    patch.isAvailable = false;
  }

  await db.update(usersTable).set(patch).where(eq(usersTable.id, provider.id));

  if (shouldSuspend && !wasSuspended) {
    emitToUser(provider.id, "provider:availability", { isAvailable: false, reason: "document_expiry" });
    await Promise.allSettled([
      notifyUser({
        userId: provider.id,
        title: "Provider account temporarily paused",
        body: summary.reason || "Required verification documents expired. Upload replacements to restore your account.",
        type: "system",
        link: "/provider/verification-documents",
        data: { source: "document_expiry", status: "suspended" },
        email: {
          category: "security",
          templateKey: "account_status",
          dedupeKey: `document-suspended:${provider.id}:${now.toISOString().slice(0, 10)}`,
          variables: { status: "temporarily paused", reason: summary.reason || "Required verification documents expired." },
        },
      }),
      createAdminNotification({
        title: "Provider paused for expired documents",
        message: `${provider.name}'s provider account was automatically paused after the document-renewal grace period ended.`,
        type: "verification",
        link: `/admin/document-renewals?provider=${provider.id}`,
      }),
    ]);
  } else if (shouldRestore) {
    await notifyUser({
      userId: provider.id,
      title: "Provider account reactivated",
      body: "Your updated identity documents were approved. Turn availability on when you are ready to receive jobs.",
      type: "system",
      link: "/provider/availability",
      data: { source: "document_expiry", status: "active" },
      email: {
        category: "security",
        templateKey: "account_status",
        dedupeKey: `document-reactivated:${provider.id}:${now.toISOString().slice(0, 10)}`,
        variables: { status: "reactivated", reason: "Your updated identity documents were approved." },
      },
    }).catch(() => undefined);
  }
}

async function sendExpiryReminder(
  provider: User,
  group: "cnic" | "police",
  expiry: Date,
  threshold: 30 | 7 | 1,
  remainingDays: number,
  documents: ProviderDocument[],
): Promise<void> {
  const label = group === "cnic" ? "CNIC" : "Police verification";
  const title = remainingDays === 0
    ? `${label} expires today`
    : `${label} expires in ${remainingDays} day${remainingDays === 1 ? "" : "s"}`;
  const body = `Update your ${group === "cnic" ? "CNIC" : "police verification certificate"} before ${formatDateOnly(expiry)} to avoid interruption of your provider account.`;
  const reminderSentAt = new Date();
  // A provider first discovered inside a shorter reminder window must never
  // receive an older, misleading reminder later. Mark all wider thresholds as
  // delivered together with the most urgent applicable reminder.
  const reminderPatch = threshold === 30
    ? { expiryReminder30SentAt: reminderSentAt }
    : threshold === 7
      ? { expiryReminder30SentAt: reminderSentAt, expiryReminder7SentAt: reminderSentAt }
      : {
          expiryReminder30SentAt: reminderSentAt,
          expiryReminder7SentAt: reminderSentAt,
          expiryReminder1SentAt: reminderSentAt,
        };

  await notifyUser({
    userId: provider.id,
    title,
    body,
    type: "system",
    link: "/provider/verification-documents",
    data: { source: "document_expiry", documentGroup: group, threshold, expiresAt: expiry.toISOString() },
    email: {
      category: "security",
      templateKey: "account_status",
      dedupeKey: `document-expiry:${provider.id}:${group}:${threshold}:${expiry.toISOString().slice(0, 10)}`,
      variables: { status: "document expiring", reason: body },
    },
  });

  const ids = documents.filter((document) => groupKey(document.type as ExpiringDocumentType) === group).map((document) => document.id);
  if (ids.length) await db.update(providerDocumentsTable).set({ ...reminderPatch, updatedAt: new Date() }).where(inArray(providerDocumentsTable.id, ids));
}

async function sendExpiryStartedNotice(
  provider: User,
  group: "cnic" | "police",
  expiry: Date,
  documents: ProviderDocument[],
): Promise<void> {
  const graceDays = configuredGraceDays();
  const graceEndsAt = new Date(endOfDay(expiry).getTime() + graceDays * DAY_MS);
  const label = group === "cnic" ? "CNIC" : "Police verification";
  const body = `${label} expired on ${formatDateOnly(expiry)}. Submit a replacement by ${formatDateOnly(graceEndsAt)} to avoid a temporary provider-account pause.`;

  await notifyUser({
    userId: provider.id,
    title: `${label} renewal required`,
    body,
    type: "system",
    link: "/provider/verification-documents",
    data: {
      source: "document_expiry",
      documentGroup: group,
      status: "grace",
      expiresAt: expiry.toISOString(),
      graceEndsAt: graceEndsAt.toISOString(),
    },
    email: {
      category: "security",
      templateKey: "account_status",
      dedupeKey: `document-expired:${provider.id}:${group}:${expiry.toISOString().slice(0, 10)}`,
      variables: { status: "renewal required", reason: body },
    },
  });

  const ids = documents
    .filter((document) => groupKey(document.type as ExpiringDocumentType) === group)
    .map((document) => document.id);
  if (ids.length) {
    await db.update(providerDocumentsTable).set({
      expiryNoticeSentAt: new Date(),
      updatedAt: new Date(),
    }).where(inArray(providerDocumentsTable.id, ids));
  }
}

async function notifyMissingMetadata(provider: User): Promise<boolean> {
  const now = new Date();
  const [updated] = await db.update(usersTable).set({
    documentComplianceStatus: "action_required",
    documentComplianceReason: "Add validity details for your approved CNIC and police verification documents.",
    documentActionRequiredNotifiedAt: now,
    updatedAt: now,
  }).where(and(
    eq(usersTable.id, provider.id),
    isNull(usersTable.documentActionRequiredNotifiedAt),
    or(eq(usersTable.documentComplianceStatus, "active"), eq(usersTable.documentComplianceStatus, "action_required")),
  )).returning({ id: usersTable.id });
  if (!updated) return false;
  await notifyUser({
    userId: provider.id,
    title: "Document validity details required",
    body: "Add the valid-until dates for your CNIC and police verification so Athoo can send renewal reminders.",
    type: "system",
    link: "/provider/verification-documents",
    data: { source: "document_expiry", status: "action_required" },
    email: {
      category: "security",
      templateKey: "account_status",
      dedupeKey: `document-validity-required:${provider.id}`,
      variables: { status: "action required", reason: "Add valid-until dates for your CNIC and police verification documents." },
    },
  }).catch(() => undefined);
  return true;
}

export async function restoreProviderAvailabilityIfCompliant(
  providerId: string | null | undefined,
  reason: string,
): Promise<boolean> {
  if (!providerId) return false;
  const [restored] = await db.update(usersTable).set({
    isAvailable: true,
    updatedAt: new Date(),
  }).where(and(
    eq(usersTable.id, providerId),
    eq(usersTable.role, "provider"),
    eq(usersTable.accountStatus, "active"),
    eq(usersTable.isBlocked, false),
    eq(usersTable.isDeactivated, false),
    eq(usersTable.isVerified, true),
    eq(usersTable.verificationStatus, "approved"),
    isNull(usersTable.documentSuspendedAt),
  )).returning({ id: usersTable.id });

  if (!restored) {
    emitToUser(providerId, "provider:availability", {
      isAvailable: false,
      reason: "verification_required",
    });
    return false;
  }

  emitToUser(providerId, "provider:availability", { isAvailable: true, reason });
  return true;
}

export async function sweepProviderDocumentCompliance(force = false): Promise<{
  skipped: boolean;
  checked: number;
  suspended: number;
  reminders: number;
  actionRequired: number;
}> {
  const now = new Date();
  const empty = { skipped: true, checked: 0, suspended: 0, reminders: 0, actionRequired: 0 };
  if (sweepRunning) return empty;
  if (!force && now.getTime() - lastSweepAt < SWEEP_MIN_INTERVAL_MS) return empty;

  sweepRunning = true;
  try {
    const providers: User[] = [];
    let cursor = sweepCursor;

    for (let batch = 0; batch < SWEEP_MAX_BATCHES; batch += 1) {
      const conditions = [
        eq(usersTable.role, "provider"),
        eq(usersTable.accountStatus, "active"),
        eq(usersTable.isBlocked, false),
        or(eq(usersTable.verificationStatus, "approved"), isNotNull(usersTable.documentSuspendedAt)),
      ];
      if (cursor) conditions.push(gt(usersTable.id, cursor));

      let batchProviders = await db.select().from(usersTable)
        .where(and(...conditions))
        .orderBy(asc(usersTable.id))
        .limit(SWEEP_BATCH_SIZE);

      // When the cursor reaches the end, wrap once so every provider remains
      // eligible without using an unbounded OFFSET scan.
      if (!batchProviders.length && cursor && providers.length === 0) {
        cursor = null;
        batchProviders = await db.select().from(usersTable).where(and(
          eq(usersTable.role, "provider"),
          eq(usersTable.accountStatus, "active"),
          eq(usersTable.isBlocked, false),
          or(eq(usersTable.verificationStatus, "approved"), isNotNull(usersTable.documentSuspendedAt)),
        )).orderBy(asc(usersTable.id)).limit(SWEEP_BATCH_SIZE);
      }

      if (!batchProviders.length) {
        cursor = null;
        break;
      }

      providers.push(...batchProviders);
      cursor = batchProviders.at(-1)?.id || null;
      if (batchProviders.length < SWEEP_BATCH_SIZE) {
        cursor = null;
        break;
      }
    }

    sweepCursor = cursor;
    const ids = providers.map((provider) => provider.id);
    if (!ids.length) {
      lastSweepAt = now.getTime();
      return { ...empty, skipped: false };
    }

    const [documents, requests] = await Promise.all([
      db.select().from(providerDocumentsTable).where(inArray(providerDocumentsTable.providerId, ids)),
      db.select().from(providerDocumentUpdateRequestsTable).where(and(
        inArray(providerDocumentUpdateRequestsTable.providerId, ids),
        eq(providerDocumentUpdateRequestsTable.status, "pending"),
      )),
    ]);

    let suspended = 0;
    let reminders = 0;
    let actionRequired = 0;

    for (const provider of providers) {
      const providerDocs = documents.filter((document) => document.providerId === provider.id);
      const providerRequests = requests.filter((request) => request.providerId === provider.id);
      const summary = buildProviderComplianceSummary(provider, providerDocs, providerRequests, now);

      if (summary.status === "action_required" && summary.missingExpiryMetadata.length) {
        if (await notifyMissingMetadata(provider)) actionRequired += 1;
      }

      const groups = new Map<"cnic" | "police", { expiry: Date; docs: ProviderDocument[] }>();
      for (const document of providerDocs) {
        if (document.status !== "approved" || !EXPIRING_DOCUMENT_TYPES.includes(document.type as ExpiringDocumentType) || document.expiryNotApplicable) continue;
        const expiry = asDate(document.expiresAt);
        if (!expiry) continue;
        const group = groupKey(document.type as ExpiringDocumentType);
        const current = groups.get(group);
        if (!current || expiry.getTime() < current.expiry.getTime()) groups.set(group, { expiry, docs: [document] });
        else current.docs.push(document);
      }

      for (const [group, item] of groups) {
        const remaining = daysUntil(item.expiry, now);
        const reminderFields = item.docs.map((doc) => ({
          d30: doc.expiryReminder30SentAt,
          d7: doc.expiryReminder7SentAt,
          d1: doc.expiryReminder1SentAt,
        }));
        const expiryNoticeSent = item.docs.every((document) => Boolean(document.expiryNoticeSentAt));
        if (remaining < 0 && !expiryNoticeSent) {
          try {
            await sendExpiryStartedNotice(provider, group, item.expiry, item.docs);
            reminders += 1;
          } catch (error) {
            logger.warn({ err: error, providerId: provider.id, group }, "document expiry notice failed");
          }
        }

        const candidates: Array<{ threshold: 30 | 7 | 1; sent: boolean }> = [
          { threshold: 1, sent: reminderFields.every((item) => Boolean(item.d1)) },
          { threshold: 7, sent: reminderFields.every((item) => Boolean(item.d7)) },
          { threshold: 30, sent: reminderFields.every((item) => Boolean(item.d30)) },
        ];
        const candidate = candidates.find(({ threshold, sent }) => !sent && remaining <= threshold && remaining >= 0);
        if (candidate) {
          try {
            await sendExpiryReminder(provider, group, item.expiry, candidate.threshold, remaining, item.docs);
            reminders += 1;
          } catch (error) {
            logger.warn({ err: error, providerId: provider.id, group }, "document expiry reminder failed");
          }
        }
      }

      const before = provider.documentComplianceStatus;
      await persistProviderCompliance(provider, summary, now);
      if (summary.status === "suspended" && before !== "suspended") suspended += 1;
    }

    lastSweepAt = Date.now();
    if (suspended || reminders || actionRequired) logger.info({ checked: providers.length, suspended, reminders, actionRequired }, "provider document compliance sweep completed");
    return { skipped: false, checked: providers.length, suspended, reminders, actionRequired };
  } finally {
    sweepRunning = false;
  }
}
