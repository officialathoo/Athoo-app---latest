import { Router } from "express";
import { logger } from "../lib/logger";
import { db } from "@workspace/db";
import {
  adminBroadcastsTable,
  adminBlacklistTable,
  adminNotificationsTable,
  auditLogTable,
  bookingsTable,
  notificationsTable,
  promotionsTable,
  providerDocumentsTable,
  providerDocumentUpdateRequestsTable,
  supportTicketsTable,
  ticketNotesTable,
  usersTable,
  serviceCategoriesTable,
  commissionPaymentsTable,
  serviceAddRequestsTable,
  accountDeletionRequestsTable,
  userSubscriptionsTable,
  loginHistoryTable,
  withdrawalRequestsTable,
  refundRequestsTable,
  hourlyRateRequestsTable,
  negotiationsTable,
  invoicesTable,
  reviewsTable,
  broadcastRequestsTable,
  chatsTable,
  messagesTable,
  bookingOperationsTable,
  financeLedgerTable,
  notificationTemplatesTable,
  reportIssuesTable,
  adminWorkItemViewsTable,
} from "@workspace/db/schema";
import { and, between, desc, eq, gte, ilike, inArray, isNull, lte, or, sql } from "drizzle-orm";
import {
  requireAdmin,
  requireAuth,
  requireSuperAdmin,
  requirePermission,
  type AuthRequest,
} from "../middlewares/auth";
import {
  DEFAULT_PLATFORM_SETTINGS,
  generateId,
  getPlatformSettings,
  savePlatformSettings,
  PlatformSettingsValidationError,
  toSafeUser,
} from "../lib/admin";
import { notifyUser, notifyUsers } from "../lib/notifications";
import { restoreProviderAvailabilityIfCompliant } from "../lib/documentCompliance";
import { createAdminNotification } from "../lib/adminNotifications";
import { sendEmail, renderVerificationEmail } from "../lib/email";
import { ADMIN_ROLES, validateAdminPermissions, hasAdminPermission } from "../lib/adminPermissions";
import { revokeAllUserSessions } from "../lib/session";
import { emitToRole, emitToUser } from "../lib/eventBus";
import { getProviderActiveWorkBlock } from "../lib/businessRules";
import { getProviderSchedule, saveProviderSchedule, validateProviderSchedule, validateTravelRadius, providerScheduleAllows, providerWithinRadius } from "../lib/providerAvailability";
import { buildMapTileUpstreamUrl, getMapConfigurationStatus, getMapProviderConfiguration } from "../lib/mapConfiguration";
import { getRuntimeMapOverrides } from "../lib/mapRuntime";
import { getMapOperationProvider, registeredMapProviders } from "../maps/providerRegistry.ts";
import { fetchWithTimeout } from "../maps/utils.ts";
import { getRuntimeCommunicationOverrides, runtimeProviderValue } from "../lib/communicationRuntime";
import { getEmailConfigurationStatus } from "../lib/email";
import { getPushConfigurationStatus } from "../lib/push";
import { getOtpDeliveryConfigurationStatus } from "../lib/otpDelivery";
import { getStorageConfigurationStatus, testConfiguredStorageProvider } from "../lib/storageProvider";
import { getInfrastructureProviderStatus } from "../lib/infrastructureConfiguration";
import { queueStats } from "../lib/queue";
import { publicUserId } from "../lib/publicIds";


function isStrongAdminPassword(value: string): boolean {
  return /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{12,}$/.test(value);
}
const router = Router();
router.use(requireAuth, requireAdmin);

router.get("/me", async (req: AuthRequest, res) => {
  try {
    const admin = await db.query.usersTable.findFirst({
      where: eq(usersTable.id, req.user!.userId),
    });

    if (!admin) {
      return res.status(404).json({ error: "Admin not found" });
    }

    return res.json({ admin: toSafeUser(admin) });
  } catch (error) {
    logger.error({ err: error }, "admin me error");
    return res.status(500).json({ error: "Failed to load admin profile" });
  }
});

router.get("/dashboard", requirePermission("dashboard.read"), async (_req, res) => {
  try {
    const now = new Date();
    const staleAcceptedCutoff = new Date(now.getTime() - 2 * 60 * 60 * 1000);

    const [
      userStats,
      bookingStats,
      pendingVerification,
      approvedVerification,
      onlineProviders,
      blockedProviders,
      openSupportTickets,
      activePromotions,
      activeCategories,
      pendingCommissionPayments,
      pendingWithdrawals,
      pendingRefunds,
      pendingServiceRequests,
      pendingRateRequests,
      pendingDeletionRequests,
      pendingSubscriptions,
      activeSubscriptions,
      activeNegotiations,
      overdueNegotiations,
      staleAcceptedBookings,
      recentBookings,
      settings,
    ] = await Promise.all([
      db.select({
        users: sql<number>`count(*)::int`,
        providers: sql<number>`count(*) filter (where ${usersTable.role} = 'provider')::int`,
        customers: sql<number>`count(*) filter (where ${usersTable.role} = 'customer')::int`,
        admins: sql<number>`count(*) filter (where ${usersTable.role} = 'admin')::int`,
        premiumUsers: sql<number>`count(*) filter (where ${usersTable.isPremium} = true)::int`,
        totalCommission: sql<number>`coalesce(sum(${usersTable.totalCommission}) filter (where ${usersTable.role} = 'provider'), 0)`,
        pendingCommission: sql<number>`coalesce(sum(${usersTable.pendingCommission}) filter (where ${usersTable.role} = 'provider'), 0)`,
      }).from(usersTable),
      db.select({
        pendingBookings: sql<number>`count(*) filter (where ${bookingsTable.status} = 'pending')::int`,
        acceptedBookings: sql<number>`count(*) filter (where ${bookingsTable.status} = 'accepted')::int`,
        inProgressBookings: sql<number>`count(*) filter (where ${bookingsTable.status} = 'in_progress')::int`,
        completedBookings: sql<number>`count(*) filter (where ${bookingsTable.status} = 'completed')::int`,
        cancelledBookings: sql<number>`count(*) filter (where ${bookingsTable.status} = 'cancelled')::int`,
        completedJobValue: sql<number>`coalesce(sum(${bookingsTable.price}) filter (where ${bookingsTable.status} = 'completed'), 0)`,
        earnedCommission: sql<number>`coalesce(sum(${bookingsTable.commissionAmount}) filter (where ${bookingsTable.status} = 'completed'), 0)`,
      }).from(bookingsTable),
      db.$count(usersTable, and(eq(usersTable.role, "provider"), eq(usersTable.verificationStatus, "pending"), eq(usersTable.isDeactivated, false))),
      db.$count(usersTable, and(eq(usersTable.role, "provider"), eq(usersTable.verificationStatus, "approved"), eq(usersTable.isDeactivated, false))),
      db.$count(usersTable, and(eq(usersTable.role, "provider"), eq(usersTable.isAvailable, true), eq(usersTable.isBlocked, false), eq(usersTable.isDeactivated, false))),
      db.$count(usersTable, and(eq(usersTable.role, "provider"), eq(usersTable.isBlocked, true))),
      db.$count(supportTicketsTable, inArray(supportTicketsTable.status, ["open", "in_progress"])),
      db.$count(promotionsTable, and(eq(promotionsTable.isActive, true), or(sql`${promotionsTable.validUntil} IS NULL`, gte(promotionsTable.validUntil, now)))),
      db.$count(serviceCategoriesTable, eq(serviceCategoriesTable.isActive, true)),
      db.$count(commissionPaymentsTable, eq(commissionPaymentsTable.status, "pending")),
      db.$count(withdrawalRequestsTable, eq(withdrawalRequestsTable.status, "pending")),
      db.$count(refundRequestsTable, eq(refundRequestsTable.status, "pending")),
      db.$count(serviceAddRequestsTable, eq(serviceAddRequestsTable.status, "pending")),
      db.$count(hourlyRateRequestsTable, eq(hourlyRateRequestsTable.status, "pending")),
      db.$count(accountDeletionRequestsTable, eq(accountDeletionRequestsTable.status, "pending")),
      db.$count(userSubscriptionsTable, eq(userSubscriptionsTable.status, "pending")),
      db.$count(userSubscriptionsTable, eq(userSubscriptionsTable.status, "active")),
      db.$count(negotiationsTable, inArray(negotiationsTable.status, ["customer_offer", "provider_counter"])),
      db.$count(negotiationsTable, and(
        inArray(negotiationsTable.status, ["customer_offer", "provider_counter"]),
        sql`${negotiationsTable.expiresAt} IS NOT NULL`,
        lte(negotiationsTable.expiresAt, now),
      )),
      db.$count(bookingsTable, and(eq(bookingsTable.status, "accepted"), lte(bookingsTable.updatedAt, staleAcceptedCutoff))),
      db.execute<{ id: string; service: string; status: string; price: number | null; customer_name: string | null; provider_name: string | null; created_at: Date }>(
        sql`SELECT b.id, b.service, b.status, b.price, cu.name AS customer_name, pu.name AS provider_name, b.created_at FROM bookings b LEFT JOIN users cu ON cu.id = b.customer_id LEFT JOIN users pu ON pu.id = b.provider_id ORDER BY b.created_at DESC LIMIT 8`
      ),
      getPlatformSettings(),
    ]);

    const users = userStats[0] || {} as any;
    const bookings = bookingStats[0] || {} as any;
    const activeBookings = Number(bookings.acceptedBookings || 0) + Number(bookings.inProgressBookings || 0);
    const alerts = [
      { key: "verification", label: "Provider verifications waiting", count: Number(pendingVerification), severity: Number(pendingVerification) >= 10 ? "high" : "medium", to: "/verification" },
      { key: "withdrawals", label: "Withdrawal requests waiting", count: Number(pendingWithdrawals), severity: Number(pendingWithdrawals) >= 10 ? "high" : "medium", to: "/withdrawals" },
      { key: "refunds", label: "Refund requests waiting", count: Number(pendingRefunds), severity: Number(pendingRefunds) >= 5 ? "high" : "medium", to: "/refunds" },
      { key: "negotiations", label: "Overdue negotiations", count: Number(overdueNegotiations), severity: "high", to: "/negotiations" },
      { key: "accepted", label: "Accepted jobs idle for 2+ hours", count: Number(staleAcceptedBookings), severity: "high", to: "/bookings" },
      { key: "support", label: "Open support tickets", count: Number(openSupportTickets), severity: Number(openSupportTickets) >= 20 ? "high" : "medium", to: "/complaints" },
    ].filter((alert) => alert.count > 0);

    return res.json({
      dashboard: {
        users: Number(users.users || 0),
        providers: Number(users.providers || 0),
        customers: Number(users.customers || 0),
        admins: Number(users.admins || 0),
        premiumUsers: Number(users.premiumUsers || 0),
        blockedProviders: Number(blockedProviders),
        onlineProviders: Number(onlineProviders),
        pendingBookings: Number(bookings.pendingBookings || 0),
        acceptedBookings: Number(bookings.acceptedBookings || 0),
        inProgressBookings: Number(bookings.inProgressBookings || 0),
        activeBookings,
        completedBookings: Number(bookings.completedBookings || 0),
        cancelledBookings: Number(bookings.cancelledBookings || 0),
        pendingVerification: Number(pendingVerification),
        approvedVerification: Number(approvedVerification),
        openSupportTickets: Number(openSupportTickets),
        activePromotions: Number(activePromotions),
        activeCategories: Number(activeCategories),
        pendingCommissionPayments: Number(pendingCommissionPayments),
        pendingWithdrawals: Number(pendingWithdrawals),
        pendingRefunds: Number(pendingRefunds),
        pendingServiceRequests: Number(pendingServiceRequests),
        pendingRateRequests: Number(pendingRateRequests),
        pendingDeletionRequests: Number(pendingDeletionRequests),
        pendingSubscriptions: Number(pendingSubscriptions),
        activeSubscriptions: Number(activeSubscriptions),
        activeNegotiations: Number(activeNegotiations),
        overdueNegotiations: Number(overdueNegotiations),
        staleAcceptedBookings: Number(staleAcceptedBookings),
        totalCommission: Number(users.totalCommission || 0),
        pendingCommission: Number(users.pendingCommission || 0),
        earnedCommission: Number(bookings.earnedCommission || 0),
        completedJobValue: Number(bookings.completedJobValue || 0),
        totalRevenue: Number(bookings.completedJobValue || 0),
        alerts,
        recentBookings: Array.isArray(recentBookings) ? recentBookings.map((b: any) => ({
          id: b.id,
          service: b.service,
          status: b.status,
          price: b.price,
          customerName: b.customer_name,
          providerName: b.provider_name,
          createdAt: b.created_at,
        })) : (recentBookings as any)?.rows?.map((b: any) => ({
          id: b.id,
          service: b.service,
          status: b.status,
          price: b.price,
          customerName: b.customer_name,
          providerName: b.provider_name,
          createdAt: b.created_at,
        })) ?? [],
        settings,
        generatedAt: now.toISOString(),
      },
    });
  } catch (error) {
    logger.error({ err: error }, "admin dashboard error");
    return res.status(500).json({ error: "Failed to load dashboard" });
  }
});


type AdminWorkItem = {
  resourceType: string;
  id: string;
  status: string;
  title: string;
  description: string;
  personId?: string | null;
  personName?: string | null;
  personPublicId?: string | null;
  priority: "critical" | "high" | "normal";
  createdAt: Date | null;
  href: string;
  seen?: boolean;
};

router.get("/operations-inbox", requirePermission("dashboard.read"), async (req: AuthRequest, res) => {
  try {
    const perTypeLimit = Math.min(50, Math.max(5, Number(req.query.perTypeLimit) || 50));
    const requestedType = String(req.query.type || "all").trim();
    const visibility = String(req.query.visibility || "all").trim();
    const search = String(req.query.search || "").trim().slice(0, 120).toLowerCase();
    const fromValue = String(req.query.from || "").trim();
    const toValue = String(req.query.to || "").trim();
    const from = fromValue ? new Date(`${fromValue}T00:00:00.000Z`) : null;
    const to = toValue ? new Date(`${toValue}T23:59:59.999Z`) : null;
    const supportedTypes = new Set([
      "all", "admin_notification", "inactive_account_review", "provider_verification", "document_renewal",
      "rate_request", "refund", "withdrawal", "commission_payment", "subscription", "support_ticket",
      "reported_issue", "service_request", "deletion_request", "overdue_negotiation",
    ]);
    if (!supportedTypes.has(requestedType)) return res.status(400).json({ error: "Invalid operations inbox type" });
    if (!["all", "seen", "unseen"].includes(visibility)) return res.status(400).json({ error: "Invalid operations inbox visibility" });
    if (from && Number.isNaN(from.getTime())) return res.status(400).json({ error: "Invalid operations inbox from date" });
    if (to && Number.isNaN(to.getTime())) return res.status(400).json({ error: "Invalid operations inbox to date" });
    if (from && to && from > to) return res.status(400).json({ error: "Operations inbox date range is invalid" });
    const includeType = (type: string) => requestedType === "all" || requestedType === type;
    const queries: Array<Promise<AdminWorkItem[]>> = [];

    if (hasAdminPermission(req.user!, "notifications.read") && includeType("admin_notification")) {
      const adminId = req.user!.userId;
      queries.push(db.select().from(adminNotificationsTable)
        .where(or(eq(adminNotificationsTable.targetAdminId, adminId), isNull(adminNotificationsTable.targetAdminId)))
        .orderBy(desc(adminNotificationsTable.createdAt)).limit(perTypeLimit).then((rows) => rows.map((row) => ({
          resourceType: "admin_notification", id: row.id, status: "open", title: row.title,
          description: row.message.slice(0, 180),
          priority: row.type === "error" || row.type === "security" ? "critical" as const : row.type === "warning" ? "high" as const : "normal" as const,
          createdAt: row.createdAt, href: row.link || "/",
          seen: Array.isArray(row.readByAdminIds) && row.readByAdminIds.includes(adminId),
        }))));
    }

    if (hasAdminPermission(req.user!, "users.read") && includeType("inactive_account_review")) {
      queries.push(db.select({
        id: usersTable.id, status: usersTable.inactivityState, name: usersTable.name,
        publicId: usersTable.publicId, createdAt: usersTable.inactivityReviewAt,
      }).from(usersTable).where(and(
        eq(usersTable.inactivityState, "review"),
        eq(usersTable.accountStatus, "active"),
        eq(usersTable.isDeactivated, false),
        eq(usersTable.isBlocked, false),
      )).orderBy(desc(usersTable.inactivityReviewAt)).limit(perTypeLimit).then((rows) => rows.map((row) => ({
        resourceType: "inactive_account_review", id: row.id, status: row.status || "review",
        title: "Inactive account review", description: `${row.name} requires an admin retention review.`,
        personId: row.id, personName: row.name, personPublicId: row.publicId,
        priority: "normal" as const, createdAt: row.createdAt, href: `/inactive-accounts?focus=${encodeURIComponent(row.id)}`,
      }))));
    }

    if (hasAdminPermission(req.user!, "verification.write")) {
      if (includeType("provider_verification")) queries.push(db.select({
        id: usersTable.id, status: usersTable.verificationStatus, name: usersTable.name,
        publicId: usersTable.publicId, createdAt: usersTable.joinedAt,
      }).from(usersTable).where(and(eq(usersTable.role, "provider"), inArray(usersTable.verificationStatus, ["pending", "in_process"])))
        .orderBy(desc(usersTable.joinedAt)).limit(perTypeLimit).then((rows) => rows.map((row) => ({
          resourceType: "provider_verification", id: row.id, status: row.status || "pending",
          title: "Provider verification", description: `${row.name} is waiting for identity review.`,
          personId: row.id, personName: row.name, personPublicId: row.publicId, priority: "high" as const,
          createdAt: row.createdAt, href: `/verification?focus=${encodeURIComponent(row.id)}`,
        }))));
      if (includeType("document_renewal")) queries.push(db.select().from(providerDocumentUpdateRequestsTable)
        .where(eq(providerDocumentUpdateRequestsTable.status, "pending"))
        .orderBy(desc(providerDocumentUpdateRequestsTable.createdAt)).limit(perTypeLimit).then((rows) => rows.map((row) => ({
          resourceType: "document_renewal", id: row.id, status: row.status,
          title: "Document renewal", description: `${row.documentType.replace(/_/g, " ")} replacement requires review.`,
          personId: row.providerId, priority: "high" as const, createdAt: row.createdAt,
          href: `/document-renewals?focus=${encodeURIComponent(row.id)}`,
        }))));
      if (includeType("rate_request")) queries.push(db.select().from(hourlyRateRequestsTable).where(eq(hourlyRateRequestsTable.status, "pending"))
        .orderBy(desc(hourlyRateRequestsTable.createdAt)).limit(perTypeLimit).then((rows) => rows.map((row) => ({
          resourceType: "rate_request", id: row.id, status: row.status || "pending", title: "Hourly rate request",
          description: `${row.providerName} requested a new rate for ${row.service}.`, personId: row.providerId,
          personName: row.providerName, priority: "normal" as const, createdAt: row.createdAt,
          href: `/rate-requests?focus=${encodeURIComponent(row.id)}`,
        }))));
    }

    if (hasAdminPermission(req.user!, "finance.write") || hasAdminPermission(req.user!, "finance.read")) {
      if (includeType("refund")) queries.push(db.select().from(refundRequestsTable).where(eq(refundRequestsTable.status, "pending"))
        .orderBy(desc(refundRequestsTable.createdAt)).limit(perTypeLimit).then((rows) => rows.map((row) => ({
          resourceType: "refund", id: row.id, status: row.status, title: "Refund request",
          description: `${row.bookingPublicId || "Booking"} · Rs. ${row.amountRequested.toLocaleString("en-PK")}`,
          personId: row.customerId, priority: "high" as const, createdAt: row.createdAt,
          href: `/refunds?focus=${encodeURIComponent(row.id)}`,
        }))));
      if (includeType("withdrawal")) queries.push(db.select().from(withdrawalRequestsTable).where(eq(withdrawalRequestsTable.status, "pending"))
        .orderBy(desc(withdrawalRequestsTable.createdAt)).limit(perTypeLimit).then((rows) => rows.map((row) => ({
          resourceType: "withdrawal", id: row.id, status: row.status, title: "Withdrawal request",
          description: `Provider withdrawal · Rs. ${row.amount.toLocaleString("en-PK")}`, personId: row.providerId,
          priority: "high" as const, createdAt: row.createdAt, href: `/withdrawals?focus=${encodeURIComponent(row.id)}`,
        }))));
      if (includeType("commission_payment")) queries.push(db.select().from(commissionPaymentsTable).where(eq(commissionPaymentsTable.status, "pending"))
        .orderBy(desc(commissionPaymentsTable.createdAt)).limit(perTypeLimit).then((rows) => rows.map((row) => ({
          resourceType: "commission_payment", id: row.id, status: row.status, title: "Commission payment",
          description: `Payment proof · Rs. ${row.amount.toLocaleString("en-PK")}${row.reference ? ` · ${row.reference}` : ""}`,
          personId: row.providerId, priority: "normal" as const, createdAt: row.createdAt,
          href: `/commission?focus=${encodeURIComponent(row.id)}`,
        }))));
      if (includeType("subscription")) queries.push(db.select().from(userSubscriptionsTable).where(eq(userSubscriptionsTable.status, "pending"))
        .orderBy(desc(userSubscriptionsTable.createdAt)).limit(perTypeLimit).then((rows) => rows.map((row) => ({
          resourceType: "subscription", id: row.id, status: row.status, title: "Subscription review",
          description: `Premium application · Rs. ${row.amount.toLocaleString("en-PK")}`, personId: row.userId,
          priority: "normal" as const, createdAt: row.createdAt, href: `/plans?tab=subs&status=pending&focus=${encodeURIComponent(row.id)}`,
        }))));
    }

    if (hasAdminPermission(req.user!, "complaints.read") || hasAdminPermission(req.user!, "support.read")) {
      if (includeType("support_ticket")) queries.push(db.select().from(supportTicketsTable).where(inArray(supportTicketsTable.status, ["open", "in_progress"]))
        .orderBy(desc(supportTicketsTable.createdAt)).limit(perTypeLimit).then((rows) => rows.map((row) => ({
          resourceType: "support_ticket", id: row.id, status: row.status, title: row.subject,
          description: row.message.slice(0, 160), personId: row.userId, personName: row.userName,
          priority: row.priority === "urgent" ? "critical" as const : row.priority === "high" ? "high" as const : "normal" as const,
          createdAt: row.createdAt, href: `/complaints?focus=${encodeURIComponent(row.id)}`,
        }))));
      if (includeType("reported_issue")) queries.push(db.select().from(reportIssuesTable).where(inArray(reportIssuesTable.status, ["open", "under_review"]))
        .orderBy(desc(reportIssuesTable.createdAt)).limit(perTypeLimit).then((rows) => rows.map((row) => ({
          resourceType: "reported_issue", id: row.id, status: row.status || "open", title: `Reported issue: ${row.category}`,
          description: row.description.slice(0, 160), personId: row.reporterId, personName: row.reporterName,
          priority: row.category === "fraud" ? "critical" as const : "high" as const, createdAt: row.createdAt,
          href: `/reported-issues?focus=${encodeURIComponent(row.id)}`,
        }))));
    }

    if (hasAdminPermission(req.user!, "operations.read")) {
      if (includeType("service_request")) queries.push(db.select().from(serviceAddRequestsTable).where(eq(serviceAddRequestsTable.status, "pending"))
        .orderBy(desc(serviceAddRequestsTable.createdAt)).limit(perTypeLimit).then((rows) => rows.map((row) => ({
          resourceType: "service_request", id: row.id, status: row.status, title: "Service addition request",
          description: row.serviceName, personId: row.providerId, priority: "normal" as const, createdAt: row.createdAt,
          href: `/requests?tab=services&focus=${encodeURIComponent(row.id)}`,
        }))));
      if (includeType("deletion_request")) queries.push(db.select().from(accountDeletionRequestsTable).where(eq(accountDeletionRequestsTable.status, "pending"))
        .orderBy(desc(accountDeletionRequestsTable.createdAt)).limit(perTypeLimit).then((rows) => rows.map((row) => ({
          resourceType: "deletion_request", id: row.id, status: row.status, title: "Account deletion request",
          description: row.reason || "Deletion requires operational review.", personId: row.userId,
          priority: "high" as const, createdAt: row.createdAt, href: `/requests?tab=deletions&focus=${encodeURIComponent(row.id)}`,
        }))));
      const overdue = new Date();
      if (includeType("overdue_negotiation")) queries.push(db.select().from(negotiationsTable).where(and(
        inArray(negotiationsTable.status, ["customer_offer", "provider_counter"]),
        lte(negotiationsTable.expiresAt, overdue),
      )).orderBy(desc(negotiationsTable.updatedAt)).limit(perTypeLimit).then((rows) => rows.map((row) => ({
        resourceType: "overdue_negotiation", id: row.id, status: row.status, title: "Overdue negotiation",
        description: `${row.customerName} ↔ ${row.providerName} · ${row.service}`, personId: row.customerId,
        personName: row.customerName, priority: "high" as const, createdAt: row.updatedAt,
        href: `/negotiations?focus=${encodeURIComponent(row.id)}`,
      }))));
    }

    let items = (await Promise.all(queries)).flat();
    const personIds = [...new Set(items.map((item) => item.personId).filter((value): value is string => Boolean(value)))];
    const people = personIds.length
      ? await db.select({ id: usersTable.id, name: usersTable.name, publicId: usersTable.publicId }).from(usersTable).where(inArray(usersTable.id, personIds))
      : [];
    const personMap = new Map(people.map((person) => [person.id, person]));
    const views = await db.select().from(adminWorkItemViewsTable)
      .where(eq(adminWorkItemViewsTable.adminId, req.user!.userId)).orderBy(desc(adminWorkItemViewsTable.seenAt)).limit(2_000);
    const seenKeys = new Set(views.map((view) => `${view.resourceType}:${view.resourceId}`));

    items = items.map((item) => {
      const person = item.personId ? personMap.get(item.personId) : null;
      return {
        ...item,
        personName: item.personName || person?.name || null,
        personPublicId: item.personPublicId || person?.publicId || null,
        seen: Boolean(item.seen) || seenKeys.has(`${item.resourceType}:${item.id}`),
      };
    });

    if (search) items = items.filter((item) => [item.title, item.description, item.personName, item.personPublicId, item.id].some((value) => String(value || "").toLowerCase().includes(search)));
    if (requestedType !== "all") items = items.filter((item) => item.resourceType === requestedType);
    if (visibility === "unseen") items = items.filter((item) => !item.seen);
    if (visibility === "seen") items = items.filter((item) => item.seen);
    if (from) items = items.filter((item) => item.createdAt && item.createdAt >= from);
    if (to) items = items.filter((item) => item.createdAt && item.createdAt <= to);
    items.sort((a, b) => {
      const severity = { critical: 3, high: 2, normal: 1 } as const;
      if (a.seen !== b.seen) return a.seen ? 1 : -1;
      if (severity[a.priority] !== severity[b.priority]) return severity[b.priority] - severity[a.priority];
      return Number(b.createdAt || 0) - Number(a.createdAt || 0);
    });

    return res.json({
      items,
      summary: {
        totalOpen: items.length,
        unseen: items.filter((item) => !item.seen).length,
        critical: items.filter((item) => item.priority === "critical").length,
        high: items.filter((item) => item.priority === "high").length,
      },
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    logger.error({ err: error }, "admin operations inbox error");
    return res.status(500).json({ error: "Failed to load operations inbox" });
  }
});

router.post("/operations-inbox/seen", requirePermission("dashboard.read"), async (req: AuthRequest, res) => {
  try {
    const rawItems = Array.isArray(req.body?.items) ? req.body.items.slice(0, 200) : [];
    const items = rawItems.map((item: any) => ({
      resourceType: String(item?.resourceType || "").trim(),
      resourceId: String(item?.resourceId || item?.id || "").trim(),
    })).filter((item: any) => /^[a-z0-9_]{2,60}$/.test(item.resourceType) && item.resourceId.length >= 8 && item.resourceId.length <= 120);
    if (!items.length) return res.status(400).json({ error: "At least one valid work item is required" });
    const now = new Date();
    await db.insert(adminWorkItemViewsTable).values(items.map((item: any) => ({
      id: generateId(), adminId: req.user!.userId, resourceType: item.resourceType, resourceId: item.resourceId, seenAt: now,
    }))).onConflictDoUpdate({
      target: [adminWorkItemViewsTable.adminId, adminWorkItemViewsTable.resourceType, adminWorkItemViewsTable.resourceId],
      set: { seenAt: now },
    });
    const notificationIds = items.filter((item: any) => item.resourceType === "admin_notification").map((item: any) => item.resourceId);
    if (notificationIds.length) {
      const adminId = req.user!.userId;
      await db.update(adminNotificationsTable).set({
        readByAdminIds: sql`COALESCE(${adminNotificationsTable.readByAdminIds}, '[]'::jsonb) || jsonb_build_array(${adminId}::text)`,
      }).where(and(
        inArray(adminNotificationsTable.id, notificationIds),
        or(eq(adminNotificationsTable.targetAdminId, adminId), isNull(adminNotificationsTable.targetAdminId)),
        sql`NOT (COALESCE(${adminNotificationsTable.readByAdminIds}, '[]'::jsonb) @> jsonb_build_array(${adminId}::text))`,
      ));
    }
    return res.json({ success: true, seen: items.length });
  } catch (error) {
    logger.error({ err: error }, "admin operations inbox seen error");
    return res.status(500).json({ error: "Failed to update work-item visibility" });
  }
});

// CUSTOMER MANAGEMENT
router.get("/customers", requirePermission("users.read"), async (req: AuthRequest, res) => {
  try {
    const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
    const status = typeof req.query.status === "string" ? req.query.status : "all";
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25));
    const offset = (page - 1) * limit;
    const sort = ["name", "joinedAt", "totalJobs"].includes(String(req.query.sort)) ? String(req.query.sort) : "joinedAt";
    const direction = req.query.direction === "asc" ? "asc" : "desc";
    const from = typeof req.query.from === "string" && req.query.from ? new Date(`${req.query.from}T00:00:00.000Z`) : null;
    const to = typeof req.query.to === "string" && req.query.to ? new Date(`${req.query.to}T23:59:59.999Z`) : null;
    const conditions: any[] = [eq(usersTable.role, "customer")];
    if (search) conditions.push(or(
      ilike(usersTable.publicId, `%${search}%`),
      ilike(usersTable.name, `%${search}%`),
      ilike(usersTable.phone, `%${search}%`),
      ilike(usersTable.email, `%${search}%`),
    ));
    if (from && !Number.isNaN(from.getTime())) conditions.push(gte(usersTable.joinedAt, from));
    if (to && !Number.isNaN(to.getTime())) conditions.push(lte(usersTable.joinedAt, to));
    if (status === "active") conditions.push(eq(usersTable.isDeactivated, false));
    if (status === "deactivated") conditions.push(eq(usersTable.isDeactivated, true));
    const where = and(...conditions);
    const orderColumn = sort === "name" ? usersTable.name : sort === "totalJobs" ? usersTable.totalJobs : usersTable.joinedAt;
    const [rows, [countRow]] = await Promise.all([
      db.select().from(usersTable).where(where).orderBy(direction === "asc" ? sql`${orderColumn} asc` : sql`${orderColumn} desc`).limit(limit).offset(offset),
      db.select({ total: sql<number>`count(*)::int` }).from(usersTable).where(where),
    ]);
    return res.json({ customers: rows.map(toSafeUser), total: Number(countRow?.total || 0), page, limit });
  } catch (error) { logger.error({ err: error }, "admin customer list error"); return res.status(500).json({ error: "Failed to load customers" }); }
});

async function findCustomer(id: string) {
  const row = await db.query.usersTable.findFirst({ where: eq(usersTable.id, id) });
  return row?.role === "customer" ? row : null;
}

router.patch("/customers/:id/deactivate", requirePermission("users.write"), async (req: AuthRequest, res) => {
  const reason = String(req.body?.reason || "").trim();
  if (reason.length < 5) return res.status(400).json({ error: "A deactivation reason of at least 5 characters is required" });
  const customer = await findCustomer(String(req.params.id));
  if (!customer) return res.status(404).json({ error: "Customer not found" });
  await db.update(usersTable).set({ isDeactivated: true, updatedAt: new Date() }).where(eq(usersTable.id, customer.id));
  await revokeAllUserSessions(customer.id, "customer_deactivated_by_admin");
  await notifyUser({ userId: customer.id, title: "Account deactivated", body: reason, type: "system", link: "/profile", data: { source: "admin" }, email: { category: "security", templateKey: "account_status", variables: { status: "deactivated", reason } } }).catch(() => undefined);
  await logAdminAction(req, "customer_deactivated", "user", customer.id, { reason, customerName: customer.name });
  return res.json({ success: true });
});

router.patch("/customers/:id/reactivate", requirePermission("users.write"), async (req: AuthRequest, res) => {
  const reason = String(req.body?.reason || "").trim();
  if (reason.length < 5) return res.status(400).json({ error: "A reactivation reason of at least 5 characters is required" });
  const customer = await findCustomer(String(req.params.id));
  if (!customer) return res.status(404).json({ error: "Customer not found" });
  await db.update(usersTable).set({ isDeactivated: false, updatedAt: new Date() }).where(eq(usersTable.id, customer.id));
  await notifyUser({ userId: customer.id, title: "Account reactivated", body: reason, type: "system", link: "/profile", data: { source: "admin" }, email: { category: "security", templateKey: "account_status", variables: { status: "active", reason } } }).catch(() => undefined);
  await logAdminAction(req, "customer_reactivated", "user", customer.id, { reason, customerName: customer.name });
  return res.json({ success: true });
});

router.post("/customers/:id/revoke-sessions", requirePermission("users.write"), async (req: AuthRequest, res) => {
  const reason = String(req.body?.reason || "").trim();
  if (reason.length < 5) return res.status(400).json({ error: "A force-logout reason of at least 5 characters is required" });
  const customer = await findCustomer(String(req.params.id));
  if (!customer) return res.status(404).json({ error: "Customer not found" });
  await revokeAllUserSessions(customer.id, "customer_sessions_revoked_by_admin");
  await logAdminAction(req, "customer_sessions_revoked", "user", customer.id, { reason, customerName: customer.name });
  return res.json({ success: true });
});

router.patch("/customers/:id/profile", requirePermission("users.write"), async (req: AuthRequest, res) => {
  const reason = String(req.body?.reason || "").trim();
  const name = String(req.body?.name || "").trim();
  const location = req.body?.location == null ? null : String(req.body.location).trim();
  const bio = req.body?.bio == null ? null : String(req.body.bio).trim();
  if (reason.length < 5) return res.status(400).json({ error: "A profile-change reason of at least 5 characters is required" });
  if (name.length < 2 || name.length > 80) return res.status(400).json({ error: "Name must be 2 to 80 characters" });
  if (location && location.length > 120) return res.status(400).json({ error: "Location is too long" });
  if (bio && bio.length > 500) return res.status(400).json({ error: "Bio must be 500 characters or fewer" });
  const customer = await findCustomer(String(req.params.id));
  if (!customer) return res.status(404).json({ error: "Customer not found" });
  await db.update(usersTable).set({ name, location, bio, updatedAt: new Date() }).where(eq(usersTable.id, customer.id));
  await logAdminAction(req, "customer_profile_corrected", "user", customer.id, { reason, before: { name: customer.name, location: customer.location, bio: customer.bio }, after: { name, location, bio } });
  return res.json({ success: true });
});

router.get("/customers/:id/activity", requirePermission("users.read"), async (req: AuthRequest, res) => {
  try {
    const userId = String(req.params.id);
    const customer = await findCustomer(userId);
    if (!customer) return res.status(404).json({ error: "Customer not found" });
    const canBookings = hasAdminPermission(req.user!, "bookings.read");
    const canFinance = hasAdminPermission(req.user!, "finance.read");
    const canSupport = hasAdminPermission(req.user!, "support.read") || hasAdminPermission(req.user!, "complaints.read");
    const canAudit = hasAdminPermission(req.user!, "audit.read");
    const [bookings, negotiations, notifications, tickets, reviewsGiven, invoices, refunds, logins, broadcasts] = await Promise.all([
      canBookings ? db.select().from(bookingsTable).where(eq(bookingsTable.customerId, userId)).orderBy(desc(bookingsTable.createdAt)).limit(200) : Promise.resolve([]),
      canBookings ? db.select().from(negotiationsTable).where(eq(negotiationsTable.customerId, userId)).orderBy(desc(negotiationsTable.createdAt)).limit(100) : Promise.resolve([]),
      db.select().from(notificationsTable).where(eq(notificationsTable.userId, userId)).orderBy(desc(notificationsTable.createdAt)).limit(100),
      canSupport ? db.select().from(supportTicketsTable).where(eq(supportTicketsTable.userId, userId)).orderBy(desc(supportTicketsTable.createdAt)).limit(50) : Promise.resolve([]),
      db.select().from(reviewsTable).where(eq(reviewsTable.reviewerId, userId)).orderBy(desc(reviewsTable.createdAt)).limit(50),
      canFinance ? db.select().from(invoicesTable).where(eq(invoicesTable.customerId, userId)).orderBy(desc(invoicesTable.createdAt)).limit(100) : Promise.resolve([]),
      canFinance ? db.select().from(refundRequestsTable).where(eq(refundRequestsTable.customerId, userId)).orderBy(desc(refundRequestsTable.createdAt)).limit(50) : Promise.resolve([]),
      canAudit ? db.select().from(loginHistoryTable).where(eq(loginHistoryTable.userId, userId)).orderBy(desc(loginHistoryTable.createdAt)).limit(50) : Promise.resolve([]),
      db.select().from(broadcastRequestsTable).where(eq(broadcastRequestsTable.customerId, userId)).orderBy(desc(broadcastRequestsTable.createdAt)).limit(100),
    ]);
    const completed = bookings.filter((b: any) => b.status === "completed");
    return res.json({ user: toSafeUser(customer), capabilities: { bookings: canBookings, finance: canFinance, support: canSupport, audit: canAudit }, stats: { totalBookings: bookings.length, active: bookings.filter((b: any) => ["pending", "accepted", "in_progress"].includes(b.status)).length, completed: completed.length, cancelled: bookings.filter((b: any) => b.status === "cancelled").length, totalAmount: completed.reduce((sum: number, b: any) => sum + Number(b.price || 0), 0), offersSubmitted: negotiations.length, offersAccepted: negotiations.filter((n: any) => n.status === "accepted").length, offersRejected: negotiations.filter((n: any) => n.status === "rejected").length, notifications: notifications.length, complaints: tickets.length }, bookings, negotiations, notifications, complaints: tickets, reviewsGiven, reviewsReceived: [], invoices, commissions: [], withdrawals: [], refunds, loginHistory: logins, broadcasts, documents: [] });
  } catch (error) { logger.error({ err: error }, "admin customer activity error"); return res.status(500).json({ error: "Failed to load customer activity" }); }
});

router.get("/users", requirePermission("users.read"), async (req, res) => {
  try {
    const role =
      typeof req.query.role === "string" && req.query.role.trim()
        ? req.query.role.trim()
        : undefined;
    const search =
      typeof req.query.search === "string" && req.query.search.trim()
        ? req.query.search.trim()
        : undefined;

    const conditions = [] as any[];
    if (role) conditions.push(eq(usersTable.role, role));
    if (search) {
      conditions.push(
        or(
          ilike(usersTable.publicId, `%${search}%`),
          ilike(usersTable.name, `%${search}%`),
          ilike(usersTable.phone, `%${search}%`),
          ilike(usersTable.email, `%${search}%`)
        )
      );
    }

    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 100));
    const offset = (page - 1) * limit;

    const users = await db
      .select()
      .from(usersTable)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(usersTable.updatedAt))
      .limit(limit)
      .offset(offset);

    return res.json({ users: users.map((user) => toSafeUser(user)), page, limit });
  } catch (error) {
    logger.error({ err: error }, "admin users error");
    return res.status(500).json({ error: "Failed to load users" });
  }
});

router.get("/users/:id", requirePermission("users.read"), async (req, res) => {
  try {
    const user = await db.query.usersTable.findFirst({
      where: eq(usersTable.id, String(req.params.id)),
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    return res.json({ user: toSafeUser(user) });
  } catch (error) {
    logger.error({ err: error }, "admin user detail error");
    return res.status(500).json({ error: "Failed to load user details" });
  }
});

router.patch("/users/:id/status", requirePermission("users.write"), async (_req, res) => {
  return res.status(410).json({ error: "Generic account status updates are disabled. Use the provider-specific verification, block, or deactivation workflow, or the dedicated customer workflow." });
});

router.get("/providers", requirePermission("users.read"), async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 100));
    const offset = (page - 1) * limit;
    const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
    const status = typeof req.query.status === "string" ? req.query.status.trim() : "all";
    const from = typeof req.query.from === "string" && req.query.from ? new Date(`${req.query.from}T00:00:00.000Z`) : null;
    const to = typeof req.query.to === "string" && req.query.to ? new Date(`${req.query.to}T23:59:59.999Z`) : null;
    const conditions: any[] = [eq(usersTable.role, "provider")];
    if (search) {
      conditions.push(or(
        ilike(usersTable.publicId, `%${search}%`),
        ilike(usersTable.name, `%${search}%`),
        ilike(usersTable.phone, `%${search}%`),
        ilike(usersTable.email, `%${search}%`),
        ilike(usersTable.cnicNumber, `%${search}%`),
      ));
    }
    if (from && !Number.isNaN(from.getTime())) conditions.push(gte(usersTable.joinedAt, from));
    if (to && !Number.isNaN(to.getTime())) conditions.push(lte(usersTable.joinedAt, to));
    if (status === "blocked") conditions.push(eq(usersTable.isBlocked, true));
    if (status === "verified") conditions.push(eq(usersTable.isVerified, true));
    if (status === "unverified") conditions.push(eq(usersTable.isVerified, false));
    if (status === "available") conditions.push(eq(usersTable.isAvailable, true));
    if (status === "offline") conditions.push(eq(usersTable.isAvailable, false));
    if (status === "deactivated") conditions.push(eq(usersTable.isDeactivated, true));

    const where = and(...conditions);
    const [providers, [summary]] = await Promise.all([
      db.select().from(usersTable).where(where).orderBy(desc(usersTable.updatedAt)).limit(limit).offset(offset),
      db.select({ total: sql<number>`count(*)::int` }).from(usersTable).where(where),
    ]);
    return res.json({ providers: providers.map((provider) => toSafeUser(provider)), page, limit, total: Number(summary?.total || 0) });
  } catch (error) {
    logger.error({ err: error }, "admin providers error");
    return res.status(500).json({ error: "Failed to load providers" });
  }
});

router.patch("/providers/:id/commission-limit", requirePermission("finance.write"), async (req: AuthRequest, res) => {
  try {
    const limit = Number((req.body as any).commissionLimit);
    if (!Number.isFinite(limit) || limit < 0) {
      return res.status(400).json({ error: "Valid commissionLimit is required" });
    }

    const provider = await db.query.usersTable.findFirst({
      where: eq(usersTable.id, String(req.params.id)),
    });
    if (!provider || provider.role !== "provider") {
      return res.status(404).json({ error: "Provider not found" });
    }

    const shouldBlock = Number(provider.pendingCommission || 0) >= limit;
    await db
      .update(usersTable)
      .set({
        commissionLimit: limit,
        isBlocked: shouldBlock,
        blockedReason: shouldBlock
          ? "Commission due limit reached. Please clear your Athoo dues."
          : null,
        updatedAt: new Date(),
      })
      .where(eq(usersTable.id, String(req.params.id)));

    const updated = await db.query.usersTable.findFirst({
      where: eq(usersTable.id, String(req.params.id)),
    });
    await logAdminAction(req, "provider_commission_limit_updated", "user", req.params.id, { commissionLimit: limit });
    return res.json({ provider: toSafeUser(updated) });
  } catch (error) {
    logger.error({ err: error }, "admin commission limit error");
    return res.status(500).json({ error: "Failed to update commission limit" });
  }
});

router.post("/providers/:id/commission-payment", requirePermission("finance.write"), async (req: AuthRequest, res) => {
  try {
    const amount = Number((req.body as any).amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ error: "Valid payment amount is required" });
    }

    const provider = await db.query.usersTable.findFirst({
      where: eq(usersTable.id, String(req.params.id)),
    });
    if (!provider || provider.role !== "provider") {
      return res.status(404).json({ error: "Provider not found" });
    }

    const nextPending = Math.max(0, Number(provider.pendingCommission || 0) - amount);
    const shouldBlock =
      nextPending >=
      Number(provider.commissionLimit || DEFAULT_PLATFORM_SETTINGS.defaultCommissionLimit);

    await db
      .update(usersTable)
      .set({
        pendingCommission: nextPending,
        isBlocked: shouldBlock,
        blockedReason: shouldBlock
          ? "Commission due limit reached. Please clear your Athoo dues."
          : null,
        lastCommissionPaymentAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(usersTable.id, String(req.params.id)));

    const updated = await db.query.usersTable.findFirst({
      where: eq(usersTable.id, String(req.params.id)),
    });
    await logAdminAction(req, "provider_commission_payment_recorded", "user", req.params.id, { amount });
    return res.json({ provider: toSafeUser(updated) });
  } catch (error) {
    logger.error({ err: error }, "admin commission payment error");
    return res.status(500).json({ error: "Failed to record commission payment" });
  }
});

router.get("/bookings", requirePermission("bookings.read"), async (req, res) => {
  try {
    const status = typeof req.query.status === "string" && req.query.status.trim() ? req.query.status.trim() : undefined;
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const dateFrom = typeof req.query.dateFrom === "string" ? req.query.dateFrom.trim() : "";
    const dateTo = typeof req.query.dateTo === "string" ? req.query.dateTo.trim() : "";
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25));
    const offset = (page - 1) * limit;
    const conditions = [];
    if (status === "active") conditions.push(inArray(bookingsTable.status, ["accepted", "in_progress"]));
    else if (status) conditions.push(eq(bookingsTable.status, status));
    if (dateFrom) conditions.push(gte(bookingsTable.scheduledDate, dateFrom));
    if (dateTo) conditions.push(lte(bookingsTable.scheduledDate, dateTo));
    if (q) {
      const like = `%${q}%`;
      conditions.push(or(
        ilike(bookingsTable.customerName, like),
        ilike(bookingsTable.providerName, like),
        ilike(bookingsTable.customerPhone, like),
        ilike(bookingsTable.providerPhone, like),
        ilike(bookingsTable.service, like),
        ilike(bookingsTable.address, like),
        eq(bookingsTable.id, q),
        eq(bookingsTable.publicId, q),
      ));
    }
    const where = conditions.length ? and(...conditions) : undefined;
    const [bookings, countRows, statusRows] = await Promise.all([
      db.select().from(bookingsTable).where(where).orderBy(desc(bookingsTable.createdAt)).limit(limit).offset(offset),
      db.select({ count: sql<number>`count(*)::int` }).from(bookingsTable).where(where),
      db.select({ status: bookingsTable.status, count: sql<number>`count(*)::int` }).from(bookingsTable).groupBy(bookingsTable.status),
    ]);
    const counts: Record<string, number> = { all: 0, pending: 0, accepted: 0, in_progress: 0, completed: 0, cancelled: 0 };
    for (const row of statusRows) {
      const value = Number(row.count || 0);
      counts[row.status] = value;
      counts.all += value;
    }
    return res.json({ bookings, page, limit, total: Number(countRows[0]?.count || 0), counts });
  } catch (error) {
    logger.error({ err: error }, "admin bookings error");
    return res.status(500).json({ error: "Failed to load bookings" });
  }
});

router.get("/bookings/:id/operations", requirePermission("bookings.read"), async (req, res) => {
  const bookingId = String(req.params.id);
  const booking = await db.query.bookingsTable.findFirst({ where: eq(bookingsTable.id, bookingId) });
  if (!booking) return res.status(404).json({ error: "Booking not found" });
  const operations = await db.select().from(bookingOperationsTable)
    .where(eq(bookingOperationsTable.bookingId, bookingId))
    .orderBy(desc(bookingOperationsTable.createdAt));
  return res.json({ booking, operations });
});

router.patch("/bookings/:id/cancel", requirePermission("bookings.write"), async (req: AuthRequest, res) => {
  try {
    const bookingId = String(req.params.id);
    const reason = String(req.body?.reason || "").trim();
    if (reason.length < 10) return res.status(400).json({ error: "A cancellation reason of at least 10 characters is required" });
    const existing = await db.query.bookingsTable.findFirst({ where: eq(bookingsTable.id, bookingId) });
    if (!existing) return res.status(404).json({ error: "Booking not found" });
    if (!["pending", "accepted"].includes(existing.status)) return res.status(409).json({ error: "Only pending or accepted unstarted bookings can be cancelled by operations" });
    if (existing.providerArrivedAt || existing.jobStartedAt || existing.paymentStatus !== "pending") {
      return res.status(409).json({ error: "This booking has arrival, work, or payment activity and must use the dispute workflow" });
    }
    const admin = await db.query.usersTable.findFirst({ where: eq(usersTable.id, req.user!.userId) });
    const result = await db.transaction(async (tx) => {
      const [updated] = await tx.update(bookingsTable).set({ status: "cancelled", updatedAt: new Date() })
        .where(and(eq(bookingsTable.id, bookingId), eq(bookingsTable.status, existing.status))).returning();
      if (!updated) return null;
      await tx.insert(bookingOperationsTable).values({
        id: generateId(), bookingId, adminId: req.user!.userId, adminName: admin?.name || "Athoo Admin",
        action: "cancelled", reason: reason.slice(0, 500), fromProviderId: existing.providerId,
        previousStatus: existing.status, nextStatus: "cancelled", metadata: { publicId: existing.publicId },
      });
      return updated;
    });
    if (!result) return res.status(409).json({ error: "Booking changed on another device. Refresh and try again." });
    if (["accepted", "in_progress"].includes(existing.status)) {
      await restoreProviderAvailabilityIfCompliant(existing.providerId, "admin_cancelled");
    }
    await logAdminAction(req, "booking_cancelled_by_operations", "booking", bookingId, { reason, previousStatus: existing.status });
    emitToUser(result.customerId, "booking:cancelled", { booking: result, reason });
    emitToUser(result.providerId, "booking:cancelled", { booking: result, reason });
    await Promise.all([
      notifyUser({ userId: result.customerId, title: "Booking cancelled by Athoo", body: reason, type: "booking", link: `/bookings/${bookingId}`, data: { bookingId } }),
      notifyUser({ userId: result.providerId, title: "Booking cancelled by Athoo", body: reason, type: "booking", link: `/bookings/${bookingId}`, data: { bookingId } }),
    ]).catch(() => undefined);
    return res.json({ booking: result });
  } catch (error) {
    logger.error({ err: error }, "admin booking cancellation error");
    return res.status(500).json({ error: "Failed to cancel booking" });
  }
});

router.patch("/bookings/:id/reassign", requirePermission("bookings.write"), async (req: AuthRequest, res) => {
  try {
    const bookingId = String(req.params.id);
    const providerId = String(req.body?.providerId || "").trim();
    const reason = String(req.body?.reason || "").trim();
    if (!providerId) return res.status(400).json({ error: "A replacement provider is required" });
    if (reason.length < 10) return res.status(400).json({ error: "A reassignment reason of at least 10 characters is required" });
    const existing = await db.query.bookingsTable.findFirst({ where: eq(bookingsTable.id, bookingId) });
    if (!existing) return res.status(404).json({ error: "Booking not found" });
    if (existing.status !== "pending") return res.status(409).json({ error: "Only pending, unaccepted bookings can be reassigned" });
    if (existing.providerArrivedAt || existing.jobStartedAt || existing.paymentStatus !== "pending") return res.status(409).json({ error: "This booking is no longer eligible for reassignment" });
    if (providerId === existing.providerId) return res.status(400).json({ error: "Choose a different provider" });
    const provider = await db.query.usersTable.findFirst({ where: eq(usersTable.id, providerId) });
    if (!provider || provider.role !== "provider" || provider.accountStatus !== "active" || provider.isDeactivated || provider.isBlocked || !provider.isVerified || provider.verificationStatus !== "approved" || !provider.isAvailable) {
      return res.status(400).json({ error: "The replacement provider is not active, approved, and available" });
    }
    const services = Array.isArray(provider.services) ? provider.services.map(String) : [];
    if (existing.categorySlug && !services.includes(existing.categorySlug)) return res.status(400).json({ error: "The replacement provider is not approved for this service" });
    const block = await getProviderActiveWorkBlock(providerId);
    if (block.blocked) return res.status(409).json({ error: block.message || "The replacement provider is busy" });
    if (!(await providerScheduleAllows(providerId, existing.scheduledDate, existing.scheduledTime))) return res.status(400).json({ error: "The replacement provider is unavailable at the scheduled time" });
    const customerLat = Number(existing.customerLat ?? existing.pickedLat);
    const customerLng = Number(existing.customerLng ?? existing.pickedLng);
    if (Number.isFinite(customerLat) && Number.isFinite(customerLng) && !providerWithinRadius(provider, customerLat, customerLng).allowed) {
      return res.status(400).json({ error: "The booking address is outside the replacement provider's service radius" });
    }
    const admin = await db.query.usersTable.findFirst({ where: eq(usersTable.id, req.user!.userId) });
    const updated = await db.transaction(async (tx) => {
      const [row] = await tx.update(bookingsTable).set({
        providerId, providerName: provider.name, providerPhone: provider.phone,
        ratePerHour: provider.ratePerHour || existing.ratePerHour, updatedAt: new Date(),
      }).where(and(eq(bookingsTable.id, bookingId), eq(bookingsTable.status, "pending"), eq(bookingsTable.providerId, existing.providerId))).returning();
      if (!row) return null;
      await tx.insert(bookingOperationsTable).values({
        id: generateId(), bookingId, adminId: req.user!.userId, adminName: admin?.name || "Athoo Admin",
        action: "reassigned", reason: reason.slice(0, 500), fromProviderId: existing.providerId, toProviderId: providerId,
        previousStatus: existing.status, nextStatus: row.status, metadata: { publicId: existing.publicId },
      });
      return row;
    });
    if (!updated) return res.status(409).json({ error: "Booking changed on another device. Refresh and try again." });
    await logAdminAction(req, "booking_reassigned_by_operations", "booking", bookingId, { reason, fromProviderId: existing.providerId, toProviderId: providerId });
    emitToUser(existing.providerId, "booking:cancelled", { booking: existing, reason: `Reassigned by Athoo: ${reason}` });
    emitToUser(providerId, "booking:new", { booking: updated });
    emitToUser(updated.customerId, "booking:updated", { booking: updated });
    await Promise.all([
      notifyUser({ userId: existing.providerId, title: "Booking reassigned", body: reason, type: "booking", link: `/bookings/${bookingId}`, data: { bookingId } }),
      notifyUser({ userId: providerId, title: "New booking assigned", body: `${updated.service} — ${reason}`, type: "booking", link: `/bookings/${bookingId}`, data: { bookingId } }),
      notifyUser({ userId: updated.customerId, title: "Provider updated", body: `${provider.name} is now assigned to your booking.`, type: "booking", link: `/bookings/${bookingId}`, data: { bookingId } }),
    ]).catch(() => undefined);
    return res.json({ booking: updated });
  } catch (error) {
    logger.error({ err: error }, "admin booking reassignment error");
    return res.status(500).json({ error: "Failed to reassign booking" });
  }
});

router.get("/settings", requirePermission("settings.read"), async (_req, res) => {
  try {
    const settings = await getPlatformSettings();
    return res.json({ settings });
  } catch (error) {
    logger.error({ err: error }, "admin settings error");
    return res.status(500).json({ error: "Failed to load settings" });
  }
});

router.patch("/settings", requirePermission("settings.write"), async (req: AuthRequest, res) => {
  try {
    const settings = await savePlatformSettings(req.body || {});
    await logAdminAction(req, "platform_settings_updated", "settings", undefined, req.body as Record<string, unknown>);
    const updateEvent = { resource: "settings", action: "updated" };
    emitToRole("customer", "admin:event", updateEvent);
    emitToRole("provider", "admin:event", updateEvent);
    return res.json({ settings });
  } catch (error) {
    if (error instanceof PlatformSettingsValidationError) {
      return res.status(400).json({ error: error.message });
    }
    logger.error({ err: error }, "admin settings update error");
    return res.status(500).json({ error: "Failed to update settings" });
  }
});

router.get("/settings/maps/status", requirePermission("settings.read"), async (_req, res) => {
  try {
    const runtimeOverrides = await getRuntimeMapOverrides();
    const configuration = getMapProviderConfiguration(runtimeOverrides);
    const status = getMapConfigurationStatus(runtimeOverrides);
    return res.json({
      runtimeConfigurationEnabled: runtimeOverrides.enabled === true,
      configuration: {
        primaryProvider: configuration.primaryProvider,
        tileProvider: configuration.tileProvider,
        searchProvider: configuration.searchProvider,
        reverseProvider: configuration.reverseProvider,
        directionsProvider: configuration.directionsProvider,
        fallbackEnabled: configuration.fallbackEnabled,
        searchFallbackProvider: configuration.searchFallbackProvider,
        reverseFallbackProvider: configuration.reverseFallbackProvider,
        directionsFallbackProvider: configuration.directionsFallbackProvider,
      },
      credentials: {
        tomtomConfigured: configuration.tomtom.apiKeyConfigured,
        mapboxConfigured: configuration.mapbox.tokenConfigured,
        customTileConfigured: configuration.custom.tileConfigured,
        customSearchConfigured: configuration.custom.searchConfigured,
        customReverseConfigured: configuration.custom.reverseConfigured,
        customDirectionsConfigured: configuration.custom.directionsConfigured,
      },
      status,
      providers: {
        registered: registeredMapProviders(),
        tile: ["tomtom", "mapbox", "custom", "openstreetmap", "disabled"],
        search: ["tomtom", "mapbox", "photon", "nominatim", "custom", "disabled"],
        reverse: ["tomtom", "mapbox", "photon", "nominatim", "custom", "disabled"],
        directions: ["tomtom", "mapbox", "osrm", "custom", "disabled"],
      },
    });
  } catch (error) {
    logger.error({ err: error }, "admin map configuration status error");
    return res.status(500).json({ error: "Failed to load map configuration status" });
  }
});

router.get("/settings/integrations/status", requirePermission("settings.read"), async (_req, res) => {
  try {
    const [communicationOverrides, runtimeMapOverrides, otpDelivery] = await Promise.all([
      getRuntimeCommunicationOverrides(),
      getRuntimeMapOverrides(),
      getOtpDeliveryConfigurationStatus(),
    ]);
    const emailOverride = runtimeProviderValue(communicationOverrides.enabled, communicationOverrides.emailProvider);
    const pushOverride = runtimeProviderValue(communicationOverrides.enabled, communicationOverrides.pushProvider);
    const email = getEmailConfigurationStatus(emailOverride);
    const push = getPushConfigurationStatus(pushOverride);
    const storage = getStorageConfigurationStatus();
    const infrastructure = getInfrastructureProviderStatus();
    const calls = infrastructure.calls;
    const maps = getMapConfigurationStatus(runtimeMapOverrides);
    const queue = queueStats();
    const cache = infrastructure.cache;

    return res.json({
      runtimeConfigurationEnabled: communicationOverrides.enabled === true,
      integrations: {
        maps: {
          provider: maps.provider,
          configured: maps.configured,
          productionSafe: maps.productionSafe,
          runtimeSwitchable: true,
          restartRequired: false,
        },
        email: {
          provider: email.configuredProvider,
          adapter: email.provider,
          configured: email.configured,
          runtimeSwitchable: true,
          restartRequired: false,
          credentials: {
            smtpHostConfigured: email.hostConfigured,
            smtpUserConfigured: email.userConfigured,
            smtpPasswordConfigured: email.passwordConfigured,
            httpEndpointConfigured: email.endpointConfigured,
            httpAuthConfigured: email.authConfigured,
            fromConfigured: email.fromConfigured,
          },
        },
        push: {
          provider: push.configuredProvider,
          adapter: push.provider,
          configured: push.configured,
          runtimeSwitchable: true,
          restartRequired: false,
          credentials: {
            endpointConfigured: push.endpointConfigured,
            expoAccessTokenConfigured: push.accessTokenConfigured,
            httpAuthConfigured: push.httpAuthConfigured,
          },
        },
        otp: {
          provider: otpDelivery.requestedChannels.join(","),
          configured: otpDelivery.configured,
          runtimeSwitchable: false,
          restartRequired: true,
          configuredChannels: otpDelivery.configuredChannels,
        },
        storage: {
          provider: storage.provider,
          adapter: storage.adapter,
          configured: storage.configured,
          productionSafe: storage.productionSafe,
          runtimeSwitchable: storage.runtimeSwitchable,
          restartRequired: storage.restartRequired,
          migrationRequired: storage.migrationRequired,
          credentials: {
            endpointConfigured: storage.endpointConfigured,
            accessKeyConfigured: storage.accessKeyConfigured,
            secretConfigured: storage.secretConfigured,
            bucketConfigured: storage.bucketConfigured,
            projectConfigured: storage.projectConfigured,
            credentialsConfigured: storage.credentialsConfigured,
          },
          error: storage.error,
        },
        calls: {
          provider: calls.provider,
          configured: calls.productionReady,
          productionSafe: calls.productionReady,
          runtimeSwitchable: false,
          restartRequired: true,
        },
        queue: {
          provider: queue.activeProvider,
          requestedProvider: queue.requestedProvider,
          configured: queue.configured === true && queue.accepting === true,
          productionSafe: queue.productionSafe,
          durable: queue.durable,
          runtimeSwitchable: false,
          restartRequired: true,
          drainRequired: true,
          error: queue.lastError,
        },
        cache: {
          provider: cache.provider,
          requestedProvider: cache.requestedProvider,
          configured: cache.configured,
          productionSafe: cache.productionSafe,
          adapterImplemented: cache.adapterImplemented,
          sharedAcrossInstances: cache.sharedAcrossInstances,
          horizontalScaleSafe: cache.horizontalScaleSafe,
          runtimeSwitchable: false,
          restartRequired: true,
          drainRequired: false,
          error: cache.error,
        },
      },
      providers: {
        email: ["smtp", "http_json", "disabled"],
        push: ["expo", "http_json", "disabled"],
        storage: ["r2", "s3", "minio", "wasabi", "backblaze_b2", "digitalocean_spaces", "custom_s3", "gcs", "local-development"],
        otp: ["whatsapp_cloud", "email", "http_sms"],
        calls: ["webrtc", "webrtc-turn", "webrtc-stun", "audio-fallback"],
        queue: ["postgres"],
        cache: ["memory", "disabled"],
        reservedCacheAdapters: ["redis"],
      },
      notes: {
        runtimeSwitching: "Email and push may be switched at runtime after their credentials are configured in the deployment secret manager.",
        restartRequired: "Storage, queue, cache, OTP channel order, and call infrastructure remain deployment settings because changing them can affect durable state or active sessions. Storage changes use standard adapters and require a restart plus migration verification, not source-code changes.",
        cacheScaling: "Memory cache is supported for one API instance. Redis is reserved but intentionally fails closed until a shared adapter is implemented and every cache consumer is migrated.",
      },
    });
  } catch (error) {
    logger.error({ err: error }, "admin integration configuration status error");
    return res.status(500).json({ error: "Failed to load integration configuration status" });
  }
});

router.post("/settings/integrations/storage/test", requirePermission("settings.write"), async (req: AuthRequest, res) => {
  try {
    const result = await testConfiguredStorageProvider();
    await logAdminAction(req, "storage_provider_connectivity_tested", "settings", undefined, {
      provider: result.provider,
      adapter: result.adapter,
      ok: result.ok,
      latencyMs: result.latencyMs,
    });
    return res.status(result.ok ? 200 : 502).json(result);
  } catch (error) {
    logger.warn({ err: error }, "admin storage provider connectivity test failed");
    return res.status(502).json({
      ok: false,
      error: error instanceof Error ? error.message : "Storage provider test failed",
    });
  }
});

router.post("/settings/maps/test", requirePermission("settings.write"), async (req: AuthRequest, res) => {
  try {
    const runtimeOverrides = await getRuntimeMapOverrides();
    const configuration = getMapProviderConfiguration(runtimeOverrides);
    const status = getMapConfigurationStatus(runtimeOverrides);
    const result: Record<string, unknown> = {
      configuration: {
        tileProvider: configuration.tileProvider,
        searchProvider: configuration.searchProvider,
        reverseProvider: configuration.reverseProvider,
        directionsProvider: configuration.directionsProvider,
      },
      tile: { ok: false, skipped: true },
      search: { ok: false, skipped: true },
      reverse: { ok: false, skipped: true },
      directions: { ok: false, skipped: true },
    };

    if (status.configured) {
      const startedAt = Date.now();
      try {
        const upstream = await fetchWithTimeout(
          buildMapTileUpstreamUrl(10, 720, 410, runtimeOverrides),
          { headers: { Accept: "image/png,image/webp,image/jpeg,*/*" } },
          8_000,
        );
        const contentType = String(upstream.headers.get("content-type") || "").toLowerCase();
        result.tile = {
          ok: upstream.ok && contentType.startsWith("image/"),
          skipped: false,
          upstreamStatus: upstream.status,
          contentType,
          latencyMs: Date.now() - startedAt,
        };
      } catch (error) {
        result.tile = { ok: false, skipped: false, latencyMs: Date.now() - startedAt, error: error instanceof Error ? error.name : "request_failed" };
      }
    }

    const searchProvider = getMapOperationProvider(configuration.searchProvider);
    if (searchProvider?.search) {
      const startedAt = Date.now();
      const results = await searchProvider.search({
        query: "Faisal Mosque Islamabad",
        limit: 3,
        bias: { lat: 33.7295, lng: 73.0372 },
      });
      result.search = { ok: results.length > 0, skipped: false, resultCount: results.length, latencyMs: Date.now() - startedAt };
    }

    const reverseProvider = getMapOperationProvider(configuration.reverseProvider);
    if (reverseProvider?.reverse) {
      const startedAt = Date.now();
      const address = await reverseProvider.reverse({ lat: 33.7295, lng: 73.0372 });
      result.reverse = { ok: Boolean(address), skipped: false, latencyMs: Date.now() - startedAt };
    }

    const directionsProvider = getMapOperationProvider(configuration.directionsProvider);
    if (directionsProvider?.directions) {
      const startedAt = Date.now();
      const route = await directionsProvider.directions({
        originLat: 33.6844,
        originLng: 73.0479,
        destLat: 33.7295,
        destLng: 73.0372,
      });
      result.directions = {
        ok: Boolean(route && route.polyline.length >= 2),
        skipped: false,
        pointCount: route?.polyline.length || 0,
        latencyMs: Date.now() - startedAt,
      };
    }

    await logAdminAction(req, "map_provider_runtime_tested", "settings", undefined, {
      tileProvider: configuration.tileProvider,
      searchProvider: configuration.searchProvider,
      reverseProvider: configuration.reverseProvider,
      directionsProvider: configuration.directionsProvider,
    });
    return res.json({ status, tests: result });
  } catch (error) {
    logger.warn({ err: error }, "admin map provider runtime test failed");
    return res.status(502).json({ error: "Map provider test failed" });
  }
});

router.get("/broadcast-templates", requirePermission("broadcasts.read"), async (_req, res) => {
  try {
    const templates = await db
      .select({
        id: notificationTemplatesTable.id,
        key: notificationTemplatesTable.key,
        name: notificationTemplatesTable.name,
        subject: notificationTemplatesTable.subject,
        body: notificationTemplatesTable.body,
        targetAudience: notificationTemplatesTable.targetAudience,
      })
      .from(notificationTemplatesTable)
      .where(and(eq(notificationTemplatesTable.channel, "push"), eq(notificationTemplatesTable.isActive, true)))
      .orderBy(notificationTemplatesTable.name);
    return res.json({ templates });
  } catch (error) {
    logger.error({ err: error }, "admin broadcast templates error");
    return res.status(500).json({ error: "Failed to load broadcast templates" });
  }
});

router.get("/broadcasts", requirePermission("broadcasts.read"), async (_req, res) => {
  try {
    const broadcasts = await db
      .select()
      .from(adminBroadcastsTable)
      .orderBy(desc(adminBroadcastsTable.createdAt));

    return res.json({ broadcasts });
  } catch (error) {
    logger.error({ err: error }, "admin broadcasts error");
    return res.status(500).json({ error: "Failed to load broadcasts" });
  }
});

router.post("/broadcasts", requirePermission("broadcasts.write"), async (req: AuthRequest, res) => {
  try {
    const { title, message, audience, targetUserIds } = req.body as {
      title?: string;
      message?: string;
      audience?: string;
      targetUserIds?: string[];
    };

    if (!title?.trim() || !message?.trim()) {
      return res.status(400).json({ error: "Title and message are required" });
    }

    const adminUser = await db.query.usersTable.findFirst({ where: eq(usersTable.id, req.user!.userId) });

    const normalizedUserIds = Array.isArray(targetUserIds)
      ? Array.from(new Set(targetUserIds.map((v) => String(v).trim()).filter(Boolean)))
      : [];

    const normalizedAudience = String(audience || "all").trim().toLowerCase();
    const allowedAudiences = new Set(["all", "customers", "providers"]);
    if (normalizedUserIds.length === 0 && !allowedAudiences.has(normalizedAudience)) {
      return res.status(400).json({
        error: "Audience must be all, customers, or providers",
        code: "INVALID_BROADCAST_AUDIENCE",
      });
    }

    const resolvedAudience = normalizedUserIds.length > 0 ? "specific" : normalizedAudience;

    const broadcast = {
      id: generateId(),
      title: title.trim(),
      message: message.trim(),
      audience: resolvedAudience,
      createdBy: req.user!.userId,
      createdByName: adminUser?.name || "Admin",
      createdAt: new Date(),
    };

    await db.insert(adminBroadcastsTable).values(broadcast);

    // Persist as in-app notifications for the targeted audience.
    const audienceCondition = broadcast.audience === "customers"
      ? eq(usersTable.role, "customer")
      : broadcast.audience === "providers"
        ? eq(usersTable.role, "provider")
        : inArray(usersTable.role, ["customer", "provider"]);
    const targetUsers = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(and(
        normalizedUserIds.length > 0 ? inArray(usersTable.id, normalizedUserIds) : audienceCondition,
        inArray(usersTable.role, ["customer", "provider"]),
        eq(usersTable.isBlocked, false),
        eq(usersTable.isDeactivated, false),
      ));

    // Platform announcements are general notifications, not customer job
    // broadcasts. They must open the recipient's Notifications screen rather
    // than the provider job-broadcast screen.
    const delivery = await notifyUsers(
      targetUsers.map((u) => u.id),
      {
        title: broadcast.title,
        body: broadcast.message,
        type: "system",
        link: "/notifications",
        data: {
          broadcastId: broadcast.id,
          audience: broadcast.audience,
          source: "admin_broadcast",
        },
      },
    );

    await db
      .update(adminBroadcastsTable)
      .set({ sentCount: delivery.created })
      .where(eq(adminBroadcastsTable.id, broadcast.id));

    await logAdminAction(req, "broadcast_sent", "broadcast", broadcast.id, {
      audience: broadcast.audience,
      targetUserCount: targetUsers.length,
      delivery,
    });

    return res.json({
      broadcast: { ...broadcast, sentCount: delivery.created },
      delivery,
    });
  } catch (error) {
    logger.error({ err: error }, "admin broadcast create error");
    return res.status(500).json({ error: "Failed to create broadcast" });
  }
});

router.patch("/users/:id/availability", requirePermission("users.write"), async (req: AuthRequest, res) => {
  try {
    const providerId = String(req.params.id);
    const isAvailable = Boolean(req.body?.isAvailable);
    const reason = String(req.body?.reason || "").trim();
    if (reason.length < 3) return res.status(400).json({ error: "An operational reason is required" });
    const provider = await db.query.usersTable.findFirst({ where: eq(usersTable.id, providerId) });
    if (!provider || provider.role !== "provider") return res.status(404).json({ error: "Provider not found" });
    if (isAvailable) {
      if (
        provider.isBlocked ||
        provider.isDeactivated ||
        !provider.isVerified ||
        provider.verificationStatus !== "approved" ||
        provider.documentSuspendedAt ||
        provider.documentComplianceStatus === "suspended"
      ) {
        return res.status(409).json({ error: "Provider is not eligible to be forced online until account and document verification are active" });
      }
      const active = await getProviderActiveWorkBlock(providerId);
      if (active.blocked) return res.status(409).json({ error: active.message || "Provider has active work" });
    }
    await db.update(usersTable).set({ isAvailable, updatedAt: new Date() }).where(eq(usersTable.id, providerId));
    const updated = await db.query.usersTable.findFirst({ where: eq(usersTable.id, providerId) });
    emitToUser(providerId, "provider:availability", { isAvailable, reason: "admin_override" });
    await notifyUser({
      userId: providerId,
      title: isAvailable ? "Availability enabled" : "Availability disabled",
      body: reason,
      type: "system",
      link: "/provider/dashboard",
      data: { isAvailable, source: "admin" },
    }).catch(() => undefined);
    await logAdminAction(req, "provider_availability_overridden", "user", providerId, { isAvailable, reason, providerName: provider.name });
    return res.json({ user: toSafeUser(updated) });
  } catch (error) {
    logger.error({ err: error }, "provider availability override error");
    return res.status(500).json({ error: "Failed to update provider availability" });
  }
});

router.get("/users/:id/availability-policy", requirePermission("users.read"), async (req: AuthRequest, res) => {
  const providerId = String(req.params.id);
  const provider = await db.query.usersTable.findFirst({ where: eq(usersTable.id, providerId) });
  if (!provider || provider.role !== "provider") return res.status(404).json({ error: "Provider not found" });
  return res.json({ maxTravelDistanceKm: provider.maxTravelDistanceKm || 15, schedule: await getProviderSchedule(providerId) });
});

router.patch("/users/:id/availability-policy", requirePermission("users.write"), async (req: AuthRequest, res) => {
  try {
    const providerId = String(req.params.id);
    const provider = await db.query.usersTable.findFirst({ where: eq(usersTable.id, providerId) });
    if (!provider || provider.role !== "provider") return res.status(404).json({ error: "Provider not found" });
    const reason = String(req.body?.reason || "").trim();
    if (reason.length < 3) return res.status(400).json({ error: "An operational reason is required" });
    const radius = validateTravelRadius(req.body?.maxTravelDistanceKm);
    if (!radius) return res.status(400).json({ error: "Service radius must be between 1 and 100 km" });
    const checked = validateProviderSchedule(req.body?.schedule);
    if (!checked.schedule) return res.status(400).json({ error: checked.error });
    await db.transaction(async (tx) => {
      await tx.update(usersTable).set({ maxTravelDistanceKm: radius, updatedAt: new Date() }).where(eq(usersTable.id, providerId));
    });
    await saveProviderSchedule(providerId, checked.schedule);
    await logAdminAction(req, "provider_availability_policy_updated", "user", providerId, { radius, reason, providerName: provider.name });
    emitToUser(providerId, "provider:availability", { isAvailable: provider.isAvailable, reason: "policy_updated" });
    await notifyUser({ userId: providerId, title: "Availability settings updated", body: reason, type: "system", link: "/provider/availability", data: { radius } }).catch(() => undefined);
    return res.json({ maxTravelDistanceKm: radius, schedule: checked.schedule });
  } catch (error) {
    logger.error({ err: error }, "provider availability policy update error");
    return res.status(500).json({ error: "Failed to update availability policy" });
  }
});

router.patch("/users/:id/block", requirePermission("users.write"), async (req: AuthRequest, res) => {
  try {
    const providerId = String(req.params.id);
    const reason = String(req.body?.reason || "").trim();
    if (reason.length < 3) return res.status(400).json({ error: "A block reason is required" });
    const provider = await db.query.usersTable.findFirst({ where: eq(usersTable.id, providerId) });
    if (!provider || provider.role !== "provider") return res.status(404).json({ error: "Provider not found" });
    await db.update(usersTable).set({ isBlocked: true, blockedReason: reason, isAvailable: false, updatedAt: new Date() }).where(eq(usersTable.id, providerId));
    await revokeAllUserSessions(providerId, "provider_blocked_by_admin");
    emitToUser(providerId, "provider:availability", { isAvailable: false, reason: "admin_block" });
    await notifyUser({ userId: providerId, title: "Provider account blocked", body: reason, type: "system", link: "/provider/profile", data: { source: "admin" }, email: { category: "security", templateKey: "account_status", variables: { status: "blocked", reason } } }).catch(() => undefined);
    const updated = await db.query.usersTable.findFirst({ where: eq(usersTable.id, providerId) });
    await logAdminAction(req, "provider_blocked", "user", providerId, { reason, providerName: provider.name });
    return res.json({ user: toSafeUser(updated) });
  } catch (e) {
    logger.error({ err: e }, "provider block error");
    return res.status(500).json({ error: "Failed to block provider" });
  }
});

router.patch("/users/:id/unblock", requirePermission("users.write"), async (req: AuthRequest, res) => {
  try {
    const providerId = String(req.params.id);
    const reason = String(req.body?.reason || "").trim();
    if (reason.length < 3) return res.status(400).json({ error: "An unblock reason is required" });
    const provider = await db.query.usersTable.findFirst({ where: eq(usersTable.id, providerId) });
    if (!provider || provider.role !== "provider") return res.status(404).json({ error: "Provider not found" });
    await db.update(usersTable).set({ isBlocked: false, blockedReason: null, isAvailable: false, updatedAt: new Date() }).where(eq(usersTable.id, providerId));
    await notifyUser({ userId: providerId, title: "Provider account unblocked", body: reason, type: "system", link: "/provider/profile", data: { source: "admin" }, email: { category: "security", templateKey: "account_status", variables: { status: "active", reason } } }).catch(() => undefined);
    const updated = await db.query.usersTable.findFirst({ where: eq(usersTable.id, providerId) });
    await logAdminAction(req, "provider_unblocked", "user", providerId, { reason, providerName: provider.name });
    return res.json({ user: toSafeUser(updated) });
  } catch (e) {
    logger.error({ err: e }, "provider unblock error");
    return res.status(500).json({ error: "Failed to unblock provider" });
  }
});

router.patch("/users/:id/verify", requirePermission("verification.write"), async (_req, res) => {
  return res.status(410).json({ error: "Legacy verification toggle is disabled. Use the document-aware verification-status workflow." });
});

// Full verification status: pending | in_process | approved | rejected, with optional note
router.patch("/users/:id/verification-status", requirePermission("verification.write"), async (req: AuthRequest, res) => {
  try {
    const { status, note } = req.body as { status?: string; note?: string };
    const valid = ["pending", "in_process", "approved", "rejected"];
    if (!status || !valid.includes(status)) return res.status(400).json({ error: `status must be one of ${valid.join(", ")}` });
    const target = await db.query.usersTable.findFirst({ where: eq(usersTable.id, String(req.params.id)) });
    if (!target || target.role !== "provider") return res.status(404).json({ error: "Provider not found" });
    if (status === "rejected" && !note?.trim()) return res.status(400).json({ error: "A rejection reason is required" });
    if (status === "approved") {
      if (target.documentSuspendedAt || target.documentComplianceStatus === "suspended") {
        return res.status(409).json({
          error: "This provider is paused for expired documents. Review and approve the replacement requests before reactivating verification.",
          code: "DOCUMENT_RENEWAL_REQUIRED",
        });
      }
      const requiredTypes = ["cnic_front", "cnic_back", "selfie", "police"];
      const docs = await db.select().from(providerDocumentsTable).where(eq(providerDocumentsTable.providerId, target.id));
      const incomplete = requiredTypes.filter((type) => !docs.some((doc) => doc.type === type && doc.status === "approved"));
      if (incomplete.length) return res.status(409).json({ error: `Required documents are missing or not approved: ${incomplete.join(", ")}` });
    }
    await db.update(usersTable).set({
      verificationStatus: status,
      verificationNote: note?.trim() || null,
      isVerified: status === "approved",
      isAvailable: status === "approved" ? target.isAvailable : false,
      updatedAt: new Date(),
    }).where(eq(usersTable.id, target.id));
    if (status !== "approved") emitToUser(target.id, "provider:availability", { isAvailable: false, reason: "verification_status" });
    await notifyUser({
      userId: target.id,
      title: status === "approved" ? "You're verified!" : status === "rejected" ? "Verification rejected" : "Verification update",
      body: status === "approved" ? "Your provider account has been approved. You can now receive jobs." : status === "rejected" ? note!.trim() : (note?.trim() || `Your verification status is now: ${status.replace("_", " ")}`),
      type: "system",
      link: "/provider/verification-documents",
      data: { verificationStatus: status },
    }).catch(() => undefined);
    const updated = await db.query.usersTable.findFirst({ where: eq(usersTable.id, target.id) });
    if (updated?.email) {
      const emailBody = renderVerificationEmail(status, updated.name || "Provider", note?.trim());
      sendEmail({ to: updated.email, subject: emailBody.subject, html: emailBody.html, text: emailBody.text }).catch(() => undefined);
    }
    await logAdminAction(req, "provider_verification_status_updated", "user", target.id, { status, note: note?.trim(), providerName: target.name });
    return res.json({ user: toSafeUser(updated) });
  } catch (e) {
    logger.error({ err: e }, "verification status error");
    return res.status(500).json({ error: "Failed to update verification status" });
  }
});

router.get("/users/:id/documents", requirePermission("verification.read"), async (req, res) => {
  try {
    const provider = await db.query.usersTable.findFirst({ where: eq(usersTable.id, String(req.params.id)) });
    if (!provider || provider.role !== "provider") return res.status(404).json({ error: "Provider not found" });
    const docs = await db.select().from(providerDocumentsTable).where(eq(providerDocumentsTable.providerId, provider.id)).orderBy(desc(providerDocumentsTable.createdAt));
    return res.json({ documents: docs });
  } catch (e) {
    return res.status(500).json({ error: "Failed to load documents" });
  }
});

router.patch("/documents/:docId", requirePermission("verification.write"), async (req: AuthRequest, res) => {
  try {
    const { status, rejectionNote } = req.body as { status?: string; rejectionNote?: string };
    const valid = ["pending", "approved", "rejected"];
    if (!status || !valid.includes(status)) return res.status(400).json({ error: `status must be one of ${valid.join(", ")}` });
    if (status === "rejected" && !rejectionNote?.trim()) return res.status(400).json({ error: "A document rejection reason is required" });
    const existingDoc = await db.query.providerDocumentsTable.findFirst({ where: eq(providerDocumentsTable.id, req.params.docId) });
    if (!existingDoc) return res.status(404).json({ error: "Document not found" });
    await db.transaction(async (tx) => {
      await tx.update(providerDocumentsTable).set({ status, rejectionNote: status === "rejected" ? rejectionNote!.trim() : null, reviewedBy: req.user!.userId, reviewedAt: new Date(), updatedAt: new Date() }).where(eq(providerDocumentsTable.id, existingDoc.id));
      if (status === "rejected") {
        await tx.update(usersTable).set({ isVerified: false, verificationStatus: "rejected", verificationNote: rejectionNote!.trim(), isAvailable: false, updatedAt: new Date() }).where(eq(usersTable.id, existingDoc.providerId));
      }
    });
    if (status === "rejected") {
      emitToUser(existingDoc.providerId, "provider:availability", { isAvailable: false, reason: "document_rejected" });
      await notifyUser({ userId: existingDoc.providerId, title: "Verification document rejected", body: rejectionNote!.trim(), type: "system", link: "/provider/verification-documents", data: { documentType: existingDoc.type } }).catch(() => undefined);
    }
    const doc = await db.query.providerDocumentsTable.findFirst({ where: eq(providerDocumentsTable.id, existingDoc.id) });
    await logAdminAction(req, "provider_document_reviewed", "provider_document", existingDoc.id, { status, rejectionNote: rejectionNote?.trim(), docType: existingDoc.type, providerId: existingDoc.providerId });
    return res.json({ document: doc });
  } catch (e) {
    logger.error({ err: e }, "provider document review error");
    return res.status(500).json({ error: "Failed to update document" });
  }
});

router.patch("/users/:id/deactivate", requirePermission("users.write"), async (req: AuthRequest, res) => {
  try {
    const providerId = String(req.params.id);
    const reason = String(req.body?.reason || "").trim();
    if (reason.length < 3) return res.status(400).json({ error: "A deactivation reason is required" });
    const provider = await db.query.usersTable.findFirst({ where: eq(usersTable.id, providerId) });
    if (!provider || provider.role !== "provider") return res.status(404).json({ error: "Provider not found" });
    await db.update(usersTable).set({ isDeactivated: true, isAvailable: false, updatedAt: new Date() }).where(eq(usersTable.id, providerId));
    await revokeAllUserSessions(providerId, "provider_deactivated_by_admin");
    emitToUser(providerId, "provider:availability", { isAvailable: false, reason: "admin_deactivate" });
    await notifyUser({ userId: providerId, title: "Provider account deactivated", body: reason, type: "system", link: "/provider/profile", data: { source: "admin" }, email: { category: "security", templateKey: "account_status", variables: { status: "deactivated", reason } } }).catch(() => undefined);
    const updated = await db.query.usersTable.findFirst({ where: eq(usersTable.id, providerId) });
    await logAdminAction(req, "provider_deactivated", "user", providerId, { reason, providerName: provider.name });
    return res.json({ user: toSafeUser(updated) });
  } catch (e) {
    return res.status(500).json({ error: "Failed to deactivate provider" });
  }
});

router.patch("/users/:id/reactivate", requirePermission("users.write"), async (req: AuthRequest, res) => {
  try {
    const providerId = String(req.params.id);
    const reason = String(req.body?.reason || "").trim();
    if (reason.length < 3) return res.status(400).json({ error: "A reactivation reason is required" });
    const provider = await db.query.usersTable.findFirst({ where: eq(usersTable.id, providerId) });
    if (!provider || provider.role !== "provider") return res.status(404).json({ error: "Provider not found" });
    await db.update(usersTable).set({ isDeactivated: false, isAvailable: false, updatedAt: new Date() }).where(eq(usersTable.id, providerId));
    await notifyUser({ userId: providerId, title: "Provider account reactivated", body: reason, type: "system", link: "/provider/profile", data: { source: "admin" }, email: { category: "security", templateKey: "account_status", variables: { status: "active", reason } } }).catch(() => undefined);
    const updated = await db.query.usersTable.findFirst({ where: eq(usersTable.id, providerId) });
    await logAdminAction(req, "provider_reactivated", "user", providerId, { reason, providerName: provider.name });
    return res.json({ user: toSafeUser(updated) });
  } catch (e) {
    return res.status(500).json({ error: "Failed to reactivate provider" });
  }
});

router.post("/users/:id/revoke-sessions", requirePermission("users.write"), async (req: AuthRequest, res) => {
  const providerId = String(req.params.id);
  const reason = String(req.body?.reason || "").trim();
  if (reason.length < 3) return res.status(400).json({ error: "A session-revocation reason is required" });
  const provider = await db.query.usersTable.findFirst({ where: eq(usersTable.id, providerId) });
  if (!provider || provider.role !== "provider") return res.status(404).json({ error: "Provider not found" });
  await revokeAllUserSessions(providerId, "provider_sessions_revoked_by_admin");
  await logAdminAction(req, "provider_sessions_revoked", "user", providerId, { reason, providerName: provider.name });
  return res.json({ success: true });
});

router.patch("/users/:id/profile", requirePermission("users.write"), async (req: AuthRequest, res) => {
  try {
    const providerId = String(req.params.id);
    const reason = String(req.body?.reason || "").trim();
    if (reason.length < 3) return res.status(400).json({ error: "A profile-change reason is required" });
    const provider = await db.query.usersTable.findFirst({ where: eq(usersTable.id, providerId) });
    if (!provider || provider.role !== "provider") return res.status(404).json({ error: "Provider not found" });
    const name = req.body?.name === undefined ? provider.name : String(req.body.name || "").trim();
    const location = req.body?.location === undefined ? provider.location : String(req.body.location || "").trim() || null;
    const bio = req.body?.bio === undefined ? provider.bio : String(req.body.bio || "").trim() || null;
    if (name.length < 2 || name.length > 80) return res.status(400).json({ error: "Name must be between 2 and 80 characters" });
    if (location && location.length > 120) return res.status(400).json({ error: "Location must be 120 characters or fewer" });
    if (bio && bio.length > 500) return res.status(400).json({ error: "Bio must be 500 characters or fewer" });
    await db.update(usersTable).set({ name, location, bio, updatedAt: new Date() }).where(eq(usersTable.id, providerId));
    const updated = await db.query.usersTable.findFirst({ where: eq(usersTable.id, providerId) });
    await notifyUser({ userId: providerId, title: "Provider profile updated", body: reason, type: "system", link: "/provider/profile", data: { source: "admin" } }).catch(() => undefined);
    await logAdminAction(req, "provider_profile_updated", "user", providerId, { fields: ["name", "location", "bio"], reason, providerName: updated?.name });
    return res.json({ user: toSafeUser(updated) });
  } catch (e) {
    logger.error({ err: e }, "admin provider profile update error");
    return res.status(500).json({ error: "Failed to update provider profile" });
  }
});

router.patch("/users/:id/notes", requirePermission("users.write"), async (req: AuthRequest, res) => {
  try {
    const { notes } = req.body as { notes?: string };
    await db.update(usersTable).set({
      adminNotes: notes || null,
      updatedAt: new Date(),
    }).where(eq(usersTable.id, String(req.params.id)));
    const updated = await db.query.usersTable.findFirst({ where: eq(usersTable.id, String(req.params.id)) });
    await logAdminAction(req, "user_notes_updated", "user", req.params.id, { userName: updated?.name });
    return res.json({ user: toSafeUser(updated) });
  } catch (e) {
    return res.status(500).json({ error: "Failed to update notes" });
  }
});

router.patch("/users/:id/commission-limit", requirePermission("finance.write"), async (req: AuthRequest, res) => {
  try {
    const limit = Number((req.body as any).commissionLimit);
    if (!Number.isFinite(limit) || limit < 100) {
      return res.status(400).json({ error: "Valid commissionLimit required (min 100)" });
    }
    const user = await db.query.usersTable.findFirst({ where: eq(usersTable.id, String(req.params.id)) });
    if (!user) return res.status(404).json({ error: "User not found" });
    const shouldBlock = Number(user.pendingCommission || 0) >= limit;
    await db.update(usersTable).set({
      commissionLimit: limit,
      isBlocked: shouldBlock,
      blockedReason: shouldBlock ? "Commission due limit reached. Please clear your Athoo dues." : user.blockedReason,
      updatedAt: new Date(),
    }).where(eq(usersTable.id, String(req.params.id)));
    const updated = await db.query.usersTable.findFirst({ where: eq(usersTable.id, String(req.params.id)) });
    await logAdminAction(req, "user_commission_limit_updated", "user", req.params.id, { commissionLimit: limit, userName: user.name });
    return res.json({ user: toSafeUser(updated) });
  } catch (e) {
    return res.status(500).json({ error: "Failed to update commission limit" });
  }
});

router.patch("/users/:id/mark-commission-paid", requirePermission("finance.write"), async (_req, res) => {
  return res.status(410).json({ error: "Direct commission clearing is disabled. Review and approve submitted payment evidence instead." });
});

router.get("/support", requirePermission("complaints.read"), async (req, res) => {
  try {
    const q = String(req.query.q || "").trim().slice(0, 120);
    const status = String(req.query.status || "all");
    const priority = String(req.query.priority || "all");
    const focus = String(req.query.focus || "").trim();
    const from = typeof req.query.from === "string" && req.query.from ? new Date(`${req.query.from}T00:00:00.000Z`) : null;
    const to = typeof req.query.to === "string" && req.query.to ? new Date(`${req.query.to}T23:59:59.999Z`) : null;
    const validStatuses = new Set(["all", "open", "in_progress", "resolved", "closed"]);
    const validPriorities = new Set(["all", "urgent", "high", "normal", "low"]);
    if (!validStatuses.has(status)) return res.status(400).json({ error: "Invalid support status" });
    if (!validPriorities.has(priority)) return res.status(400).json({ error: "Invalid support priority" });

    const publicIdMatches = q
      ? await db.select({ id: usersTable.id }).from(usersTable).where(ilike(usersTable.publicId, `%${q}%`)).limit(200)
      : [];
    const publicIdUserIds = publicIdMatches.map((row) => row.id);
    const conditions: any[] = [];
    if (focus) {
      conditions.push(eq(supportTicketsTable.id, focus));
    } else {
      if (status !== "all") conditions.push(eq(supportTicketsTable.status, status));
      if (priority !== "all") conditions.push(eq(supportTicketsTable.priority, priority));
      if (from && !Number.isNaN(from.getTime())) conditions.push(gte(supportTicketsTable.createdAt, from));
      if (to && !Number.isNaN(to.getTime())) conditions.push(lte(supportTicketsTable.createdAt, to));
      if (q) {
        const like = `%${q}%`;
        conditions.push(or(
          ilike(supportTicketsTable.subject, like),
          ilike(supportTicketsTable.message, like),
          ilike(supportTicketsTable.userName, like),
          ilike(supportTicketsTable.userPhone, like),
          eq(supportTicketsTable.id, q),
          eq(supportTicketsTable.bookingId, q),
          ...(publicIdUserIds.length ? [inArray(supportTicketsTable.userId, publicIdUserIds)] : []),
        ));
      }
    }

    const tickets = await db
      .select()
      .from(supportTicketsTable)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(supportTicketsTable.createdAt))
      .limit(focus ? 1 : 200);

    const assignedIds = [...new Set(tickets.map((ticket) => ticket.assignedTo).filter((id): id is string => Boolean(id)))];
    const ticketUserIds = [...new Set(tickets.map((ticket) => ticket.userId).filter(Boolean))];
    const peopleIds = [...new Set([...assignedIds, ...ticketUserIds])];
    const people = peopleIds.length
      ? await db.select({ id: usersTable.id, name: usersTable.name, publicId: usersTable.publicId }).from(usersTable).where(inArray(usersTable.id, peopleIds))
      : [];
    const peopleMap = new Map(people.map((person) => [person.id, person]));

    return res.json({
      tickets: tickets.map((ticket) => ({
        ...ticket,
        userPublicId: peopleMap.get(ticket.userId)?.publicId || null,
        assignedToName: ticket.assignedTo ? peopleMap.get(ticket.assignedTo)?.name || null : null,
      })),
    });
  } catch (e) {
    logger.error({ err: e }, "admin support tickets error");
    return res.status(500).json({ error: "Failed to load support tickets" });
  }
});

router.patch("/support/:id/status", requirePermission("complaints.write"), async (req: AuthRequest, res) => {
  try {
    const ticketId = String(req.params.id);
    const existing = await db.query.supportTicketsTable.findFirst({ where: eq(supportTicketsTable.id, ticketId) });
    if (!existing) return res.status(404).json({ error: "Support ticket not found" });

    const { status, adminNotes, resolutionNote, priority } = req.body as { status?: string; adminNotes?: string; resolutionNote?: string; priority?: string };
    if (!status && priority === undefined && adminNotes === undefined) {
      return res.status(400).json({ error: "A status, priority, or admin note update is required" });
    }

    const update: Record<string, any> = { updatedAt: new Date() };
    if (status) {
      const validStatuses = ["open", "in_progress", "resolved", "closed"];
      if (!validStatuses.includes(status)) return res.status(400).json({ error: "Invalid status" });
      const cleanResolution = String(resolutionNote || "").trim();
      if (status === "resolved" && cleanResolution.length < 10) {
        return res.status(400).json({ error: "A clear resolution note of at least 10 characters is required" });
      }
      update.status = status;
      if (adminNotes !== undefined) update.adminNotes = String(adminNotes || "").trim() || null;
      if (["resolved", "closed"].includes(status)) {
        update.resolvedBy = req.user!.userId;
        update.resolvedAt = new Date();
        if (cleanResolution) update.resolutionNote = cleanResolution;
      } else {
        update.resolvedBy = null;
        update.resolvedAt = null;
        update.resolutionNote = null;
      }
    }
    if (priority !== undefined) {
      const validPriorities = ["urgent", "high", "normal", "low"];
      if (!validPriorities.includes(priority)) return res.status(400).json({ error: "Invalid priority" });
      update.priority = priority;
    }

    await db.update(supportTicketsTable).set(update).where(eq(supportTicketsTable.id, ticketId));
    const ticket = await db.query.supportTicketsTable.findFirst({ where: eq(supportTicketsTable.id, ticketId) });
    if (!ticket) return res.status(404).json({ error: "Support ticket not found" });

    if (status || priority) {
      await notifyUser({
        userId: ticket.userId,
        title: status ? "Support Ticket Updated" : "Support Ticket Priority Updated",
        body: status
          ? `Your support request "${ticket.subject}" is now ${String(status).replace(/_/g, " ")}.`
          : `Priority for your support request "${ticket.subject}" was updated.`,
        type: "system",
        data: { ticketId: ticket.id, status: ticket.status, priority: ticket.priority, link: "/support" },
      });
    }

    await logAdminAction(req, "support_ticket_updated", "support_ticket", ticketId, { status, priority });
    return res.json({ ticket });
  } catch (e) {
    logger.error({ err: e }, "admin support status error");
    return res.status(500).json({ error: "Failed to update ticket status" });
  }
});

// ─── Ticket Notes ──────────────────────────────────────────────────────────

router.get("/support/:id/notes", requirePermission("complaints.read"), async (req, res) => {
  try {
    const ticket = await db.query.supportTicketsTable.findFirst({ where: eq(supportTicketsTable.id, String(req.params.id)) });
    if (!ticket) return res.status(404).json({ error: "Support ticket not found" });
    const notes = await db
      .select()
      .from(ticketNotesTable)
      .where(eq(ticketNotesTable.ticketId, String(req.params.id)))
      .orderBy(desc(ticketNotesTable.createdAt));
    return res.json({ notes });
  } catch (e) {
    return res.status(500).json({ error: "Failed to load ticket notes" });
  }
});

router.post("/support/:id/notes", requirePermission("complaints.write"), async (req: AuthRequest, res) => {
  try {
    const ticketId = String(req.params.id);
    const ticket = await db.query.supportTicketsTable.findFirst({ where: eq(supportTicketsTable.id, ticketId) });
    if (!ticket) return res.status(404).json({ error: "Support ticket not found" });

    const { note, isInternal } = req.body as { note?: string; isInternal?: boolean };
    const cleanNote = String(note || "").trim();
    if (cleanNote.length < 2) return res.status(400).json({ error: "Note is required" });
    if (cleanNote.length > 4000) return res.status(400).json({ error: "Note cannot exceed 4,000 characters" });

    const admin = await db.query.usersTable.findFirst({ where: eq(usersTable.id, req.user!.userId) });
    const internal = isInternal !== false;
    const newNote = {
      id: generateId(),
      ticketId,
      adminId: req.user!.userId,
      adminName: admin?.name || "Admin",
      note: cleanNote,
      isInternal: internal,
    };
    await db.insert(ticketNotesTable).values(newNote);

    if (!internal) {
      await notifyUser({
        userId: ticket.userId,
        title: "Support Team Replied",
        body: `New reply on your support request: "${ticket.subject}"`,
        type: "system",
        data: { ticketId: ticket.id, link: "/support" },
      });
    }

    await logAdminAction(req, "ticket_note_added", "support_ticket", ticketId, { note: cleanNote.slice(0, 100), isInternal: internal });
    return res.status(201).json({ note: newNote });
  } catch (e) {
    return res.status(500).json({ error: "Failed to add ticket note" });
  }
});

router.patch("/support/:id/assign", requirePermission("complaints.write"), async (req: AuthRequest, res) => {
  try {
    const ticketId = String(req.params.id);
    const ticket = await db.query.supportTicketsTable.findFirst({ where: eq(supportTicketsTable.id, ticketId) });
    if (!ticket) return res.status(404).json({ error: "Support ticket not found" });

    const { assignedTo } = req.body as { assignedTo?: string | null };
    const targetAdminId = assignedTo ? String(assignedTo) : null;
    if (targetAdminId) {
      const target = await db.query.usersTable.findFirst({ where: and(eq(usersTable.id, targetAdminId), eq(usersTable.role, "admin"), eq(usersTable.isDeactivated, false)) });
      if (!target) return res.status(400).json({ error: "Assigned administrator is not active" });
    }

    await db.update(supportTicketsTable).set({ assignedTo: targetAdminId, updatedAt: new Date() }).where(eq(supportTicketsTable.id, ticketId));
    const updated = await db.query.supportTicketsTable.findFirst({ where: eq(supportTicketsTable.id, ticketId) });
    await logAdminAction(req, "support_ticket_assigned", "support_ticket", ticketId, { assignedTo: targetAdminId, subject: ticket.subject });
    return res.json({ ticket: updated });
  } catch (e) {
    return res.status(500).json({ error: "Failed to assign ticket" });
  }
});

// ─── Chat moderation ───────────────────────────────────────────────────────
router.get("/chats", requirePermission("complaints.read"), async (req, res) => {
  try {
    const q = String(req.query.q || "").trim();
    const locked = String(req.query.locked || "all");
    const conditions: any[] = [];
    if (q) {
      const like = `%${q}%`;
      conditions.push(or(
        ilike(chatsTable.participant1Name, like),
        ilike(chatsTable.participant2Name, like),
        ilike(chatsTable.service ?? sql`''`, like),
        eq(chatsTable.bookingId, q),
        eq(chatsTable.id, q),
      ));
    }
    if (locked === "true") conditions.push(eq(chatsTable.isLocked, true));
    if (locked === "false") conditions.push(eq(chatsTable.isLocked, false));
    const chats = await db.select().from(chatsTable)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(chatsTable.lastMessageAt))
      .limit(200);
    return res.json({ chats });
  } catch (error) {
    logger.error({ err: error }, "admin chats list error");
    return res.status(500).json({ error: "Failed to load conversations" });
  }
});

router.get("/chats/:id/messages", requirePermission("complaints.read"), async (req, res) => {
  try {
    const chat = await db.query.chatsTable.findFirst({ where: eq(chatsTable.id, String(req.params.id)) });
    if (!chat) return res.status(404).json({ error: "Conversation not found" });
    const messages = await db.select().from(messagesTable)
      .where(eq(messagesTable.chatId, chat.id))
      .orderBy(messagesTable.createdAt)
      .limit(500);
    return res.json({ chat, messages });
  } catch (error) {
    logger.error({ err: error }, "admin chat messages error");
    return res.status(500).json({ error: "Failed to load conversation" });
  }
});

router.patch("/chats/:id/lock", requirePermission("complaints.write"), async (req: AuthRequest, res) => {
  try {
    const chatId = String(req.params.id);
    const isLocked = Boolean(req.body?.isLocked);
    const reason = String(req.body?.reason || "").trim();
    if (isLocked && reason.length < 3) return res.status(400).json({ error: "A lock reason is required" });
    const existing = await db.query.chatsTable.findFirst({ where: eq(chatsTable.id, chatId) });
    if (!existing) return res.status(404).json({ error: "Conversation not found" });
    await db.update(chatsTable).set({
      isLocked,
      lockedReason: isLocked ? reason.slice(0, 500) : null,
      lockedBy: isLocked ? req.user!.userId : null,
      lockedAt: isLocked ? new Date() : null,
      updatedAt: new Date(),
    }).where(eq(chatsTable.id, chatId));
    await logAdminAction(req, isLocked ? "chat_locked" : "chat_unlocked", "chat", chatId, {
      bookingId: existing.bookingId,
      reason: isLocked ? reason.slice(0, 500) : null,
    });
    return res.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, "admin chat lock error");
    return res.status(500).json({ error: "Failed to update conversation" });
  }
});


// ─── Negotiation Operations ───────────────────────────────────────────────
router.get("/negotiations", requirePermission("operations.read"), async (req: AuthRequest, res) => {
  try {
    const status = String(req.query.status || "all");
    const q = String(req.query.q || "").trim();
    const conditions = [];
    if (status !== "all") conditions.push(eq(negotiationsTable.status, status));
    if (q) {
      const like = `%${q}%`;
      conditions.push(or(
        ilike(negotiationsTable.customerName, like),
        ilike(negotiationsTable.providerName, like),
        ilike(negotiationsTable.service, like),
        eq(negotiationsTable.id, q),
      ));
    }
    const rows = await db.select().from(negotiationsTable)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(negotiationsTable.createdAt))
      .limit(250);
    return res.json({ negotiations: rows });
  } catch (error) {
    logger.error({ err: error }, "admin negotiations list error");
    return res.status(500).json({ error: "Failed to load negotiations" });
  }
});

router.patch("/negotiations/:id/close", requirePermission("operations.write"), async (req: AuthRequest, res) => {
  try {
    const id = String(req.params.id);
    const reason = String(req.body?.reason || "").trim();
    if (reason.length < 5) return res.status(400).json({ error: "A reason of at least 5 characters is required" });
    const existing = await db.query.negotiationsTable.findFirst({ where: eq(negotiationsTable.id, id) });
    if (!existing) return res.status(404).json({ error: "Negotiation not found" });
    const messages = Array.isArray(existing.messages) ? [...existing.messages] : [];
    messages.push({
      id: generateId(),
      senderId: req.user!.userId,
      senderName: "Athoo Operations",
      text: `Negotiation closed by Athoo: ${reason.slice(0, 300)}`,
      timestamp: new Date().toISOString(),
    });
    const [updated] = await db.update(negotiationsTable).set({
      status: "rejected",
      messages,
      updatedAt: new Date(),
    }).where(and(
      eq(negotiationsTable.id, id),
      inArray(negotiationsTable.status, ["customer_offer", "provider_counter"]),
    )).returning();
    if (!updated) return res.status(409).json({ error: "Negotiation is already closed" });
    await logAdminAction(req, "negotiation_closed", "negotiation", id, { reason: reason.slice(0, 500) });
    emitToUser(updated.customerId, "negotiation:rejected", { negotiation: updated });
    emitToUser(updated.providerId, "negotiation:rejected", { negotiation: updated });
    await Promise.all([
      notifyUser({ userId: updated.customerId, title: "Negotiation closed", body: reason, type: "negotiation", link: `/negotiations/${id}`, data: { negotiationId: id } }),
      notifyUser({ userId: updated.providerId, title: "Negotiation closed", body: reason, type: "negotiation", link: `/negotiations/${id}`, data: { negotiationId: id } }),
    ]).catch(() => undefined);
    return res.json({ negotiation: updated });
  } catch (error) {
    logger.error({ err: error }, "admin negotiation close error");
    return res.status(500).json({ error: "Failed to close negotiation" });
  }
});

// ─── Audit Log ─────────────────────────────────────────────────────────────

async function logAdminAction(
  req: AuthRequest,
  action: string,
  target?: string,
  targetId?: string,
  details?: Record<string, unknown>
) {
  try {
    const admin = await db.query.usersTable.findFirst({ where: eq(usersTable.id, req.user!.userId) });
    await db.insert(auditLogTable).values({
      id: generateId(),
      adminId: req.user!.userId,
      adminName: admin?.name || "Admin",
      adminRole: admin?.adminRole || req.user!.adminRole,
      action,
      target,
      targetId,
      details: details || null,
      ip: req.ip || req.socket?.remoteAddress || null,
    });
  } catch {
    // Non-critical — don't fail the request
  }
}

router.get("/audit-log", requirePermission("audit.read"), async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    const offset = Number(req.query.offset) || 0;
    const logs = await db
      .select()
      .from(auditLogTable)
      .orderBy(desc(auditLogTable.createdAt))
      .limit(limit)
      .offset(offset);
    const total = await db.$count(auditLogTable);
    return res.json({ logs, total });
  } catch (e) {
    return res.status(500).json({ error: "Failed to load audit log" });
  }
});

// ─── Login History ─────────────────────────────────────────────────────────

router.get("/login-history", requirePermission("audit.read"), async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const offset = (page - 1) * limit;
    const successParam = req.query.success;

    let query = db.select().from(loginHistoryTable).$dynamic();
    if (successParam === "true") query = query.where(eq(loginHistoryTable.success, true));
    else if (successParam === "false") query = query.where(eq(loginHistoryTable.success, false));

    const [logs, totalResult] = await Promise.all([
      query.orderBy(desc(loginHistoryTable.createdAt)).limit(limit).offset(offset),
      db.$count(loginHistoryTable),
    ]);
    return res.json({ logs, total: totalResult, page, limit });
  } catch (e) {
    return res.status(500).json({ error: "Failed to load login history" });
  }
});

// ─── Internal Notifications ─────────────────────────────────────────────────

router.get("/notifications", requirePermission("notifications.read"), async (req: AuthRequest, res) => {
  try {
    const adminId = req.user!.userId;
    const notifications = await db
      .select()
      .from(adminNotificationsTable)
      .where(
        or(
          eq(adminNotificationsTable.targetAdminId, adminId),
          sql`${adminNotificationsTable.targetAdminId} IS NULL`
        )
      )
      .orderBy(desc(adminNotificationsTable.createdAt))
      .limit(50);

    const withRead = notifications.map((n) => ({
      ...n,
      isRead: Array.isArray(n.readByAdminIds) ? n.readByAdminIds.includes(adminId) : false,
    }));

    const unreadResult = await db.execute<{ unread_count: number }>(sql`
      SELECT count(*)::int AS unread_count
      FROM admin_notifications
      WHERE (target_admin_id = ${adminId} OR target_admin_id IS NULL)
        AND NOT (COALESCE(read_by_admin_ids, '[]'::jsonb) @> jsonb_build_array(${adminId}::text))
    `);
    const unreadCount = Number(unreadResult.rows[0]?.unread_count || 0);
    return res.json({ notifications: withRead, unreadCount });
  } catch (e) {
    return res.status(500).json({ error: "Failed to load notifications" });
  }
});

router.post("/notifications", requirePermission("notifications.write"), async (req: AuthRequest, res) => {
  try {
    const { title, message, type, link, targetAdminId } = req.body as {
      title?: string; message?: string; type?: string; link?: string; targetAdminId?: string;
    };
    if (!title?.trim() || !message?.trim()) return res.status(400).json({ error: "Title and message required" });

    const notif = await createAdminNotification({
      title,
      message,
      type: type || "info",
      link: link || null,
      targetAdminId: targetAdminId || null,
    });
    return res.json({ notification: notif });
  } catch (e) {
    return res.status(500).json({ error: "Failed to create notification" });
  }
});

router.patch("/notifications/:id/read", requirePermission("notifications.read"), async (req: AuthRequest, res) => {
  try {
    const adminId = req.user!.userId;
    const result = await db.execute<{ id: string }>(sql`
      UPDATE admin_notifications
      SET read_by_admin_ids = COALESCE(read_by_admin_ids, '[]'::jsonb) || jsonb_build_array(${adminId}::text)
      WHERE id = ${req.params.id as string}
        AND (target_admin_id = ${adminId} OR target_admin_id IS NULL)
        AND NOT (COALESCE(read_by_admin_ids, '[]'::jsonb) @> jsonb_build_array(${adminId}::text))
      RETURNING id
    `);
    if (result.rows.length === 0) {
      const visible = await db.query.adminNotificationsTable.findFirst({
        where: and(
          eq(adminNotificationsTable.id, req.params.id as string),
          or(eq(adminNotificationsTable.targetAdminId, adminId), isNull(adminNotificationsTable.targetAdminId)),
        ),
      });
      if (!visible) return res.status(404).json({ error: "Notification not found" });
    }
    return res.json({ success: true });
  } catch (e) {
    return res.status(500).json({ error: "Failed to mark notification read" });
  }
});

router.patch("/notifications/read-all", requirePermission("notifications.read"), async (req: AuthRequest, res) => {
  try {
    const adminId = req.user!.userId;
    // Single SQL UPDATE that appends adminId to readByAdminIds for any row
    // (a) targeted to this admin or broadcast (NULL), and (b) where adminId
    // isn't already in the array. Avoids the previous N-update loop.
    await db.execute(sql`
      UPDATE admin_notifications
      SET read_by_admin_ids = COALESCE(read_by_admin_ids, '[]'::jsonb) || jsonb_build_array(${adminId}::text)
      WHERE (target_admin_id = ${adminId} OR target_admin_id IS NULL)
        AND NOT (COALESCE(read_by_admin_ids, '[]'::jsonb) @> jsonb_build_array(${adminId}::text))
    `);
    return res.json({ success: true });
  } catch (e) {
    return res.status(500).json({ error: "Failed to mark all read" });
  }
});

// ─── Admin User Management ──────────────────────────────────────────────────

router.get("/admin-users", requireSuperAdmin, async (_req, res) => {
  try {
    const admins = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.role, "admin"))
      .orderBy(desc(usersTable.joinedAt));
    return res.json({ admins: admins.map((a) => toSafeUser(a)) });
  } catch (e) {
    return res.status(500).json({ error: "Failed to load admin users" });
  }
});

router.post("/admin-users", requireSuperAdmin, async (req: AuthRequest, res) => {
  try {
    const { name, phone, email, password, adminRole, adminPermissions } = req.body as Record<string, any>;
    if (!name?.trim() || !phone?.trim() || !password?.trim()) {
      return res.status(400).json({ error: "Name, phone, and password are required" });
    }
    if (!ADMIN_ROLES.includes(adminRole)) {
      return res.status(400).json({ error: "A valid admin role is required" });
    }
    const validatedPermissions = adminPermissions === undefined ? [] : validateAdminPermissions(adminPermissions);
    if (validatedPermissions === null) return res.status(400).json({ error: "Invalid admin permissions" });
    if (!isStrongAdminPassword(password)) return res.status(400).json({ error: "Admin password must be at least 12 characters and include upper, lower, number, and symbol" });

    const existing = await db.query.usersTable.findFirst({ where: eq(usersTable.phone, phone.trim()) });
    if (existing) return res.status(409).json({ error: "Phone already registered" });

    const bcrypt = await import("bcryptjs");
    const hashed = await bcrypt.hash(password, 12);

    const newAdminId = generateId();
    const newAdmin = {
      id: newAdminId,
      publicId: publicUserId("admin", newAdminId),
      name: name.trim(),
      phone: phone.trim(),
      email: email?.trim() || null,
      role: "admin" as const,
      password: hashed,
      adminRole: adminRole || null,
      adminPermissions: validatedPermissions,
      isVerified: true,
      isAvailable: true,
    };

    await db.insert(usersTable).values(newAdmin);
    await logAdminAction(req, "admin_user_created", "admin_user", newAdmin.id, { name: newAdmin.name, adminRole: newAdmin.adminRole });
    return res.json({ admin: toSafeUser(newAdmin as any) });
  } catch (e) {
    return res.status(500).json({ error: "Failed to create admin user" });
  }
});

router.patch("/admin-users/:id", requireSuperAdmin, async (req: AuthRequest, res) => {
  try {
    const { name, email, adminRole, adminPermissions, password } = req.body as Record<string, any>;
    const existingAdmin = await db.query.usersTable.findFirst({ where: and(eq(usersTable.id, String(req.params.id)), eq(usersTable.role, "admin")) });
    if (!existingAdmin) return res.status(404).json({ error: "Admin not found" });
    if (adminRole !== undefined && !ADMIN_ROLES.includes(adminRole)) {
      return res.status(400).json({ error: "Invalid admin role" });
    }
    const validatedPermissions = adminPermissions === undefined ? undefined : validateAdminPermissions(adminPermissions);
    if (validatedPermissions === null) return res.status(400).json({ error: "Invalid admin permissions" });
    if (req.params.id === req.user!.userId && (adminRole !== undefined || adminPermissions !== undefined)) {
      return res.status(400).json({ error: "Use another super admin to change your own role or permissions" });
    }
    if (password?.trim() && !isStrongAdminPassword(password)) {
      return res.status(400).json({ error: "Admin password must be at least 12 characters and include upper, lower, number, and symbol" });
    }
    if (existingAdmin.adminRole === "super_admin" && adminRole && adminRole !== "super_admin") {
      const superAdminCount = await db.$count(usersTable, and(eq(usersTable.role, "admin"), eq(usersTable.adminRole, "super_admin")));
      if (Number(superAdminCount) <= 1) return res.status(409).json({ error: "The last super admin cannot be demoted" });
    }

    const updateData: Record<string, any> = { updatedAt: new Date() };
    if (name?.trim()) updateData.name = name.trim();
    if (email !== undefined) updateData.email = email?.trim() || null;
    if (adminRole !== undefined) updateData.adminRole = adminRole;
    if (validatedPermissions !== undefined) updateData.adminPermissions = validatedPermissions;
    if (password?.trim()) {
      const bcrypt = await import("bcryptjs");
      updateData.password = await bcrypt.hash(password, 12);
    }

    await db.update(usersTable).set(updateData).where(and(eq(usersTable.id, String(req.params.id)), eq(usersTable.role, "admin")));
    const updated = await db.query.usersTable.findFirst({ where: eq(usersTable.id, String(req.params.id)) });
    if (!updated || updated.role !== "admin") return res.status(404).json({ error: "Admin not found" });

    if (password?.trim() || adminRole !== undefined || adminPermissions !== undefined) {
      await revokeAllUserSessions(req.params.id, "admin_security_profile_changed");
    }
    await logAdminAction(req, "admin_user_updated", "admin_user", req.params.id, { adminRole: updateData.adminRole, permissionsChanged: adminPermissions !== undefined, passwordChanged: Boolean(password?.trim()) });
    return res.json({ admin: toSafeUser(updated) });
  } catch (e) {
    return res.status(500).json({ error: "Failed to update admin user" });
  }
});

router.delete("/admin-users/:id", requireSuperAdmin, async (req: AuthRequest, res) => {
  try {
    if (req.params.id === req.user!.userId) return res.status(400).json({ error: "Cannot deactivate your own admin account" });
    const admin = await db.query.usersTable.findFirst({ where: and(eq(usersTable.id, String(req.params.id)), eq(usersTable.role, "admin")) });
    if (!admin) return res.status(404).json({ error: "Admin not found" });
    if (admin.adminRole === "super_admin") {
      const superAdminCount = await db.$count(usersTable, and(eq(usersTable.role, "admin"), eq(usersTable.adminRole, "super_admin"), eq(usersTable.isDeactivated, false)));
      if (Number(superAdminCount) <= 1) return res.status(409).json({ error: "The last active super admin cannot be deactivated" });
    }
    await revokeAllUserSessions(req.params.id, "admin_account_deactivated");
    await db.update(usersTable).set({ isDeactivated: true, accountStatus: "deactivated", updatedAt: new Date() }).where(eq(usersTable.id, String(req.params.id)));
    await logAdminAction(req, "admin_user_deactivated", "admin_user", req.params.id, { name: admin.name });
    return res.json({ success: true });
  } catch (e) {
    return res.status(500).json({ error: "Failed to deactivate admin user" });
  }
});

router.post("/admin-users/:id/reactivate", requireSuperAdmin, async (req: AuthRequest, res) => {
  const admin = await db.query.usersTable.findFirst({ where: and(eq(usersTable.id, String(req.params.id)), eq(usersTable.role, "admin")) });
  if (!admin) return res.status(404).json({ error: "Admin not found" });
  await db.update(usersTable).set({ isDeactivated: false, accountStatus: "active", adminFailedLoginCount: 0, adminLockedUntil: null, updatedAt: new Date() }).where(eq(usersTable.id, String(req.params.id)));
  await logAdminAction(req, "admin_user_reactivated", "admin_user", req.params.id, { name: admin.name });
  return res.json({ success: true });
});

// ─── Finance overview ───────────────────────────────────────────────────────
router.get("/finance/summary", requirePermission("finance.read"), async (_req, res) => {
  try {
    const settings = await getPlatformSettings();
    const [
      providerDues,
      completedTotals,
      ledgerTotals,
      pendingCommissionProofs,
      pendingWithdrawals,
      approvedWithdrawals,
      pendingRefunds,
      approvedRefunds,
      recentLedger,
    ] = await Promise.all([
      db.select({
        id: usersTable.id, name: usersTable.name, phone: usersTable.phone,
        pendingCommission: usersTable.pendingCommission, totalCommission: usersTable.totalCommission,
        commissionLimit: usersTable.commissionLimit, isBlocked: usersTable.isBlocked,
      }).from(usersTable)
        .where(and(eq(usersTable.role, "provider"), sql`${usersTable.pendingCommission} > 0`))
        .orderBy(desc(usersTable.pendingCommission)).limit(500),
      db.select({
        completedJobValue: sql<number>`coalesce(sum(coalesce(${bookingsTable.price},0) + coalesce(${bookingsTable.visitCharge},0)),0)::int`,
        commissionEarned: sql<number>`coalesce(sum(${bookingsTable.commissionAmount}),0)::int`,
        providerEarnings: sql<number>`coalesce(sum(${bookingsTable.providerAmount}),0)::int`,
        completedBookings: sql<number>`count(*)::int`,
      }).from(bookingsTable).where(eq(bookingsTable.status, "completed")),
      db.select({ entryType: financeLedgerTable.entryType, amount: sql<number>`coalesce(sum(${financeLedgerTable.amount}),0)::int` })
        .from(financeLedgerTable).groupBy(financeLedgerTable.entryType),
      db.$count(commissionPaymentsTable, eq(commissionPaymentsTable.status, "pending")),
      db.$count(withdrawalRequestsTable, eq(withdrawalRequestsTable.status, "pending")),
      db.$count(withdrawalRequestsTable, eq(withdrawalRequestsTable.status, "approved")),
      db.$count(refundRequestsTable, eq(refundRequestsTable.status, "pending")),
      db.$count(refundRequestsTable, eq(refundRequestsTable.status, "approved")),
      db.select().from(financeLedgerTable).orderBy(desc(financeLedgerTable.occurredAt)).limit(200),
    ]);
    const ledger = Object.fromEntries(ledgerTotals.map((row) => [row.entryType, Number(row.amount || 0)]));
    const totals = completedTotals[0] || { completedJobValue: 0, commissionEarned: 0, providerEarnings: 0, completedBookings: 0 };
    return res.json({
      settings,
      providerDues,
      totals: {
        ...totals,
        commissionReceived: Number(ledger.commission_received || 0),
        withdrawalsPaid: Number(ledger.provider_withdrawal || 0),
        refundsPaid: Number(ledger.customer_refund || 0),
        subscriptionRevenue: Number(ledger.subscription_received || 0),
        pendingCommissionDues: providerDues.reduce((sum, row) => sum + Number(row.pendingCommission || 0), 0),
        blockedProviders: providerDues.filter((row) => row.isBlocked).length,
      },
      queues: {
        pendingCommissionProofs: Number(pendingCommissionProofs),
        pendingWithdrawals: Number(pendingWithdrawals),
        approvedWithdrawals: Number(approvedWithdrawals),
        pendingRefunds: Number(pendingRefunds),
        approvedRefunds: Number(approvedRefunds),
      },
      recentLedger,
    });
  } catch (error) {
    logger.error({ err: error }, "admin finance summary error");
    return res.status(500).json({ error: "Failed to load finance summary" });
  }
});

// ─── Reports ────────────────────────────────────────────────────────────────

router.get("/reports", requirePermission("reports.read"), async (req, res) => {
  try {
    const fromInput = String(req.query.from || "").trim();
    const toInput = String(req.query.to || "").trim();
    const from = fromInput ? new Date(`${fromInput}T00:00:00.000Z`) : new Date(Date.now() - 30 * 86400000);
    const to = toInput ? new Date(`${toInput}T23:59:59.999Z`) : new Date();
    if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || from > to) {
      return res.status(400).json({ error: "A valid date range is required" });
    }
    if (to.getTime() - from.getTime() > 366 * 86400000) {
      return res.status(400).json({ error: "Report date range cannot exceed 366 days" });
    }
    const completionTs = sql`coalesce(${bookingsTable.jobCompletedAt}, ${bookingsTable.updatedAt})`;

    const [
      bookingsByStatus,
      bookingsByService,
      revenueByDay,
      newUsersByDay,
      topProviders,
      topServices,
      cashMovements,
      ledgerByDay,
    ] = await Promise.all([
      db.select({ status: bookingsTable.status, count: sql<number>`count(*)::int` })
        .from(bookingsTable)
        .where(and(gte(bookingsTable.createdAt, from), lte(bookingsTable.createdAt, to)))
        .groupBy(bookingsTable.status),

      db.select({
        service: bookingsTable.service,
        count: sql<number>`count(*)::int`,
        jobValue: sql<number>`coalesce(sum(coalesce(${bookingsTable.price},0) + coalesce(${bookingsTable.visitCharge},0)),0)::int`,
        commission: sql<number>`coalesce(sum(${bookingsTable.commissionAmount}),0)::int`,
      }).from(bookingsTable)
        .where(and(eq(bookingsTable.status, "completed"), gte(completionTs, from), lte(completionTs, to)))
        .groupBy(bookingsTable.service)
        .orderBy(sql`count(*) desc`)
        .limit(10),

      db.select({
        day: sql<string>`to_char(${completionTs}, 'YYYY-MM-DD')`,
        completedBookings: sql<number>`count(*)::int`,
        jobValue: sql<number>`coalesce(sum(coalesce(${bookingsTable.price},0) + coalesce(${bookingsTable.visitCharge},0)),0)::int`,
        commission: sql<number>`coalesce(sum(${bookingsTable.commissionAmount}),0)::int`,
        providerEarnings: sql<number>`coalesce(sum(${bookingsTable.providerAmount}),0)::int`,
      }).from(bookingsTable)
        .where(and(eq(bookingsTable.status, "completed"), gte(completionTs, from), lte(completionTs, to)))
        .groupBy(sql`to_char(${completionTs}, 'YYYY-MM-DD')`)
        .orderBy(sql`to_char(${completionTs}, 'YYYY-MM-DD')`),

      db.select({
        day: sql<string>`to_char(${usersTable.joinedAt}, 'YYYY-MM-DD')`,
        customers: sql<number>`count(*) filter (where ${usersTable.role} = 'customer')::int`,
        providers: sql<number>`count(*) filter (where ${usersTable.role} = 'provider')::int`,
      }).from(usersTable)
        .where(and(gte(usersTable.joinedAt, from), lte(usersTable.joinedAt, to)))
        .groupBy(sql`to_char(${usersTable.joinedAt}, 'YYYY-MM-DD')`)
        .orderBy(sql`to_char(${usersTable.joinedAt}, 'YYYY-MM-DD')`),

      db.select({
        id: usersTable.id, name: usersTable.name, totalJobs: usersTable.totalJobs,
        rating: usersTable.rating, ratingCount: usersTable.ratingCount,
        pendingCommission: usersTable.pendingCommission, totalCommission: usersTable.totalCommission,
      }).from(usersTable).where(eq(usersTable.role, "provider")).orderBy(desc(usersTable.totalJobs)).limit(10),

      db.select({ service: bookingsTable.service, count: sql<number>`count(*)::int` })
        .from(bookingsTable)
        .where(and(eq(bookingsTable.status, "completed"), gte(completionTs, from), lte(completionTs, to)))
        .groupBy(bookingsTable.service).orderBy(sql`count(*) desc`).limit(8),

      db.select({ entryType: financeLedgerTable.entryType, amount: sql<number>`coalesce(sum(${financeLedgerTable.amount}),0)::int`, count: sql<number>`count(*)::int` })
        .from(financeLedgerTable)
        .where(and(gte(financeLedgerTable.occurredAt, from), lte(financeLedgerTable.occurredAt, to)))
        .groupBy(financeLedgerTable.entryType),

      db.select({
        day: sql<string>`to_char(${financeLedgerTable.occurredAt}, 'YYYY-MM-DD')`,
        commissions: sql<number>`coalesce(sum(${financeLedgerTable.amount}) filter (where ${financeLedgerTable.entryType} = 'commission_received'),0)::int`,
        withdrawals: sql<number>`coalesce(sum(${financeLedgerTable.amount}) filter (where ${financeLedgerTable.entryType} = 'provider_withdrawal'),0)::int`,
        refunds: sql<number>`coalesce(sum(${financeLedgerTable.amount}) filter (where ${financeLedgerTable.entryType} = 'customer_refund'),0)::int`,
        subscriptions: sql<number>`coalesce(sum(${financeLedgerTable.amount}) filter (where ${financeLedgerTable.entryType} = 'subscription_received'),0)::int`,
      }).from(financeLedgerTable)
        .where(and(gte(financeLedgerTable.occurredAt, from), lte(financeLedgerTable.occurredAt, to)))
        .groupBy(sql`to_char(${financeLedgerTable.occurredAt}, 'YYYY-MM-DD')`)
        .orderBy(sql`to_char(${financeLedgerTable.occurredAt}, 'YYYY-MM-DD')`),
    ]);

    return res.json({
      bookingsByStatus, bookingsByService, revenueByDay, newUsersByDay, topProviders, topServices,
      cashMovements, ledgerByDay, period: { from: from.toISOString(), to: to.toISOString() },
    });
  } catch (e) {
    logger.error({ err: e }, "reports error");
    return res.status(500).json({ error: "Failed to generate reports" });
  }
});

// ─── CSV Export ─────────────────────────────────────────────────────────────

router.get("/export/:type", requirePermission("export.read"), async (req: AuthRequest, res) => {
  try {
    const type = String(req.params.type || "");
    const fromInput = String(req.query.from || "").trim();
    const toInput = String(req.query.to || "").trim();
    const from = fromInput ? new Date(`${fromInput}T00:00:00.000Z`) : new Date(Date.now() - 30 * 86400000);
    const to = toInput ? new Date(`${toInput}T23:59:59.999Z`) : new Date();
    if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || from > to) return res.status(400).json({ error: "A valid date range is required" });
    if (to.getTime() - from.getTime() > 366 * 86400000) return res.status(400).json({ error: "Export date range cannot exceed 366 days" });

    const csvCell = (value: unknown) => {
      let text = String(value ?? "");
      if (/^[=+@-]/.test(text) || text.startsWith("\t") || text.startsWith("\r")) text = `'${text}`;
      return `"${text.replace(/"/g, '""')}"`;
    };
    const csvRow = (values: unknown[]) => values.map(csvCell).join(",");
    const maxRows = 10_000;
    let header: string[] = [];
    let rows: unknown[][] = [];

    if (type === "users") {
      const result = await db.select().from(usersTable).where(and(gte(usersTable.joinedAt, from), lte(usersTable.joinedAt, to))).orderBy(desc(usersTable.joinedAt)).limit(maxRows + 1);
      header = ["ID","Name","Phone","Email","Role","Verified","Blocked","Deactivated","TotalJobs","Rating","PendingCommission","TotalCommission","JoinedAt"];
      rows = result.map(r => [r.id,r.name,r.phone,r.email || "",r.role,r.isVerified,r.isBlocked,r.isDeactivated,r.totalJobs,(r.rating || 0) / 10,r.pendingCommission,r.totalCommission,r.joinedAt?.toISOString() || ""]);
    } else if (type === "bookings") {
      const result = await db.select().from(bookingsTable).where(and(gte(bookingsTable.createdAt, from), lte(bookingsTable.createdAt, to))).orderBy(desc(bookingsTable.createdAt)).limit(maxRows + 1);
      header = ["ID","CustomerName","CustomerPhone","ProviderName","ProviderPhone","Service","Status","PaymentStatus","Price","CommissionAmount","ProviderAmount","Address","ScheduledDate","ScheduledTime","Rating","CreatedAt"];
      rows = result.map(r => [r.id,r.customerName,r.customerPhone,r.providerName,r.providerPhone,r.service,r.status,r.paymentStatus,r.price || 0,r.commissionAmount || 0,r.providerAmount || 0,r.address,r.scheduledDate,r.scheduledTime,r.rating || "",r.createdAt?.toISOString() || ""]);
    } else if (type === "finance") {
      const result = await db.select().from(financeLedgerTable).where(and(gte(financeLedgerTable.occurredAt, from), lte(financeLedgerTable.occurredAt, to))).orderBy(desc(financeLedgerTable.occurredAt)).limit(maxRows + 1);
      header = ["ID","Type","ReferenceType","ReferenceID","BookingID","ProviderID","CustomerID","Amount","PaymentReference","Note","CreatedBy","OccurredAt"];
      rows = result.map(r => [r.id,r.entryType,r.referenceType,r.referenceId,r.bookingId || "",r.providerId || "",r.customerId || "",r.amount,r.paymentReference || "",r.note || "",r.createdBy || "",r.occurredAt?.toISOString() || ""]);
    } else if (type === "providers") {
      const result = await db.select().from(usersTable).where(and(eq(usersTable.role, "provider"), gte(usersTable.joinedAt, from), lte(usersTable.joinedAt, to))).orderBy(desc(usersTable.totalJobs)).limit(maxRows + 1);
      header = ["ID","Name","Phone","Email","Location","Services","Rating","RatingCount","TotalJobs","Verified","Available","Blocked","PendingCommission","TotalCommission","JoinedAt"];
      rows = result.map(r => [r.id,r.name,r.phone,r.email || "",r.location || "",(r.services || []).join("|"),(r.rating || 0) / 10,r.ratingCount,r.totalJobs,r.isVerified,r.isAvailable,r.isBlocked,r.pendingCommission,r.totalCommission,r.joinedAt?.toISOString() || ""]);
    } else if (type === "support") {
      const result = await db.select().from(supportTicketsTable).where(and(gte(supportTicketsTable.createdAt, from), lte(supportTicketsTable.createdAt, to))).orderBy(desc(supportTicketsTable.createdAt)).limit(maxRows + 1);
      header = ["ID","UserName","UserPhone","UserRole","Subject","Status","Priority","AssignedTo","ResolvedAt","CreatedAt"];
      rows = result.map(r => [r.id,r.userName,r.userPhone,r.userRole,r.subject,r.status,r.priority,r.assignedTo || "",r.resolvedAt?.toISOString() || "",r.createdAt?.toISOString() || ""]);
    } else {
      return res.status(400).json({ error: "Invalid export type. Use: users, bookings, finance, providers, support" });
    }
    if (rows.length > maxRows) return res.status(413).json({ error: `Export exceeds ${maxRows} rows. Choose a smaller date range.` });
    const csv = "\uFEFF" + csvRow(header) + "\n" + rows.map(csvRow).join("\n");
    await logAdminAction(req, "data_exported", "report", type, { from: from.toISOString(), to: to.toISOString(), rowCount: rows.length });
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="athoo-${type}-${fromInput || 'recent'}-${toInput || 'today'}.csv"`);
    return res.send(csv);
  } catch (e) {
    logger.error({ err: e }, "export error");
    return res.status(500).json({ error: "Failed to generate export" });
  }
});

// ─── Promotions ─────────────────────────────────────────────────────────────

router.get("/promotions", requirePermission("promotions.read"), async (_req, res) => {
  try {
    const promos = await db.select().from(promotionsTable).orderBy(desc(promotionsTable.createdAt));
    return res.json({ promotions: promos });
  } catch (e) {
    return res.status(500).json({ error: "Failed to load promotions" });
  }
});

router.post("/promotions", requirePermission("promotions.write"), async (req: AuthRequest, res) => {
  try {
    const { code, description, discountType, discountValue, maxUses, minBookingValue, isActive, validFrom, validUntil } = req.body as Record<string, any>;
    if (!code?.trim() || !discountValue) return res.status(400).json({ error: "Code and discountValue are required" });

    const existing = await db.query.promotionsTable.findFirst({ where: eq(promotionsTable.code, code.trim().toUpperCase()) });
    if (existing) return res.status(409).json({ error: "Promo code already exists" });

    const promo = {
      id: generateId(),
      code: code.trim().toUpperCase(),
      description: description?.trim() || null,
      discountType: discountType || "percentage",
      discountValue: Number(discountValue),
      maxUses: maxUses ? Number(maxUses) : null,
      minBookingValue: minBookingValue ? Number(minBookingValue) : null,
      isActive: isActive !== false,
      validFrom: validFrom ? new Date(validFrom) : null,
      validUntil: validUntil ? new Date(validUntil) : null,
      createdBy: req.user!.userId,
    };
    await db.insert(promotionsTable).values(promo);
    await logAdminAction(req, "promotion_created", "promotion", promo.id, { code: promo.code });
    return res.json({ promotion: promo });
  } catch (e) {
    return res.status(500).json({ error: "Failed to create promotion" });
  }
});

router.patch("/promotions/:id", requirePermission("promotions.write"), async (req: AuthRequest, res) => {
  try {
    const { description, discountValue, maxUses, minBookingValue, isActive, validFrom, validUntil } = req.body as Record<string, any>;
    const update: Record<string, any> = { updatedAt: new Date() };
    if (description !== undefined) update.description = description?.trim() || null;
    if (discountValue !== undefined) update.discountValue = Number(discountValue);
    if (maxUses !== undefined) update.maxUses = maxUses ? Number(maxUses) : null;
    if (minBookingValue !== undefined) update.minBookingValue = minBookingValue ? Number(minBookingValue) : null;
    if (isActive !== undefined) update.isActive = Boolean(isActive);
    if (validFrom !== undefined) update.validFrom = validFrom ? new Date(validFrom) : null;
    if (validUntil !== undefined) update.validUntil = validUntil ? new Date(validUntil) : null;

    await db.update(promotionsTable).set(update).where(eq(promotionsTable.id, req.params.id));
    const updated = await db.query.promotionsTable.findFirst({ where: eq(promotionsTable.id, req.params.id) });
    await logAdminAction(req, "promotion_updated", "promotion", req.params.id, update);
    return res.json({ promotion: updated });
  } catch (e) {
    return res.status(500).json({ error: "Failed to update promotion" });
  }
});

router.delete("/promotions/:id", requirePermission("promotions.write"), async (req: AuthRequest, res) => {
  try {
    const promo = await db.query.promotionsTable.findFirst({ where: eq(promotionsTable.id, req.params.id) });
    await db.delete(promotionsTable).where(eq(promotionsTable.id, req.params.id));
    await logAdminAction(req, "promotion_deleted", "promotion", req.params.id, { code: promo?.code });
    return res.json({ success: true });
  } catch (e) {
    return res.status(500).json({ error: "Failed to delete promotion" });
  }
});

// Validate a promo code (public)
router.post("/promotions/validate", requireAuth, async (req, res) => {
  try {
    const { code, bookingValue } = req.body as { code?: string; bookingValue?: number };
    if (!code?.trim()) return res.status(400).json({ error: "Code required" });

    const promo = await db.query.promotionsTable.findFirst({ where: eq(promotionsTable.code, code.trim().toUpperCase()) });
    if (!promo || !promo.isActive) return res.status(404).json({ error: "Invalid or inactive promo code" });
    const now = new Date();
    if (promo.validFrom && promo.validFrom > now) return res.status(400).json({ error: "Promo code is not yet valid" });
    if (promo.validUntil && promo.validUntil < now) return res.status(400).json({ error: "Promo code has expired" });
    if (promo.maxUses && (promo.usedCount || 0) >= promo.maxUses) return res.status(400).json({ error: "Promo code has reached its usage limit" });
    if (bookingValue && promo.minBookingValue && bookingValue < promo.minBookingValue) return res.status(400).json({ error: `Minimum booking value is Rs. ${promo.minBookingValue}` });

    const discountAmount = promo.discountType === "percentage"
      ? Math.round((bookingValue || 0) * promo.discountValue / 100)
      : promo.discountValue;

    return res.json({ valid: true, promotion: promo, discountAmount });
  } catch (e) {
    return res.status(500).json({ error: "Failed to validate promo code" });
  }
});

// ── Broadcast Push Notification ───────────────────────────────────────────────
router.post("/broadcast-push", requirePermission("notifications.write"), async (req: AuthRequest, res) => {
  try {
    const { title, body, audience } = req.body as { title?: string; body?: string; audience?: string };
    const cleanTitle = String(title || "").trim();
    const cleanBody = String(body || "").trim();
    if (!cleanTitle || !cleanBody) return res.status(400).json({ error: "title and body are required" });

    // The legacy UI submits singular values (customer/provider), while the
    // primary broadcast page uses plural values. Normalize both safely; never
    // fall back an unknown value to the much broader "all" audience.
    const audienceMap: Record<string, "all" | "customers" | "providers"> = {
      all: "all",
      customer: "customers",
      customers: "customers",
      provider: "providers",
      providers: "providers",
    };
    const aud = audienceMap[String(audience || "").trim().toLowerCase()];
    if (!aud) return res.status(400).json({ error: "Invalid audience" });

    const audienceCondition = aud === "customers"
      ? eq(usersTable.role, "customer")
      : aud === "providers"
        ? eq(usersTable.role, "provider")
        : inArray(usersTable.role, ["customer", "provider"]);
    const users = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(and(
        audienceCondition,
        eq(usersTable.isBlocked, false),
        eq(usersTable.isDeactivated, false),
      ));

    const broadcastId = generateId();
    const delivery = await notifyUsers(users.map((user) => user.id), {
      title: cleanTitle,
      body: cleanBody,
      type: "system",
      link: "/notifications",
      data: { type: "system", broadcastId, audience: aud, source: "admin_broadcast" },
    });

    await db.insert(adminBroadcastsTable).values({
      id: broadcastId,
      title: cleanTitle,
      message: cleanBody,
      audience: aud,
      createdBy: req.user!.userId,
      sentCount: delivery.created,
      createdAt: new Date(),
    });
    await logAdminAction(req, "broadcast_push_sent", "broadcast", broadcastId, { audience: aud, delivery });

    return res.json({
      sent: delivery.pushAccepted,
      audience: aud,
      tokenCount: delivery.withPushToken,
      inAppCount: delivery.created,
      onlineCount: delivery.onlineRecipients,
      failedCount: delivery.pushFailed,
      delivery,
    });
  } catch (e) {
    logger.error({ err: e }, "admin broadcast push error");
    return res.status(500).json({ error: "Failed to send broadcast" });
  }
});

router.get("/broadcast-push/history", requirePermission("notifications.read"), async (_req, res) => {
  try {
    const history = await db.select().from(adminBroadcastsTable).orderBy(desc(adminBroadcastsTable.createdAt)).limit(50);
    return res.json({ history });
  } catch (e) {
    return res.status(500).json({ error: "Failed to load broadcast history" });
  }
});

// ─── Sidebar Counts ──────────────────────────────────────────────────────────

router.get("/sidebar-counts", async (req: AuthRequest, res) => {
  try {
    const adminId = req.user!.userId;

    const [
      pendingVerifications,
      pendingDocumentRenewals,
      pendingCommissionPayments,
      pendingWithdrawals,
      pendingRefunds,
      openSupportTickets,
      pendingRateRequests,
      pendingSubscriptions,
      pendingServiceRequests,
      pendingDeletionRequests,
      inactiveAccountsForReview,
      openReportedIssues,
      overdueNegotiationsForReview,
    ] = await Promise.all([
      db.$count(usersTable, and(eq(usersTable.role, "provider"), eq(usersTable.verificationStatus, "pending"))),
      db.$count(providerDocumentUpdateRequestsTable, eq(providerDocumentUpdateRequestsTable.status, "pending")),
      db.$count(commissionPaymentsTable, eq(commissionPaymentsTable.status, "pending")),
      db.$count(withdrawalRequestsTable, eq(withdrawalRequestsTable.status, "pending")),
      db.$count(refundRequestsTable, eq(refundRequestsTable.status, "pending")),
      db.$count(supportTicketsTable, inArray(supportTicketsTable.status, ["open", "in_progress"])),
      db.$count(hourlyRateRequestsTable, eq(hourlyRateRequestsTable.status, "pending")),
      db.$count(userSubscriptionsTable, eq(userSubscriptionsTable.status, "pending")),
      db.$count(serviceAddRequestsTable, eq(serviceAddRequestsTable.status, "pending")),
      db.$count(accountDeletionRequestsTable, eq(accountDeletionRequestsTable.status, "pending")),
      db.$count(usersTable, and(eq(usersTable.inactivityState, "review"), eq(usersTable.accountStatus, "active"), eq(usersTable.isDeactivated, false), eq(usersTable.isBlocked, false))),
      db.$count(reportIssuesTable, inArray(reportIssuesTable.status, ["open", "under_review"])),
      db.$count(negotiationsTable, and(
        inArray(negotiationsTable.status, ["customer_offer", "provider_counter"]),
        lte(negotiationsTable.expiresAt, new Date()),
      )),
    ]);

    // Count every visible unread notification. Do not cap this query to the
    // latest 100 rows because the sidebar badge must remain authoritative.
    const unreadResult = await db.execute<{ unread_count: number }>(sql`
      SELECT count(*)::int AS unread_count
      FROM admin_notifications
      WHERE (target_admin_id = ${adminId} OR target_admin_id IS NULL)
        AND NOT (COALESCE(read_by_admin_ids, '[]'::jsonb) @> jsonb_build_array(${adminId}::text))
    `);
    const unreadNotifications = Number(unreadResult.rows[0]?.unread_count || 0);

    return res.json({
      counts: {
        pendingVerifications,
        pendingDocumentRenewals,
        pendingCommissionPayments,
        pendingWithdrawals,
        pendingRefunds,
        openSupportTickets,
        pendingRateRequests,
        pendingSubscriptions,
        pendingServiceRequests,
        pendingDeletionRequests,
        inactiveAccountsForReview,
        openReportedIssues,
        overdueNegotiations: overdueNegotiationsForReview,
        unreadNotifications,
      },
    });
  } catch (e) {
    logger.error({ err: e }, "sidebar counts error");
    return res.status(500).json({ error: "Failed to load sidebar counts" });
  }
});

// ─── Admin Blacklist ──────────────────────────────────────────────────────────

router.get("/blacklist", requireSuperAdmin, async (_req, res) => {
  try {
    const entries = await db
      .select({
        id: adminBlacklistTable.id,
        type: adminBlacklistTable.type,
        value: adminBlacklistTable.value,
        reason: adminBlacklistTable.reason,
        addedBy: adminBlacklistTable.addedBy,
        isActive: adminBlacklistTable.isActive,
        createdAt: adminBlacklistTable.createdAt,
        addedByName: usersTable.name,
      })
      .from(adminBlacklistTable)
      .leftJoin(usersTable, eq(adminBlacklistTable.addedBy, usersTable.id))
      .orderBy(desc(adminBlacklistTable.createdAt));
    return res.json({ entries });
  } catch (e) {
    logger.error({ err: e }, "blacklist fetch error");
    return res.status(500).json({ error: "Failed to load blacklist" });
  }
});

router.post("/blacklist", requireSuperAdmin, async (req: AuthRequest, res) => {
  try {
    const { type, value, reason } = req.body as { type: string; value: string; reason?: string };
    if (!type || !value?.trim()) {
      return res.status(400).json({ error: "type and value are required" });
    }
    if (!["phone", "email"].includes(type)) {
      return res.status(400).json({ error: "type must be 'phone' or 'email'" });
    }

    const entry = {
      id: generateId(),
      type,
      value: value.trim().toLowerCase(),
      reason: reason?.trim() || null,
      addedBy: req.user!.userId,
      isActive: true,
    };
    await db.insert(adminBlacklistTable).values(entry);
    await logAdminAction(req, "blacklist_add", "blacklist", entry.id, { type, value: entry.value });
    return res.json({ entry });
  } catch (e) {
    logger.error({ err: e }, "blacklist add error");
    return res.status(500).json({ error: "Failed to add to blacklist" });
  }
});

router.patch("/blacklist/:id/toggle", requireSuperAdmin, async (req: AuthRequest, res) => {
  try {
    const entry = await db.query.adminBlacklistTable.findFirst({
      where: eq(adminBlacklistTable.id, req.params.id),
    });
    if (!entry) return res.status(404).json({ error: "Entry not found" });

    await db
      .update(adminBlacklistTable)
      .set({ isActive: !entry.isActive })
      .where(eq(adminBlacklistTable.id, req.params.id));

    await logAdminAction(req, entry.isActive ? "blacklist_disable" : "blacklist_enable", "blacklist", entry.id);
    return res.json({ success: true, isActive: !entry.isActive });
  } catch (e) {
    logger.error({ err: e }, "blacklist toggle error");
    return res.status(500).json({ error: "Failed to toggle blacklist entry" });
  }
});

router.delete("/blacklist/:id", requireSuperAdmin, async (req: AuthRequest, res) => {
  try {
    await db.delete(adminBlacklistTable).where(eq(adminBlacklistTable.id, req.params.id));
    await logAdminAction(req, "blacklist_remove", "blacklist", req.params.id);
    return res.json({ success: true });
  } catch (e) {
    logger.error({ err: e }, "blacklist delete error");
    return res.status(500).json({ error: "Failed to remove blacklist entry" });
  }
});

// ============================================================
// GLOBAL SEARCH — searches across users, providers, bookings,
// negotiations, invoices, notifications, complaints, broadcasts.
// Supports lookup by ID, phone, email, name, address, service.
// ============================================================
router.get("/search", requirePermission("users.read"), async (req: AuthRequest, res) => {
  try {
    const raw = String(req.query.q ?? "").trim();
    if (raw.length < 2) {
      return res.json({ query: raw, results: { users: [], bookings: [], negotiations: [], invoices: [], notifications: [], complaints: [], broadcasts: [] } });
    }
    const q = raw;
    const like = `%${q}%`;
    const PER = 8;

    const [users, bookings, negs, invs, notes, complaints, broadcasts] = await Promise.all([
      // Users (customers + providers + admins)
      db.select({
        id: usersTable.id, publicId: usersTable.publicId, name: usersTable.name, phone: usersTable.phone,
        email: usersTable.email, role: usersTable.role,
        isBlocked: usersTable.isBlocked, isDeactivated: usersTable.isDeactivated,
        verificationStatus: usersTable.verificationStatus,
      })
        .from(usersTable)
        .where(or(
          eq(usersTable.id, q),
          ilike(usersTable.publicId, like),
          ilike(usersTable.name, like),
          ilike(usersTable.phone, like),
          ilike(usersTable.email, like),
          ilike(usersTable.referralCode ?? sql`''`, like),
        ))
        .limit(PER),

      // Bookings — match by id, publicId, service, address, customer/provider name
      db.select({
        id: bookingsTable.id, publicId: bookingsTable.publicId,
        service: bookingsTable.service, status: bookingsTable.status,
        customerName: bookingsTable.customerName, providerName: bookingsTable.providerName,
        customerPhone: bookingsTable.customerPhone, providerPhone: bookingsTable.providerPhone,
        address: bookingsTable.address, price: bookingsTable.price,
        scheduledDate: bookingsTable.scheduledDate, createdAt: bookingsTable.createdAt,
      })
        .from(bookingsTable)
        .where(or(
          eq(bookingsTable.id, q),
          ilike(bookingsTable.publicId ?? sql`''`, like),
          ilike(bookingsTable.service, like),
          ilike(bookingsTable.address ?? sql`''`, like),
          ilike(bookingsTable.customerName ?? sql`''`, like),
          ilike(bookingsTable.providerName ?? sql`''`, like),
          ilike(bookingsTable.customerPhone ?? sql`''`, like),
          ilike(bookingsTable.providerPhone ?? sql`''`, like),
        ))
        .orderBy(desc(bookingsTable.createdAt))
        .limit(PER),

      // Negotiations / offers
      db.select({
        id: negotiationsTable.id, customerId: negotiationsTable.customerId,
        providerId: negotiationsTable.providerId, status: negotiationsTable.status,
        customerOffer: negotiationsTable.customerOffer, providerCounter: negotiationsTable.providerCounter,
        service: negotiationsTable.service, createdAt: negotiationsTable.createdAt,
      })
        .from(negotiationsTable)
        .where(or(
          eq(negotiationsTable.id, q),
          eq(negotiationsTable.customerId, q),
          eq(negotiationsTable.providerId, q),
          ilike(negotiationsTable.service ?? sql`''`, like),
        ))
        .orderBy(desc(negotiationsTable.createdAt))
        .limit(PER),

      // Invoices
      db.select()
        .from(invoicesTable)
        .where(or(
          eq(invoicesTable.id, q),
          ilike(invoicesTable.invoiceNumber, like),
          eq(invoicesTable.bookingId, q),
          eq(invoicesTable.customerId, q),
          eq(invoicesTable.providerId, q),
        ))
        .orderBy(desc(invoicesTable.createdAt))
        .limit(PER),

      // Notifications
      db.select({
        id: notificationsTable.id, userId: notificationsTable.userId,
        title: notificationsTable.title, body: notificationsTable.body,
        type: notificationsTable.type, isRead: notificationsTable.isRead,
        createdAt: notificationsTable.createdAt,
      })
        .from(notificationsTable)
        .where(or(
          eq(notificationsTable.id, q),
          eq(notificationsTable.userId, q),
          ilike(notificationsTable.title ?? sql`''`, like),
          ilike(notificationsTable.body ?? sql`''`, like),
        ))
        .orderBy(desc(notificationsTable.createdAt))
        .limit(PER),

      // Complaints / Support tickets
      db.select()
        .from(supportTicketsTable)
        .where(or(
          eq(supportTicketsTable.id, q),
          eq(supportTicketsTable.userId, q),
          ilike(supportTicketsTable.subject ?? sql`''`, like),
          ilike(supportTicketsTable.message ?? sql`''`, like),
        ))
        .orderBy(desc(supportTicketsTable.createdAt))
        .limit(PER),

      // Broadcast requests
      db.select()
        .from(broadcastRequestsTable)
        .where(or(
          eq(broadcastRequestsTable.id, q),
          eq(broadcastRequestsTable.customerId, q),
          ilike(broadcastRequestsTable.service ?? sql`''`, like),
          ilike(broadcastRequestsTable.address ?? sql`''`, like),
        ))
        .orderBy(desc(broadcastRequestsTable.createdAt))
        .limit(PER),
    ]);

    return res.json({
      query: q,
      results: {
        users: users.map((u) => ({ ...u, kind: u.role })),
        bookings,
        negotiations: negs,
        invoices: invs,
        notifications: notes,
        complaints,
        broadcasts,
      },
      counts: {
        users: users.length, bookings: bookings.length, negotiations: negs.length,
        invoices: invs.length, notifications: notes.length, complaints: complaints.length,
        broadcasts: broadcasts.length,
      },
    });
  } catch (error) {
    logger.error({ err: error }, "admin global search error");
    return res.status(500).json({ error: "Search failed" });
  }
});

// ============================================================
// USER FULL ACTIVITY — single endpoint that returns every linked
// piece of data for one user (customer or provider).
// ============================================================
router.get("/users/:id/activity", requirePermission("users.read"), async (req: AuthRequest, res) => {
  try {
    const userId = req.params.id;
    const user = await db.query.usersTable.findFirst({ where: eq(usersTable.id, userId) });
    if (!user) return res.status(404).json({ error: "User not found" });

    const isProvider = user.role === "provider";

    const [
      bookingsAsCustomer,
      bookingsAsProvider,
      negotiationsAsCustomer,
      negotiationsAsProvider,
      notifications,
      tickets,
      reviewsGiven,
      reviewsReceived,
      invoices,
      commissions,
      withdrawals,
      refunds,
      logins,
      broadcastsCreated,
      documents,
    ] = await Promise.all([
      db.select().from(bookingsTable).where(eq(bookingsTable.customerId, userId)).orderBy(desc(bookingsTable.createdAt)).limit(200),
      db.select().from(bookingsTable).where(eq(bookingsTable.providerId, userId)).orderBy(desc(bookingsTable.createdAt)).limit(200),
      db.select().from(negotiationsTable).where(eq(negotiationsTable.customerId, userId)).orderBy(desc(negotiationsTable.createdAt)).limit(100),
      db.select().from(negotiationsTable).where(eq(negotiationsTable.providerId, userId)).orderBy(desc(negotiationsTable.createdAt)).limit(100),
      db.select().from(notificationsTable).where(eq(notificationsTable.userId, userId)).orderBy(desc(notificationsTable.createdAt)).limit(100),
      db.select().from(supportTicketsTable).where(eq(supportTicketsTable.userId, userId)).orderBy(desc(supportTicketsTable.createdAt)).limit(50),
      db.select().from(reviewsTable).where(eq(reviewsTable.reviewerId, userId)).orderBy(desc(reviewsTable.createdAt)).limit(50).catch(() => []),
      db.select().from(reviewsTable).where(eq(reviewsTable.reviewedId, userId)).orderBy(desc(reviewsTable.createdAt)).limit(50).catch(() => []),
      db.select().from(invoicesTable).where(or(eq(invoicesTable.customerId, userId), eq(invoicesTable.providerId, userId))).orderBy(desc(invoicesTable.createdAt)).limit(100).catch(() => []),
      isProvider ? db.select().from(commissionPaymentsTable).where(eq(commissionPaymentsTable.providerId, userId)).orderBy(desc(commissionPaymentsTable.createdAt)).limit(100) : Promise.resolve([]),
      isProvider ? db.select().from(withdrawalRequestsTable).where(eq(withdrawalRequestsTable.providerId, userId)).orderBy(desc(withdrawalRequestsTable.createdAt)).limit(50) : Promise.resolve([]),
      !isProvider ? db.select().from(refundRequestsTable).where(eq(refundRequestsTable.customerId, userId)).orderBy(desc(refundRequestsTable.createdAt)).limit(50) : Promise.resolve([]),
      db.select().from(loginHistoryTable).where(eq(loginHistoryTable.userId, userId)).orderBy(desc(loginHistoryTable.createdAt)).limit(50).catch(() => []),
      !isProvider ? db.select().from(broadcastRequestsTable).where(eq(broadcastRequestsTable.customerId, userId)).orderBy(desc(broadcastRequestsTable.createdAt)).limit(100) : Promise.resolve([]),
      isProvider ? db.select().from(providerDocumentsTable).where(eq(providerDocumentsTable.providerId, userId)) : Promise.resolve([]),
    ]);

    const bookings = isProvider ? bookingsAsProvider : bookingsAsCustomer;
    const negotiations = isProvider ? negotiationsAsProvider : negotiationsAsCustomer;

    // Roll-up stats
    const total = bookings.length;
    const completed = bookings.filter((b: any) => b.status === "completed").length;
    const cancelled = bookings.filter((b: any) => b.status === "cancelled").length;
    const active = bookings.filter((b: any) => ["pending", "accepted", "in_progress", "on_the_way", "arrived", "started"].includes(b.status)).length;
    const totalSpent = bookings.filter((b: any) => b.status === "completed").reduce((s: number, b: any) => s + Number(b.price ?? 0), 0);

    return res.json({
      user: toSafeUser(user),
      stats: {
        totalBookings: total,
        active,
        completed,
        cancelled,
        totalAmount: totalSpent,
        offersSubmitted: negotiations.length,
        offersAccepted: negotiations.filter((n: any) => n.status === "accepted").length,
        offersRejected: negotiations.filter((n: any) => n.status === "rejected").length,
        notifications: notifications.length,
        complaints: tickets.length,
      },
      bookings,
      negotiations,
      notifications,
      complaints: tickets,
      reviewsGiven,
      reviewsReceived,
      invoices,
      commissions,
      withdrawals,
      refunds,
      loginHistory: logins,
      broadcasts: broadcastsCreated,
      documents,
    });
  } catch (error) {
    logger.error({ err: error }, "admin user activity error");
    return res.status(500).json({ error: "Failed to load user activity" });
  }
});

// ─── Invoices list ───────────────────────────────────────────────────────────
router.get("/invoices", requirePermission("finance.read"), async (req: AuthRequest, res) => {
  try {
    const status = req.query.status as string | undefined;
    const query = db
      .select()
      .from(invoicesTable)
      .orderBy(desc(invoicesTable.createdAt));
    const rows = await query.limit(1000);
    const invoices = status && status !== "all"
      ? rows.filter((i: any) => i.status === status)
      : rows;
    return res.json({ invoices });
  } catch (err) {
    logger.error({ err }, "admin invoices list error");
    return res.status(500).json({ error: "Failed to load invoices" });
  }
});

// ─── Bulk Email ───────────────────────────────────────────────────────────────
// Send a custom email to a filtered set of users (by role, IDs, or all).
// Rate-limited to 500 recipients per call to protect SMTP quota.
router.post("/bulk-email", requirePermission("users.write"), async (req: AuthRequest, res) => {
  try {
    const {
      subject,
      message,
      audience,        // "all" | "customers" | "providers"
      targetUserIds,   // optional string[]
    } = req.body as {
      subject?: string;
      message?: string;
      audience?: string;
      targetUserIds?: string[];
    };

    if (!subject?.trim()) return res.status(400).json({ error: "Subject is required" });
    if (!message?.trim()) return res.status(400).json({ error: "Message body is required" });

    const safeSubject = subject.trim();
    const safeMessage = message.trim();
    const normalizedIds = Array.isArray(targetUserIds)
      ? Array.from(new Set(targetUserIds.map((v) => String(v).trim()).filter(Boolean)))
      : [];

    let recipients: { id: string; email: string; name: string }[] = [];

    if (normalizedIds.length > 0) {
      const rows = await db
        .select({ id: usersTable.id, email: usersTable.email, name: usersTable.name })
        .from(usersTable)
        .where(sql`${usersTable.id} = ANY(ARRAY[${sql.join(normalizedIds.map((id) => sql`${id}`), sql`, `)}]::text[])`);
      recipients = rows.filter((r) => r.email) as { id: string; email: string; name: string }[];
    } else {
      const roleFilter =
        audience === "customers"
          ? eq(usersTable.role, "customer")
          : audience === "providers"
            ? eq(usersTable.role, "provider")
            : undefined;
      const rows = await db
        .select({ id: usersTable.id, email: usersTable.email, name: usersTable.name })
        .from(usersTable)
        .where(and(roleFilter, sql`${usersTable.email} IS NOT NULL`))
        .limit(500);
      recipients = rows.filter((r) => r.email) as { id: string; email: string; name: string }[];
    }

    if (recipients.length === 0) {
      return res.status(400).json({ error: "No recipients with email addresses found" });
    }

    // Build styled email HTML (reuse Athoo brand template)
    const buildHtml = (name: string) => `
      <div style="font-family:Inter,Arial,sans-serif;background:#F4F6FB;padding:32px">
        <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:16px;padding:32px;box-shadow:0 4px 20px rgba(0,0,0,.06)">
          <h1 style="margin:0 0 4px;color:#1A6EE0;font-size:22px">Athoo</h1>
          <p style="margin:0 0 24px;color:#475569;font-size:13px">Pakistani home services marketplace</p>
          <p style="margin:0 0 16px;color:#334155">Hi ${name},</p>
          <div style="color:#334155;line-height:1.7;white-space:pre-wrap">${safeMessage.replace(/\n/g, "<br/>")}</div>
          <p style="margin:28px 0 0;color:#94A3B8;font-size:12px">You received this because you are registered on Athoo. Contact support@athoo.pk if you have questions.</p>
        </div>
      </div>`;

    // Send sequentially in small batches to avoid SMTP timeouts
    let sent = 0;
    let failed = 0;
    for (const recipient of recipients) {
      const result = await sendEmail({
        to: recipient.email,
        subject: safeSubject,
        html: buildHtml(recipient.name || "Athoo User"),
        text: `Hi ${recipient.name || "Athoo User"},\n\n${safeMessage}\n\nAthoo Team`,
      });
      if (result.ok) sent++;
      else failed++;
    }

    await logAdminAction(req, "bulk_email_sent", "users", undefined, {
      subject: safeSubject,
      audience: audience || "specific",
      recipientCount: recipients.length,
      sent,
      failed,
    });

    return res.json({ success: true, total: recipients.length, sent, failed });
  } catch (err) {
    logger.error({ err }, "admin bulk-email error");
    return res.status(500).json({ error: "Failed to send bulk email" });
  }
});

// ─── Test Email ───────────────────────────────────────────────────────────────
router.post("/settings/test-email", requireSuperAdmin, async (req: AuthRequest, res) => {
  try {
    const admin = await db.query.usersTable.findFirst({ where: eq(usersTable.id, req.user!.userId) });
    const toAddress = admin?.email;
    if (!toAddress) {
      return res.status(400).json({ error: "Your admin account has no email address. Add one in your profile first." });
    }
    const result = await sendEmail({
      to: toAddress,
      subject: "Athoo – Test Email",
      html: `<div style="font-family:Inter,Arial,sans-serif;padding:32px;background:#F4F6FB"><div style="max-width:480px;margin:0 auto;background:#fff;border-radius:16px;padding:32px"><h1 style="color:#1A6EE0">Athoo</h1><h2 style="color:#0F172A">Test email ✅</h2><p style="color:#334155">Your SMTP configuration is working correctly. This test was triggered from the Athoo Admin Panel by <strong>${admin?.name || "Admin"}</strong>.</p></div></div>`,
      text: `Your Athoo SMTP configuration is working correctly. Test triggered by ${admin?.name || "Admin"}.`,
    });
    return res.json({ ok: result.ok, channel: result.channel, to: toAddress });
  } catch (err) {
    logger.error({ err }, "test-email error");
    return res.status(500).json({ error: "Failed to send test email" });
  }
});

// ─── Invoice: admin adjust status ────────────────────────────────────────────
router.patch("/invoices/:id/status", requirePermission("finance.write"), async (req: AuthRequest, res) => {
  try {
    const status = String(req.body?.status || "").trim();
    const reason = String(req.body?.reason || "").trim() || null;
    const validStatuses = ["issued", "paid", "disputed", "cancelled"];
    if (!validStatuses.includes(status)) return res.status(400).json({ error: `status must be one of: ${validStatuses.join(", ")}` });

    const invoice = await db.query.invoicesTable.findFirst({ where: eq(invoicesTable.id, req.params.id) });
    if (!invoice) return res.status(404).json({ error: "Invoice not found" });
    if (invoice.status === status) return res.json({ invoice, duplicate: true });
    const booking = await db.query.bookingsTable.findFirst({ where: eq(bookingsTable.id, invoice.bookingId) });
    if (!booking) return res.status(409).json({ error: "Invoice booking no longer exists" });

    const current = String(invoice.status || "issued");
    const allowed =
      (current === "issued" && ["paid", "disputed", "cancelled"].includes(status)) ||
      (current === "disputed" && ["issued", "paid", "cancelled"].includes(status));
    if (!allowed) return res.status(409).json({ error: `Invoice cannot move from ${current} to ${status}` });
    if (["disputed", "cancelled", "issued"].includes(status) && (!reason || reason.length < 5)) {
      return res.status(400).json({ error: "A reason of at least 5 characters is required for this invoice change" });
    }
    if (status === "paid" && !["paid", "received"].includes(String(booking.paymentStatus || "pending"))) {
      return res.status(409).json({ error: "Invoice cannot be marked paid until booking payment is recorded" });
    }
    if (status === "cancelled" && (booking.status !== "cancelled" || booking.paymentStatus !== "pending")) {
      return res.status(409).json({ error: "Only unpaid cancelled bookings can have cancelled invoices" });
    }

    const changed = await db.update(invoicesTable)
      .set({ status, updatedAt: new Date() })
      .where(and(eq(invoicesTable.id, invoice.id), eq(invoicesTable.status, current)))
      .returning();
    if (changed.length !== 1) return res.status(409).json({ error: "Invoice was changed by another request" });

    await logAdminAction(req, "invoice_status_updated", "invoice", invoice.id, {
      bookingId: invoice.bookingId, from: current, to: status, reason,
    });
    return res.json({ invoice: changed[0], duplicate: false });
  } catch (err) {
    logger.error({ err }, "admin invoice status update error");
    return res.status(500).json({ error: "Failed to update invoice status" });
  }
});

router.get("/reviews", requirePermission("support.read"), async (req, res) => {
  try {
    const q = String(req.query.q || "").trim();
    const status = String(req.query.status || "all");
    const conditions = [] as any[];
    if (q) {
      const pattern = `%${q}%`;
      conditions.push(or(
        ilike(reviewsTable.reviewerName, pattern),
        ilike(reviewsTable.reviewedName, pattern),
        ilike(reviewsTable.review, pattern),
        ilike(reviewsTable.bookingId, pattern),
      ));
    }
    if (status === "hidden") conditions.push(eq(reviewsTable.isDisputed, true));
    if (status === "visible") conditions.push(eq(reviewsTable.isDisputed, false));
    const rows = await db.select({
      id: reviewsTable.id,
      bookingId: reviewsTable.bookingId,
      reviewerId: reviewsTable.reviewerId,
      reviewerName: reviewsTable.reviewerName,
      reviewedId: reviewsTable.reviewedId,
      reviewedName: reviewsTable.reviewedName,
      rating: reviewsTable.rating,
      review: reviewsTable.review,
      isDisputed: reviewsTable.isDisputed,
      disputeNote: reviewsTable.disputeNote,
      disputeResolvedAt: reviewsTable.disputeResolvedAt,
      createdAt: reviewsTable.createdAt,
      service: bookingsTable.service,
    }).from(reviewsTable)
      .innerJoin(bookingsTable, eq(bookingsTable.id, reviewsTable.bookingId))
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(reviewsTable.createdAt))
      .limit(250);
    return res.json({ reviews: rows });
  } catch (err) {
    logger.error({ err }, "admin reviews list error");
    return res.status(500).json({ error: "Failed to load reviews" });
  }
});

router.patch("/reviews/:id/moderation", requirePermission("support.write"), async (req: AuthRequest, res) => {
  try {
    const action = String(req.body?.action || "");
    const note = String(req.body?.note || "").trim();
    if (!['hide', 'restore'].includes(action)) return res.status(400).json({ error: "action must be hide or restore" });
    if (action === 'hide' && note.length < 5) return res.status(400).json({ error: "A moderation reason is required" });
    const [existing] = await db.select().from(reviewsTable).where(eq(reviewsTable.id, req.params.id));
    if (!existing) return res.status(404).json({ error: "Review not found" });
    const hidden = action === 'hide';
    await db.update(reviewsTable).set({
      isDisputed: hidden,
      disputeNote: hidden ? note : null,
      disputeResolvedAt: hidden ? null : new Date(),
      updatedAt: new Date(),
    }).where(eq(reviewsTable.id, existing.id));

    const [summary] = await db.select({
      average: sql<number>`round(avg(${reviewsTable.rating})::numeric, 0)`,
      count: sql<number>`count(*)::int`,
    }).from(reviewsTable).where(and(eq(reviewsTable.reviewedId, existing.reviewedId), eq(reviewsTable.isDisputed, false)));
    await db.update(usersTable).set({
      rating: Number(summary?.average || 0),
      ratingCount: Number(summary?.count || 0),
    }).where(eq(usersTable.id, existing.reviewedId));

    await logAdminAction(req, hidden ? "review_hidden" : "review_restored", "review", existing.id, {
      bookingId: existing.bookingId,
      providerId: existing.reviewedId,
      reason: hidden ? note : null,
    });
    const updated = await db.query.reviewsTable.findFirst({ where: eq(reviewsTable.id, existing.id) });
    return res.json({ review: updated });
  } catch (err) {
    logger.error({ err }, "admin review moderation error");
    return res.status(500).json({ error: "Failed to moderate review" });
  }
});

export default router;

