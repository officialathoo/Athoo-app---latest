import { Router, type Response } from "express";
import { logger } from "../lib/logger";
import { db } from "@workspace/db";
import { promotionsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { requireAuth, type AuthRequest } from "../middlewares/auth";

const router = Router();

router.post("/validate", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const code = String(req.body?.code || "").trim().toUpperCase();
    const bookingValue = Number(req.body?.bookingValue || 0);
    if (!code) {
      res.status(400).json({ error: "Promo code required" });
      return;
    }
    const promo = await db.query.promotionsTable.findFirst({
      where: eq(promotionsTable.code, code),
    });
    if (!promo || !promo.isActive) {
      res.status(404).json({ error: "Invalid or expired promo code" });
      return;
    }
    const now = new Date();
    if (promo.validFrom && promo.validFrom > now) {
      res.status(400).json({ error: "This promo is not active yet" });
      return;
    }
    if (promo.validUntil && promo.validUntil < now) {
      res.status(400).json({ error: "This promo has expired" });
      return;
    }
    if (promo.maxUses != null && (promo.usedCount || 0) >= promo.maxUses) {
      res.status(400).json({ error: "This promo has reached its usage limit" });
      return;
    }
    if (promo.minBookingValue && bookingValue < promo.minBookingValue) {
      res.status(400).json({
        error: `Minimum booking value is Rs. ${promo.minBookingValue}`,
      });
      return;
    }
    const discount = promo.discountType === "fixed"
      ? Math.min(promo.discountValue, bookingValue)
      : Math.round((bookingValue * promo.discountValue) / 100);
    res.json({
      promo: {
        id: promo.id,
        code: promo.code,
        description: promo.description,
        discountType: promo.discountType,
        discountValue: promo.discountValue,
      },
      discount,
      finalAmount: Math.max(0, bookingValue - discount),
    });
  } catch (e) {
    logger.error({ err: e }, "promo validate error");
    res.status(500).json({ error: "Failed to validate promo code" });
  }
});

// Promo consumption must be tied to an actual booking transaction.
// The current booking schema/workflow has no promotionId/promoCode redemption
// record, so a standalone counter mutation would let any authenticated user
// consume promo inventory without creating a booking.
router.post("/redeem", requireAuth, async (_req: AuthRequest, res: Response) => {
  res.status(409).json({
    error: "Promo redemption is available only through a booking transaction.",
    code: "PROMO_REDEMPTION_REQUIRES_BOOKING",
  });
});

export default router;

