import { Router, type IRouter } from "express";
import { getPlatformSettings } from "../lib/admin";
import { logger } from "../lib/logger";
import healthRouter from "./health";
import storageRouter from "./storage";
import authRouter from "./auth";
import providersRouter, { ratingsRouter } from "./providers";
import bookingsRouter from "./bookings";
import negotiationsRouter from "./negotiations";
import chatRouter from "./chat";
import callsRouter from "./calls";
import adminRouter from "./admin";
import supportRouter from "./support";
import addressesRouter from "./addresses";
import chatbotRouter from "./chatbot";
import meRouter from "./me";
import categoriesRouter, { categoriesAdminRouter } from "./categories";
import paymentsRouter, { paymentsAdminRouter } from "./payments";
import accountRouter, { accountAdminRouter } from "./account";
import subscriptionsRouter, { subscriptionsAdminRouter, seedSubscriptionPlansIfEmpty } from "./subscriptions";
import promotionsRouter from "./promotions";
import withdrawalsRouter, { withdrawalsAdminRouter } from "./withdrawals";
import refundsRouter, { refundsAdminRouter } from "./refunds";
import broadcastRouter from "./broadcast";
import invoicesRouter from "./invoices";
import { marketingPublicRouter, marketingAdminRouter } from "./marketing";
import { emergencyContactsPublicRouter, emergencyContactsAdminRouter } from "./emergency-contacts";
import notificationTemplatesRouter from "./notification-templates";
import { reportIssuesRouter, reportIssuesAdminRouter } from "./report-issues";
import { rateRequestsProviderRouter, rateRequestsAdminRouter } from "./rate-requests";
import { serviceAreasPublicRouter, serviceAreasAdminRouter, seedServiceAreasIfEmpty } from "./service-areas";
import geoRouter from "./geo";
import { leadsPublicRouter, leadsAdminRouter } from "./leads";
import { emailPublicRouter, emailUserRouter, emailAdminRouter } from "./email";
import { policiesPublicRouter, policiesAdminRouter } from "./policies";
import inactivityAdminRouter from "./inactivity";

const router: IRouter = Router();

router.use(healthRouter);
router.use(storageRouter);
router.use("/auth", authRouter);
router.use("/email", emailPublicRouter);
router.use("/me/email", emailUserRouter);
router.use("/providers", providersRouter);
router.use("/ratings", ratingsRouter);
router.use("/bookings", bookingsRouter);
router.use("/negotiations", negotiationsRouter);
router.use("/broadcast", broadcastRouter);
router.use("/chat", chatRouter);
router.use("/calls", callsRouter);
router.use("/support", supportRouter);
router.use("/addresses", addressesRouter);
router.use("/chatbot", chatbotRouter);
router.use("/emergency-contacts", emergencyContactsPublicRouter);
router.use("/report-issues", reportIssuesRouter);
// More specific path must mount BEFORE the generic /me router, otherwise
// Express dispatches /me/account/... requests through meRouter's requireAuth
// middleware first (which blocks soft-deactivated users) before they can reach
// the cancel-deletion / reactivate endpoints.
router.use("/me/account", accountRouter);
router.use("/me/rate-requests", rateRequestsProviderRouter);
router.use("/me", meRouter);
router.use("/categories", categoriesRouter);
router.use("/payments", paymentsRouter);
router.use("/subscriptions", subscriptionsRouter);
router.use("/promotions", promotionsRouter);
router.use("/withdrawals", withdrawalsRouter);
router.use("/refunds", refundsRouter);
router.use("/invoices", invoicesRouter);

// Admin sub-mounts (these inherit their own requireAdmin middleware)
router.use("/marketing", marketingPublicRouter);
router.use("/policies", policiesPublicRouter);

// Admin sub-mounts
router.use("/admin/marketing", marketingAdminRouter);
router.use("/admin/categories", categoriesAdminRouter);
router.use("/admin/payments", paymentsAdminRouter);
router.use("/admin/account", accountAdminRouter);
router.use("/admin/subscriptions", subscriptionsAdminRouter);
router.use("/admin/withdrawals", withdrawalsAdminRouter);
router.use("/admin/refunds", refundsAdminRouter);
router.use("/admin/emergency-contacts", emergencyContactsAdminRouter);
router.use("/admin/notification-templates", notificationTemplatesRouter);
router.use("/admin/report-issues", reportIssuesAdminRouter);
router.use("/admin/rate-requests", rateRequestsAdminRouter);

router.use("/admin/service-areas", serviceAreasAdminRouter);
router.use("/service-areas", serviceAreasPublicRouter);
router.use("/geo", geoRouter);
router.use("/leads", leadsPublicRouter);
router.use("/admin/leads", leadsAdminRouter);
router.use("/admin/email", emailAdminRouter);
router.use("/admin/policies", policiesAdminRouter);
router.use("/admin/inactivity", inactivityAdminRouter);

// ─── Public settings (no auth) ───────────────────────────────────────────────
// Cached in-process for 60s. This endpoint is hit by every cold mobile/admin
// session; the cache eliminates a DB round-trip per call and lets a single
// instance comfortably absorb thousands of RPS for it.
let _publicSettingsCache: { body: object; fetchedAt: number } | null = null;
const PUBLIC_SETTINGS_TTL_MS = 60_000;

router.get("/settings/public", async (_req, res) => {
  try {
    const now = Date.now();
    if (_publicSettingsCache && now - _publicSettingsCache.fetchedAt < PUBLIC_SETTINGS_TTL_MS) {
      res.set("Cache-Control", "public, max-age=60");
      return res.json(_publicSettingsCache.body);
    }
    const s = await getPlatformSettings();
    const body = {
      settings: {
        platformName: s.platformName,
        supportPhone: s.supportPhone,
        supportEmail: s.supportEmail,
        maintenanceMode: s.maintenanceMode,
        defaultVisitCharge: s.defaultVisitCharge,
        defaultCommissionLimit: s.defaultCommissionLimit,
        defaultServiceRadiusKm: s.defaultServiceRadiusKm,
        broadcastTTLMinutes: s.broadcastTTLMinutes,
        maxNegotiationRounds: s.maxNegotiationRounds,
        premiumProfileBadgeEnabled: s.premiumProfileBadgeEnabled,
        customerCancellationFee: s.customerCancellationFee,
        providerCancellationPenalty: s.providerCancellationPenalty,
        premiumCommissionDiscountPercent: s.premiumCommissionDiscountPercent,
        commissionRate: s.commissionRate,
      },
    };
    _publicSettingsCache = { body, fetchedAt: now };
    res.set("Cache-Control", "public, max-age=60");
    return res.json(body);
  } catch (e) {
    logger.error({ err: e }, "public settings error");
    return res.status(500).json({ error: "Failed to load settings" });
  }
});

// Main admin router (must be last so the more-specific /admin/* routes above match first)
router.use("/admin", adminRouter);

// Seed default data on startup (idempotent)
seedServiceAreasIfEmpty().catch(() => undefined);
seedSubscriptionPlansIfEmpty().catch(() => undefined);

export default router;
